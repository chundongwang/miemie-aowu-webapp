"""Exercise a fresh Demucs import on an 8-second local song excerpt, then cache reuse.
Requires the audio environment. Does not change the active song or keep test media.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from services.song_preparation.recorded import prepare_recorded_song
import imageio_ffmpeg

os.environ.setdefault('TORCH_HOME', str(ROOT / 'private-audio/reference/models'))
os.environ.setdefault('NUMBA_CACHE_DIR', str(ROOT / 'private-audio/reference/numba'))
os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
track = json.loads((ROOT / 'songs/active-track.json').read_text())
source = ROOT / 'apps/web/public' / track['audioUrl'].lstrip('/')
with tempfile.TemporaryDirectory(prefix='song-preparation-smoke-', dir=ROOT / 'private-audio') as directory:
    root = Path(directory)
    audio, lyrics = root / 'excerpt.wav', root / 'excerpt.lrc'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(source), '-ss', '20', '-t', '8', '-ac', '2', '-ar', '44100', str(audio)], check=True)
    lyrics.write_text('[00:00.04]Preparation test one\n[00:02.82]Preparation test two\n', encoding='utf-8')
    options = dict(audio=audio, lyrics=lyrics, song_id='preparation-smoke', title='Preparation smoke', root=root)
    first = prepare_recorded_song(**options)
    assert first['referenceFrames'] > 0 and not first['referenceReused']
    assert first['pipelineVersion'] == 5 and first['following']['notes'] > 0
    reference = json.loads((root / 'apps/web/public/media/preparation-smoke-reference.json').read_text())
    assert reference['neuralPitch']['model'] == 'CREPE full'
    following = json.loads((root / 'apps/web/public/media/preparation-smoke-following.json').read_text())
    assert len(following['lyricAnchors']) == 2
    second = prepare_recorded_song(**options)
    assert second['cached']
    lyrics.write_text('[00:00.14]Preparation test one\n[00:02.82]Preparation test two\n', encoding='utf-8')
    third = prepare_recorded_song(**options, replace=True)
    assert third['referenceReused'] and not third['cached']
    assert not (root / 'songs/active-track.json').exists()
    report = {'pipelineVersion': first['pipelineVersion'], 'freshModelReferenceFrames': first['referenceFrames'], 'followingNotes': first['following']['notes'], 'durationSeconds': first['durationSeconds'], 'secondRunCached': second['cached'], 'lyricUpdateReusedReference': third['referenceReused'], 'activeSongUntouched': True}
    (ROOT / 'test-results').mkdir(exist_ok=True)
    (ROOT / 'test-results/song-preparation-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
