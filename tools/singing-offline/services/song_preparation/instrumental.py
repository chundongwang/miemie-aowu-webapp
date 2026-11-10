"""Build an aligned two-stem accompaniment from a cached Demucs vocal estimate."""
from pathlib import Path
import subprocess


def prepare_instrumental(audio: Path, cache: Path, output: Path, audio_hash: str) -> dict:
    import imageio_ffmpeg
    import numpy as np
    import soundfile as sf

    vocal_path = cache / f'{audio_hash[:12]}-vocals.wav'
    original_path = cache / f'{audio_hash[:12]}-original.wav'
    if not original_path.exists():
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-nostdin', '-v', 'error', '-y', '-i', str(audio), '-ar', '44100', '-ac', '2', str(original_path)], check=True)
    original, rate = sf.read(original_path, dtype='float32', always_2d=True)
    vocals, vocal_rate = sf.read(vocal_path, dtype='float32', always_2d=True)
    if rate != vocal_rate or original.shape != vocals.shape:
        raise ValueError('Cached original and vocal stem are not sample-aligned; regenerate stems.')
    # Two-stem residual retains drums/bass/other without introducing a new encoder delay.
    residual = original - vocals
    if not np.all(np.isfinite(residual)):
        raise ValueError('Non-finite samples in separated accompaniment.')
    peak = float(np.max(np.abs(residual)))
    gain = min(1.0, .98 / max(peak, 1e-9))
    sf.write(output, residual * gain, rate, subtype='PCM_24')
    return {'method': 'original minus aligned htdemucs vocal estimate', 'sampleRate': rate,
            'samples': len(residual), 'gain': gain, 'quality': 'May retain vocals/reverb or remove some instruments; not manually verified.'}
