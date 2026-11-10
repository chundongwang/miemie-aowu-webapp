"""Versioned, inspectable event reference for a future low-latency online follower.

LRC is retained. Entry candidates are acoustic suggestions, never forced alignment.
Energy is a stem proxy, not a voice-activity classifier. No missing pitch is filled.
"""
from bisect import bisect_left
from collections import defaultdict
import json
from pathlib import Path
from statistics import median
import re

METHOD = 'following-events-v1'


def note_events(frames, duration):
    groups, current = [], []
    for frame in frames:
        if current and (frame[0] - current[-1][0] > .031 or abs(frame[1] - median(f[1] for f in current[-9:])) > .8):
            groups.append(current)
            current = []
        current.append(frame)
    if current:
        groups.append(current)
    notes = []
    for group in groups:
        start, end = group[0][0], min(duration, group[-1][0] + .02)
        if len(group) < 4 or end - start < .075:
            continue
        centre = median(f[1] for f in group)
        notes.append({'id': len(notes), 'start': start, 'end': round(end, 3), 'midi': round(centre, 3),
                      'pitchClass': round(centre) % 12, 'evidenceScore': round(median(f[2] for f in group), 3),
                      'spreadSemitones': round(max(f[1] for f in group)-min(f[1] for f in group), 3),
                      'status': 'estimated', 'onsetMeaning': 'first measured stable pitch, not syllable onset'})
    return notes


def runs(rows, duration):
    result = []
    for row in rows:
        state = 'pitched' if row['acceptedMidi'] is not None else 'unpitched-energy' if row['rms'] >= .002 else 'low-energy'
        t = row['time']
        end = min(duration, round(t+.02, 3))
        if result and result[-1]['state'] == state and t-result[-1]['end'] < .011:
            result[-1]['end'] = end
        else:
            result.append({'start': t, 'end': end, 'state': state})
    return result


def metrics(rows):
    energy = [r for r in rows if r['rms'] >= .002]
    pitched = sum(r['acceptedMidi'] is not None for r in rows)
    accepted_energy = sum(r['acceptedMidi'] is not None for r in energy)
    return {'frames': len(rows), 'pitchedFrames': pitched, 'energyFrames': len(energy),
            'timelineCoverage': round(pitched/len(rows), 4) if rows else None,
            'energyConditionedCoverage': round(accepted_energy/len(energy), 4) if energy else None,
            'detectorConflicts': sum(r['evidence']=='detector-conflict' for r in rows)}


def build_following(reference, evidence, beats, lines, onsets):
    duration = reference['durationSeconds']
    rows = evidence['frames']
    notes = note_events(reference['frames'], duration)
    times = [r['time'] for r in rows]
    def between(a, b):
        return rows[bisect_left(times, a):bisect_left(times, b)]
    line_rows = []
    phrases = []
    texts = defaultdict(list)
    for i, line in enumerate(lines):
        if not line['text'].strip():
            continue
        start = line['time']
        # Never treat the entire instrumental gap after a lyric as sung content.
        end = min(duration, lines[i+1]['time'] if i+1 < len(lines) else duration)
        evidence_end = min(end, start + 8)
        local = between(start, evidence_end)
        measure = metrics(local)
        nearby = sorted([{'time': t, 'offsetSeconds': round(t-start, 3), 'kind': 'vocal-stem-onset'} for t in onsets if abs(t-start) <= .6], key=lambda v: abs(v['offsetSeconds']))[:3]
        supported = [n for n in notes if start-.6 <= n['start'] <= start+.6]
        flags = []
        if not local or not measure['energyFrames']:
            flags.append('no-stem-energy')
        elif (measure['energyConditionedCoverage'] or 0) < .65:
            flags.append('sparse-pitch-reference')
        if not nearby:
            flags.append('no-nearby-acoustic-onset')
        elif len(nearby) > 1:
            flags.append('ambiguous-entry-candidates')
        line_rows.append({'lineIndex': i, 'time': start, 'text': line['text'], 'windowEnd': evidence_end,
                          'quality': measure, 'flags': flags,
                          'entryCandidates': nearby, 'nearbyNoteIds': [n['id'] for n in supported],
                          'timingStatus': 'supplied-lrc-unverified', 'calibratedTime': None})
        phrases.append({'id': len(phrases), 'start': start, 'end': end, 'lineIndex': i,
                        'source': 'LRC line span, not inferred musical phrase', 'section': None})
        normal = re.sub(r'\W', '', line['text']).casefold()
        if normal:
            texts[normal].append(i)
    intervals = runs(rows, duration)
    gaps = [r for r in intervals if r['state']=='unpitched-energy' and r['end']-r['start']>=.12]
    windows = [{'start': round(t, 2), 'end': min(duration, round(t+2, 2)), **metrics(between(t, t+2))}
               for t in range(0, int(duration)+1, 2)]
    return {'version': 1, 'method': METHOD, 'sourceSha256': reference['sourceSha256'],
            'durationSeconds': duration, 'timeCoordinate': 'original audio seconds',
            'verified': False, 'pitchHopSeconds': .02, 'onsetHopSeconds': .01,
            'notes': notes, 'onsets': onsets, 'activityIntervals': intervals,
            'lyricAnchors': line_rows, 'phraseCandidates': phrases,
            'repeatedLyrics': [{'lineIndices': indices, 'status': 'same text; musical equivalence unverified'} for indices in texts.values() if len(indices)>1],
            'sectionBoundaries': [], 'structureStatus': 'unknown; no automatic verse/chorus claims',
            'beatSource': beats['method'], 'downbeats': beats.get('downbeats', []), 'bars': beats.get('bars', []),
            'quality': {**metrics(rows), 'windows': windows, 'pitchedEnergyGaps': gaps,
                        'lyricLinesNeedingReview': sum(bool(l['flags']) for l in line_rows),
                        'automaticFollowingCertified': False,
                        'coverageDenominator': 'Energy in separated stem is a proxy; may include instruments/reverb, not verified sung duration.'}}


def prepare_following(reference_path: Path, evidence_path: Path, beats_path: Path, lines: list,
                      raw_vocals: Path, output: Path) -> dict:
    import librosa
    import numpy as np
    from services.song_preparation.recorded import atomic_write, sha256
    reference = json.loads(reference_path.read_text())
    evidence = json.loads(evidence_path.read_text())
    beats = json.loads(beats_path.read_text())
    if reference['sourceSha256'] != evidence['sourceSha256'] or reference['sourceSha256'] != beats['sourceSha256']:
        raise ValueError('Following assets refer to different source audio')
    y = np.fromfile(raw_vocals, dtype='<f4')
    hop = 220
    strength = librosa.onset.onset_strength(y=y, sr=22050, hop_length=hop)
    frames = librosa.onset.onset_detect(onset_envelope=strength, sr=22050, hop_length=hop, backtrack=False)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    onsets = [round(float(t*hop/22050), 4) for t in frames if rms[min(t,len(rms)-1)] >= .002 and t*hop/22050 < reference['durationSeconds']]
    # A caller may supply a corrected reference: coverage must describe that published
    # reference, not whatever F0 the diagnostic detectors happened to accept.
    frame_times = [f[0] for f in reference['frames']]
    for row in evidence['frames']:
        index = bisect_left(frame_times, row['time'])
        nearby = reference['frames'][max(0,index-1):index+1]
        nearest = min(nearby, key=lambda f: abs(f[0]-row['time'])) if nearby else None
        row['acceptedMidi'] = nearest[1] if nearest and abs(nearest[0]-row['time']) <= .01001 else None
    value = build_following(reference, evidence, beats, lines, onsets)
    value['onsetHopSeconds'] = hop/22050
    value['inputs'] = {'referenceSha256': sha256(reference_path), 'evidenceSha256': sha256(evidence_path),
                       'beatsSha256': sha256(beats_path), 'rawVocalsSha256': sha256(raw_vocals)}
    atomic_write(output, json.dumps(value, ensure_ascii=False, allow_nan=False) + '\n')
    return value
