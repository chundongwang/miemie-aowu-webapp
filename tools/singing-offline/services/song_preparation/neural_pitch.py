"""Offline CREPE full-model evidence. Energy gating and fusion are separate."""
from pathlib import Path
import math


def add_crepe(rows, raw_path: Path):
    import librosa
    import numpy as np
    import torch
    import torchcrepe
    from services.song_preparation.recorded import sha256
    torch.set_num_threads(4)
    mono = np.fromfile(raw_path, dtype='<f4')
    y = librosa.resample(mono, orig_sr=22050, target_sr=16000)
    # CPU is portable and deterministic in placement; offline work need not meet audio deadlines.
    pitch, periodicity = torchcrepe.predict(torch.from_numpy(y)[None], 16000, 320, 65, 1100,
                                          'full', batch_size=256, device='cpu',
                                          decoder=torchcrepe.decode.viterbi, return_periodicity=True)
    for i, row in enumerate(rows):
        hz, confidence = float(pitch[0, i]), float(periodicity[0, i])
        row['crepe'] = [69+12*math.log2(hz/440) if math.isfinite(hz) and hz>0 else None,
                        confidence if math.isfinite(confidence) else 0]
    return {'model': 'CREPE full', 'implementation': 'torchcrepe 0.0.24',
            'decoder': 'viterbi per 256-frame batch', 'sampleRate':16000, 'hopSeconds':.02,
            'checkpointSha256': sha256(Path(torchcrepe.__file__).parent / 'assets/full.pth')}
