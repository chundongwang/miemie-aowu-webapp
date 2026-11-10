"""Reusable local recorded-song import workflow. No audio is sent to a service."""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

PIPELINE_VERSION = 5
ROOT = Path(__file__).resolve().parents[2]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def parse_lyrics(text: str, duration: float) -> list[dict]:
    """Normalize line-level LRC, expanding repeated timestamps and applying offset once."""
    offsets = re.findall(r'\[offset:([+-]?\d+)\]', text, re.I)
    offset = int(offsets[-1]) / 1000 if offsets else 0
    pattern = r'\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]'
    lines = []
    for row in text.splitlines():
        for tag in re.findall(r'\[[^]]*\]', row):
            if re.match(r'\[\d+:', tag) and not re.fullmatch(pattern, tag):
                raise ValueError(f'Invalid LRC timestamp: {tag}')
        stamps = re.findall(pattern, row)
        if not stamps:
            if re.search(r'\[\d+:', row):
                raise ValueError(f'Invalid LRC timestamp: {row[:80]}')
            continue
        lyric = re.sub(r'\[[^]]*\]', '', row).strip()
        for minute, second, fraction in stamps:
            if int(second) >= 60:
                raise ValueError(f'Invalid LRC seconds: {row[:80]}')
            time = round(int(minute) * 60 + int(second) + float('0.' + (fraction or '0')) + offset, 2)
            if time < 0 or time > duration:
                raise ValueError(f'LRC timestamp {time:.2f}s is outside audio duration {duration:.2f}s')
            lines.append({'time': time, 'text': lyric})
    if not lines or not any(line['text'] for line in lines):
        raise ValueError('LRC has no timed lyrics. Supply UTF-8 LRC with line timestamps.')
    return sorted(lines, key=lambda line: line['time'])


def write_lrc(lines: list[dict], path: Path) -> None:
    def row(line):
        ticks = round(line['time'] * 100)
        return f"[{ticks // 6000:02d}:{ticks // 100 % 60:02d}.{ticks % 100:02d}]{line['text']}"
    path.write_text('\n'.join(row(line) for line in lines) + '\n', encoding='utf-8')


def strip_leading_credits(lines: list[dict], title: str) -> list[dict]:
    """Skip explicit early credits, never retime lyrics or modify the source LRC."""
    first = 0
    for line in lines:
        text = line['text'].strip()
        title_card = text == title or bool(re.fullmatch(
            r'(?:.+\s[-–—]\s*' + re.escape(title) + '|' + re.escape(title) + r'\s*[-–—]\s.+)', text))
        credit = bool(re.match(
            r'^(词|詞|曲|作词|作詞|作曲|编曲|編曲|制作人|製作人|吉他|Bass|鼓|和声编写|和聲編寫|和声|和聲|'
            r'人声录音|人聲錄音|乐器录音|樂器錄音|音频编辑|音頻編輯|混音/母带|混音/母帶|全景声混音|'
            r'录音棚|錄音棚|音乐总监|音樂總監|制作统筹|製作統籌|企划A&R|企划统筹|企劃統籌|出品人|出品)\s*[:：]', text))
        if line['time'] > 60 or not (title_card or credit):
            break
        first += 1
    result = lines[first:]
    if not any(line['text'] for line in result):
        raise ValueError('LRC contains only title/credit cards, no sung lyrics.')
    return result


def validate_reference(path: Path, audio_hash: str) -> bool:
    try:
        value = json.loads(path.read_text())
        frames = value['frames']
        duration = value['durationSeconds']
        if value.get('version') != 1 or value.get('sourceSha256') != audio_hash or not math.isfinite(duration) or duration <= 0 or not frames:
            return False
        previous = -1
        for frame in frames:
            if len(frame) != 3 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in frame):
                return False
            time, midi, confidence = frame
            if time <= previous or not 0 <= time <= duration or not 0 <= midi <= 127 or not 0 <= confidence <= 1:
                return False
            previous = time
        return True
    except (OSError, ValueError, KeyError, TypeError):
        return False


def cache_matches(manifest: dict, inputs: dict, root: Path) -> bool:
    if not isinstance(manifest, dict):
        return False
    if manifest.get('pipelineVersion') != PIPELINE_VERSION or manifest.get('inputs') != inputs or not manifest.get('outputs'):
        return False
    try:
        return all((root / name).is_file() and sha256(root / name) == digest for name, digest in manifest['outputs'].items())
    except OSError:
        return False


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as stream:
        pending = Path(stream.name)
        stream.write(text)
    try:
        pending.replace(path)
    finally:
        pending.unlink(missing_ok=True)



def publish_library(root: Path) -> None:
    """Refresh the local recorded-song catalog after either a fresh or cached import."""
    tracks = []
    for path in sorted((root / 'songs').glob('*/track.json')):
        track = json.loads(path.read_text(encoding='utf-8'))
        if all(key in track for key in ('id', 'title', 'audioUrl', 'lyricsUrl', 'referenceUrl', 'durationSeconds')):
            tracks.append(track)
    atomic_write(root / 'songs/library.json', json.dumps(tracks, ensure_ascii=False, indent=2) + '\n')


def prepare_audio(source: Path, staging: Path) -> tuple[Path, float]:
    import imageio_ffmpeg
    import soundfile as sf
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    # Keep browser-native files unchanged, avoiding encoder delay and redundant lossy encoding.
    extension = source.suffix.lower()
    destination = staging / ('audio' + (extension if extension in {'.m4a', '.mp3', '.wav'} else '.m4a'))
    if extension in {'.m4a', '.mp3', '.wav'}:
        shutil.copyfile(source, destination)
    else:
        subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(source), '-vn', '-c:a', 'aac', '-b:a', '192k', str(destination)], check=True)
    decoded = staging / 'duration.wav'
    subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(destination), '-vn', '-ar', '44100', '-ac', '2', str(decoded)], check=True)
    info = sf.info(decoded)
    duration = info.frames / info.samplerate
    decoded.unlink()
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Audio has no decodable duration.')
    return destination, duration


def prepare_recorded_song(*, audio: Path, lyrics: Path, song_id: str, title: str,
                          root: Path = ROOT, replace: bool = False, activate: bool = False,
                          reference: Path | None = None, force_reference: bool = False) -> dict:
    """Import audio/LRC, extract or reuse vocals/F0, then publish a local song package.

    Callable by a future upload handler with server-owned staging paths. IDs are path-safe.
    Activation is explicit; preparation alone never switches the current practice song.
    """
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', song_id) or len(song_id) > 80:
        raise ValueError('Song id must use lowercase letters, numbers and hyphens (max 80).')
    if not title.strip():
        raise ValueError('Song title is required.')
    audio, lyrics, root = audio.resolve(), lyrics.resolve(), root.resolve()
    if not audio.is_file() or not lyrics.is_file():
        raise ValueError('Audio and LRC must both be existing files.')
    lyric_text = lyrics.read_text(encoding='utf-8-sig')
    package = root / 'songs' / song_id
    media = root / 'apps/web/public/media'
    cache = root / 'private-audio/reference'
    manifest_path = package / 'preparation.json'
    inputs = {'audioSha256': sha256(audio), 'lyricsSha256': sha256(lyrics), 'title': title.strip(), 'id': song_id}
    from services.song_preparation.reference import REFERENCE_METHOD
    inputs['processing'] = {'reference': REFERENCE_METHOD, 'following': 'following-events-v1', 'beats': 'beat-this-1.1.0-final0-minimal-v1',
                            'lyrics': 'leading-explicit-credits-v2'}
    if reference:
        inputs['referenceSha256'] = sha256(reference)
    old = {}
    if manifest_path.exists():
        try:
            old = json.loads(manifest_path.read_text())
            if not isinstance(old, dict):
                old = {}
        except (OSError, ValueError):
            old = {}
    if not force_reference and cache_matches(old, inputs, root):
        result = {**old, 'cached': True}
        publish_library(root)
        if activate:
            atomic_write(root / 'songs/active-track.json', (package / 'track.json').read_text())
        return result
    existing = (package / 'track.json').exists()
    # Re-running unchanged input can repair missing outputs; changing input is explicit.
    if existing and not replace and old.get('inputs') != inputs:
        raise ValueError(f'Song {song_id} already exists; use --replace to update its materials.')
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f'prepare-{song_id}-', dir=cache.parent) as work:
        staging = Path(work)
        print('Preparing audio and validating lyric timestamps…', file=sys.stderr, flush=True)
        prepared, duration = prepare_audio(audio, staging)
        lines = strip_leading_credits(parse_lyrics(lyric_text, duration), title)
        normalized_lrc = staging / 'lyrics.lrc'
        write_lrc(lines, normalized_lrc)
        audio_hash = sha256(prepared)
        staged_reference = staging / 'reference.json'
        candidates = [reference] if reference else [cache / f'{audio_hash}-reference.json', media / f'{song_id}-reference.json']
        from services.song_preparation.reference import REFERENCE_METHOD
        evidence_path = cache / f'{audio_hash}-pitch-evidence-v3.json'
        def usable(path):
            return path and validate_reference(path, audio_hash) and (reference is not None or
                (json.loads(path.read_text()).get('algorithmVersion') == REFERENCE_METHOD and evidence_path.exists()))
        reusable = None if force_reference else next((path for path in candidates if usable(path)), None)
        if reference and not reusable and not force_reference:
            raise ValueError('Reference is invalid or belongs to different audio; refusing mismatched pitch data.')
        if reusable:
            print('Reusing validated vocal reference (same audio SHA-256).', file=sys.stderr, flush=True)
            shutil.copyfile(reusable, staged_reference)
        else:
            print('Separating vocals and extracting pitch reference; this can take several minutes…', file=sys.stderr, flush=True)
            env = {**os.environ, 'PYTORCH_ENABLE_MPS_FALLBACK': '1'}
            subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-vocal-reference.py'), str(prepared), str(staged_reference), '--cache', str(cache), *(['--force'] if force_reference else [])], check=True, env=env, stdout=sys.stderr)
        if not validate_reference(staged_reference, audio_hash):
            raise ValueError('No valid vocal reference was produced. Check that the recording contains a clear sung melody.')
        shutil.copyfile(staged_reference, cache / f'{audio_hash}-reference.json')
        if not (cache / f'{audio_hash[:12]}-vocals.wav').exists() or not evidence_path.exists():
            # A supplied reference may not include its separated stems.
            subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-vocal-reference.py'), str(prepared), str(staging / 'stem-reference.json'), '--cache', str(cache)], check=True, env={**os.environ, 'PYTORCH_ENABLE_MPS_FALLBACK': '1'}, stdout=sys.stderr)
        from services.song_preparation.instrumental import prepare_instrumental
        staged_instrumental = staging / 'instrumental.wav'
        print('Preparing sample-aligned accompaniment from separated vocals…', file=sys.stderr, flush=True)
        instrumental_info = prepare_instrumental(prepared, cache, staged_instrumental, audio_hash)
        from services.song_preparation.neural_beats import prepare_neural_beats
        from services.song_preparation.following import prepare_following
        staged_beats = staging / 'beats.json'
        print('Estimating beats/downbeats with Beat This final0…', file=sys.stderr, flush=True)
        prepare_neural_beats(prepared, staged_beats, root / 'private-audio/beats', audio_hash, cache / 'models')
        staged_following = staging / 'following.json'
        print('Preparing note events, acoustic entry candidates and reference quality…', file=sys.stderr, flush=True)
        following = prepare_following(staged_reference, evidence_path, staged_beats, lines,
                                      cache / f'{audio_hash[:12]}-vocals-22050.f32', staged_following)
        track = {'id': song_id, 'title': title.strip(), 'audioUrl': f'/media/{song_id}{prepared.suffix}',
                 'followingUrl': f'/media/{song_id}-following.json',
                 'instrumentalUrl': f'/media/{song_id}-instrumental.wav', 'beatsUrl': f'/media/{song_id}-beats.json',
                 'lyricsUrl': f'/media/{song_id}.lrc', 'referenceUrl': f'/media/{song_id}-reference.json',
                 'durationSeconds': duration, 'sourceType': 'original-mix', 'containsOriginalVocals': True}
        outputs = {}
        media.mkdir(parents=True, exist_ok=True)
        package.mkdir(parents=True, exist_ok=True)
        # All expensive/validating steps finish before changing playable assets.
        for src, target in [(staged_following, media / f'{song_id}-following.json'), (staged_beats, media / f'{song_id}-beats.json'), (prepared, media / f'{song_id}{prepared.suffix}'), (normalized_lrc, media / f'{song_id}.lrc'), (staged_reference, media / f'{song_id}-reference.json'), (staged_instrumental, media / f'{song_id}-instrumental.wav')]:
            pending = target.with_name(target.name + '.pending')
            shutil.copyfile(src, pending)
            pending.replace(target)
            outputs[str(target.relative_to(root))] = sha256(target)
        track_path = package / 'track.json'
        atomic_write(track_path, json.dumps(track, ensure_ascii=False, indent=2) + '\n')
        outputs[str(track_path.relative_to(root))] = sha256(track_path)
        result = {'pipelineVersion': PIPELINE_VERSION, 'inputs': inputs, 'outputs': outputs,
                  'durationSeconds': duration, 'lyricLines': len(lines),
                  'referenceFrames': len(json.loads(staged_reference.read_text())['frames']),
                  'following': {'method': following['method'], 'notes': len(following['notes']), 'quality': {k: v for k, v in following['quality'].items() if k not in ('windows', 'pitchedEnergyGaps')}},
                  'instrumental': instrumental_info, 'referenceReused': bool(reusable), 'lyricTiming': 'supplied LRC; not automatically aligned',
                  'track': track, 'cached': False}
        atomic_write(manifest_path, json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        publish_library(root)
        if activate:
            atomic_write(root / 'songs/active-track.json', track_path.read_text())
        return result
