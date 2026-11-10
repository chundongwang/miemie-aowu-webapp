"""Evidence fusion for measured vocal F0. No interpolation or octave-folded agreement."""
from collections import Counter
from statistics import median

REFERENCE_METHOD = 'vocal-consensus-v3-crepe'


def fuse_pitch(rows: list[dict], duration: float, digest: str) -> tuple[dict, dict]:
    frames, evidence = [], []
    def consistent(index, midi):
        neighbours = []
        for offset in (-2, -1, 1, 2):
            j = index + offset
            if 0 <= j < len(rows):
                r = rows[j]
                values = [r['pyin']] if r.get('pyin') is not None and r['probability'] >= .35 else []
                values += [p[0] for p in r['periodic'] if p[0] is not None and p[1] >= .8]
                neural = r.get('crepe', [None, 0])
                if neural[0] is not None and neural[1] >= .65:
                    values.append(neural[0])
                neighbours.append(any(abs(p - midi) <= .7 for p in values))
        return sum(neighbours) >= 2
    for i, row in enumerate(rows):
        pitch, score, source = None, 0, 'unknown'
        py = row.get('pyin')
        periodic = [(m, c) for m, c in row['periodic'] if m is not None and c >= .8]
        if row['rms'] >= .002:
            agreeing = [(m, c) for m, c in periodic if py is not None and abs(m - py) <= .5]
            if py is not None and row['probability'] >= .35 and agreeing:
                pitch, score, source = py, max(.65, min(row['probability'], max(c for _, c in agreeing))), 'pyin-periodic-agreement'
            elif len(periodic) == 2 and abs(periodic[0][0] - periodic[1][0]) <= .35:
                m = median(p for p, _ in periodic)
                if (py is None or row['probability'] < .35 or abs(py - m) <= .7) and consistent(i, m):
                    pitch, score, source = m, min(c for _, c in periodic), 'multiwindow-periodic'
                else:
                    source = 'detector-conflict'
            elif py is not None and row['probability'] >= .8 and consistent(i, py):
                # Preserve strong pYIN even when processed vocals have weak periodicity.
                if not any(c >= .95 and abs(m - py) > .7 for m, c in periodic):
                    pitch, score, source = py, row['probability'], 'pyin-temporal'
                else:
                    source = 'detector-conflict'
            neural, certainty = row.get('crepe', [None, 0])
            if pitch is None and neural is not None and source != 'detector-conflict':
                support = (py is not None and row['probability'] >= .1 and abs(py-neural) <= .5) or any(abs(m-neural)<=.5 for m,c in periodic)
                conflict = (py is not None and row['probability'] >= .8 and abs(py-neural)>.7) or any(c>=.95 and abs(m-neural)>.7 for m,c in periodic)
                if not conflict and consistent(i, neural) and ((certainty >= .45 and support) or certainty >= .8):
                    pitch, score, source = neural, max(.6, certainty), 'crepe-corroborated' if support else 'crepe-temporal'
        else:
            source = 'low-energy'
        if pitch is not None:
            frames.append([round(row['time'], 3), round(pitch, 3), round(score, 3)])
        evidence.append({**row, 'acceptedMidi': pitch, 'evidence': source})
    if not frames:
        raise ValueError('No corroborated vocal pitch; retain the previous reference and inspect the stem.')
    return ({'version': 1, 'algorithmVersion': REFERENCE_METHOD, 'sourceSha256': digest,
             'hopSeconds': .02, 'durationSeconds': duration,
             'method': 'htdemucs vocals; CREPE full at 16000 Hz + pYIN and 1024/2048-sample McLeod at 22050 Hz; consensus; no interpolation; unverified',
             'confidenceMeaning': 'Detector evidence score, not a calibrated correctness probability.',
             'frames': frames},
            {'version': 3, 'sourceSha256': digest, 'algorithmVersion': REFERENCE_METHOD,
             'hopSeconds': .02, 'durationSeconds': duration,
             'counts': dict(Counter(r['evidence'] for r in evidence)), 'frames': evidence})
