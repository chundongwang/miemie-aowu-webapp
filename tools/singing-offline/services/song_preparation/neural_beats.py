"""Offline Beat This final0 inference. Cached model output is never human-verified meter."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

METHOD = 'beat-this-1.1.0-final0-minimal-v1'


def prepare_neural_beats(audio: Path, output: Path, cache: Path, digest: str, model_cache: Path) -> dict:
    from services.song_preparation.recorded import atomic_write, sha256
    os.environ.setdefault('TORCH_HOME', str(model_cache.resolve()))
    import torch
    from beat_this.inference import Audio2Frames, load_checkpoint
    from beat_this.model.postprocessor import Postprocessor
    import imageio_ffmpeg
    import soundfile as sf
    torch.set_num_threads(4)
    checkpoint = Path(torch.hub.get_dir()) / 'checkpoints/beat_this-final0.ckpt'
    if not checkpoint.exists():
        load_checkpoint('final0')
    weights_hash = sha256(checkpoint)
    cached = cache / f'{digest}-{METHOD}-{weights_hash[:12]}.json'
    if cached.exists():
        value = json.loads(cached.read_text())
        if value.get('sourceSha256') == digest and value.get('checkpointSha256') == weights_hash and value.get('method') == METHOD:
            validate(value)
            atomic_write(output, json.dumps(value) + '\n')
            return value
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache) as directory:
        decoded = Path(directory) / 'source.wav'
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-nostdin', '-v', 'error', '-y', '-i', str(audio), '-ar', '22050', '-ac', '1', str(decoded)], check=True)
        y, sr = sf.read(decoded, dtype='float32')
    model = Audio2Frames(checkpoint_path=str(checkpoint), device='cpu')
    beat_logits, downbeat_logits = model(y, sr)
    beats, downbeats = Postprocessor(type='minimal')(beat_logits, downbeat_logits)
    duration = len(y) / sr
    beats = [float(t) for t in beats if 0 <= t <= duration]
    downbeats = [float(t) for t in downbeats if 0 <= t <= duration]
    probabilities = beat_logits.sigmoid().cpu().numpy()
    strength = [round(float(probabilities[min(round(t * 50), len(probabilities) - 1)]), 4) for t in beats]
    bars = []
    for start, end in zip(downbeats, downbeats[1:]):
        count = sum(start <= beat < end for beat in beats)
        bars.append({'start': start, 'end': end, 'beatCount': count, 'status': 'estimated',
                     'needsReview': count not in (3, 4)})
    value = {'version': 1, 'sourceSha256': digest, 'method': METHOD, 'checkpoint': 'final0',
             'checkpointSha256': weights_hash, 'durationSeconds': duration,
             'beats': beats, 'strength': strength, 'downbeats': downbeats, 'bars': bars, 'meter': None,
             'verified': False, 'strengthMeaning': 'Model activation; not calibrated timing accuracy.',
             'note': 'Downbeats and bars estimated by Beat This; beatCount is not a time-signature denominator. No inferred 4/4 label.'}
    validate(value)
    atomic_write(cached, json.dumps(value) + '\n')
    atomic_write(output, json.dumps(value) + '\n')
    return value


def validate(value):
    import math
    duration = value['durationSeconds']
    if not math.isfinite(duration) or duration <= 0 or len(value['beats']) < 2:
        raise ValueError('Insufficient neural beat evidence; inspect audio before publishing.')
    for key in ('beats', 'downbeats'):
        times = value[key]
        if any(not math.isfinite(t) or not 0 <= t <= duration or (i and t <= times[i-1]) for i, t in enumerate(times)):
            raise ValueError(f'Invalid {key}')
    if len(value['strength']) != len(value['beats']) or any(not 0 <= v <= 1 for v in value['strength']):
        raise ValueError('Invalid beat strengths')
    if any(t not in value['beats'] for t in value['downbeats']):
        raise ValueError('Downbeats must correspond to beats')
