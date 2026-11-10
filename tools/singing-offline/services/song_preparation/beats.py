"""Offline beat timestamps. Meter/downbeats stay unknown; no guessed 4/4 labels."""
from pathlib import Path
import json
import math
import os
import subprocess
import tempfile


def valid_map(value: dict, digest: str) -> bool:
    try:
        beats, strengths = value['beats'], value['strength']
        duration = value['durationSeconds']
        return (value['version'] == 1 and value['sourceSha256'] == digest
                and value['method'] == 'librosa-local-tempo-dp-v1'
                and math.isfinite(duration) and duration > 0 and len(beats) == len(strengths)
                and all(math.isfinite(t) and 0 <= t <= duration and (i == 0 or t > beats[i-1]) for i, t in enumerate(beats))
                and all(math.isfinite(s) and 0 <= s <= 1 for s in strengths))
    except (KeyError, TypeError, ValueError):
        return False


def prepare_beats(audio: Path, output: Path, cache: Path, digest: str) -> dict:
    from services.song_preparation.recorded import atomic_write
    cached = cache / f'{digest}-beats-v1.json'
    if cached.exists():
        try:
            value = json.loads(cached.read_text())
        except (OSError, ValueError):
            value = {}
        if valid_map(value, digest):
            atomic_write(output, json.dumps(value) + '\n')
            return value
    os.environ.setdefault('NUMBA_CACHE_DIR', str(cache / 'numba'))
    import imageio_ffmpeg
    import librosa
    import numpy as np
    import soundfile as sf
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache) as directory:
        wav = Path(directory) / 'mono.wav'
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-nostdin', '-v', 'error', '-y', '-i', str(audio), '-ar', '22050', '-ac', '1', str(wav)], check=True)
        y, sr = sf.read(wav, dtype='float32')
    hop = 512
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    # A local tempo curve allows gradual changes; this does not infer musical meter.
    tempo = librosa.feature.tempo(onset_envelope=onset, sr=sr, hop_length=hop, aggregate=None)
    _, frames = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop, bpm=tempo, trim=True)
    times = librosa.frames_to_time(frames, sr=sr, hop_length=hop)
    scale = max(float(np.percentile(onset, 95)), 1e-6)
    value = {'version': 1, 'sourceSha256': digest, 'method': 'librosa-local-tempo-dp-v1',
             'durationSeconds': len(y) / sr, 'meter': None, 'downbeats': [],
             'beats': [round(float(t), 4) for t in times],
             'strength': [round(float(min(1, onset[f] / scale)), 3) for f in frames],
             'note': 'Estimated beats, not verified notation. Half/double tempo ambiguity is possible; meter and downbeats are unknown.'}
    atomic_write(cached, json.dumps(value) + '\n')
    atomic_write(output, json.dumps(value) + '\n')
    return value
