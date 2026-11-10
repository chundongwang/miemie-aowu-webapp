"""Local, offline vocal reference extraction for a recorded song (no audio upload)."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.reference import fuse_pitch, REFERENCE_METHOD


def prepare_vocal_reference(audio_path: Path, output: Path, cache: Path, force: bool = False) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault('TORCH_HOME', str(cache.resolve() / 'models'))
    os.environ.setdefault('NUMBA_CACHE_DIR', str(cache.resolve() / 'numba'))

    source_hash = hashlib.sha256(audio_path.read_bytes()).hexdigest()
    vocals_path = cache / f'{source_hash[:12]}-vocals.wav'
    evidence_path = cache / f'{source_hash}-pitch-evidence-v3.json'
    if not force and evidence_path.exists() and vocals_path.exists() and (cache / f'{source_hash[:12]}-vocals-22050.f32').exists():
        saved = json.loads(evidence_path.read_text())
        if saved.get('sourceSha256') == source_hash and saved.get('algorithmVersion') == REFERENCE_METHOD:
            result, _ = fuse_pitch(saved['frames'], saved['durationSeconds'], source_hash)
            result['neuralPitch'] = saved.get('neuralPitch')
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(result, allow_nan=False))
            print('Reused versioned vocal evidence.', flush=True)
            return
    from services.song_preparation.neural_pitch import add_crepe
    prior_path = cache / f'{source_hash}-pitch-evidence-v2.json'
    raw_path = cache / f'{source_hash[:12]}-vocals-22050.f32'
    if not force and prior_path.exists() and raw_path.exists():
        prior = json.loads(prior_path.read_text())
        if prior.get('sourceSha256') == source_hash:
            print('Adding CREPE full-model evidence to cached pYIN / periodicity.', flush=True)
            provenance = add_crepe(prior['frames'], raw_path)
            result, evidence = fuse_pitch(prior['frames'], prior['durationSeconds'], source_hash)
            result['neuralPitch'] = evidence['neuralPitch'] = provenance
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(result, allow_nan=False))
            evidence_path.write_text(json.dumps(evidence, allow_nan=False))
            print(f"Saved {len(result['frames'])} frames: {evidence['counts']}", flush=True)
            return
    import imageio_ffmpeg
    import numpy as np
    import soundfile as sf
    import torch
    import librosa
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    torch.set_num_threads(6)

    if not vocals_path.exists():
        decoded_path = cache / f'{source_hash[:12]}-original.wav'
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-v', 'error', '-i', str(audio_path), '-ar', '44100', '-ac', '2', str(decoded_path)], check=True)
        audio, sample_rate = sf.read(decoded_path, dtype='float32', always_2d=True)
        wav = torch.from_numpy(audio.T.copy())
        print('Loading official htdemucs weights; audio stays local.', flush=True)
        model = get_model('htdemucs')
        model.eval()
        reference = wav.mean(0)
        mean, std = reference.mean(), reference.std()
        if not torch.isfinite(std) or std < 1e-7:
            raise ValueError('Audio is silent or invalid; cannot extract a vocal reference.')
        device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        print(f'Separating vocals on {device}: {len(audio) / sample_rate:.1f} seconds.', flush=True)
        with torch.inference_mode():
            stems = apply_model(model, ((wav - mean) / std)[None], device=device, shifts=0, overlap=0.1, progress=True)[0]
        vocals = (stems[model.sources.index('vocals')].cpu() * std + mean).numpy().T
        sf.write(vocals_path, vocals, sample_rate, subtype='FLOAT')
    else:
        print('Using cached separated vocals.', flush=True)
        vocals, sample_rate = sf.read(vocals_path, dtype='float32', always_2d=True)

    print('Extracting a confidence-scored vocal melody with pYIN.', flush=True)
    mono = librosa.resample(vocals.mean(axis=1), orig_sr=sample_rate, target_sr=22050)
    hop = 441
    f0, voiced, probability = librosa.pyin(mono, fmin=65.4, fmax=1046.5, sr=22050, frame_length=2048, hop_length=hop, fill_na=np.nan)
    rms = librosa.feature.rms(y=mono, frame_length=2048, hop_length=hop)[0]
    rows = []
    for index, (hz, active, confidence) in enumerate(zip(f0, voiced, probability)):
        t = index * hop / 22050
        if t >= len(mono) / 22050:
            break
        rows.append({'time': round(t, 3), 'pyin': float(librosa.hz_to_midi(hz)) if active and np.isfinite(hz) else None,
                     'probability': float(confidence) if np.isfinite(confidence) else 0,
                     'rms': float(rms[index]), 'periodic': []})
    # Keep raw detectors for diagnosis and future fusion changes, rather than throwing them away.
    pending = evidence_path.with_suffix('.pending.json')
    pending.write_text(json.dumps({'frames': rows}, allow_nan=False))
    raw_path = cache / f'{source_hash[:12]}-vocals-22050.f32'
    mono.astype('<f4').tofile(raw_path)
    subprocess.run(['node', str(Path(__file__).resolve().with_name('refine-vocal-reference.mjs')),
                    str(raw_path), str(pending), '22050'], check=True)
    rows = json.loads(pending.read_text())['frames']
    provenance = add_crepe(rows, raw_path)
    result, evidence = fuse_pitch(rows, len(mono) / 22050, source_hash)
    result['neuralPitch'] = evidence['neuralPitch'] = provenance
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False))
    pending.write_text(json.dumps(evidence, allow_nan=False))
    pending.replace(evidence_path)
    print(f"Saved {len(result['frames'])} consensus frames: {evidence['counts']}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audio', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--cache', type=Path, default=Path('private-audio/reference'))
    parser.add_argument('--force', action='store_true', help='Recompute pitch detectors; reuse separated stems.')
    args = parser.parse_args()
    prepare_vocal_reference(args.audio, args.output, args.cache, args.force)


if __name__ == '__main__':
    main()
