"""Publish measured pitch inside unambiguous SOFA character intervals for online following."""
import json
import math
from pathlib import Path
from services.song_preparation.recorded import atomic_write, sha256, publish_library

METHOD = 'aligned-performance-v1'


def build_performance(report, reference):
    duration = reference['durationSeconds']
    characters = []
    for line in report['lines']:
        for c in line['candidates'].get('vocals', {}).get('characters', []):
            start, end = c['start'], c['end']
            if not all(math.isfinite(x) for x in (start, end)) or not 0 <= start < end <= duration:
                raise ValueError('Invalid aligned character interval')
            characters.append({**c, 'usable': .04 <= end-start <= 4})
    characters.sort(key=lambda c: (c['start'], c['lineIndex'], c['characterIndex']))
    frames, excluded_overlap = [], 0
    # Keep source timestamps and pitches; no duration repair or pitch interpolation.
    active, cursor = [], 0
    for t, midi, confidence in reference['frames']:
        while cursor < len(characters) and characters[cursor]['start'] <= t:
            active.append(cursor)
            cursor += 1
        active = [i for i in active if characters[i]['end'] > t]
        if len(active) > 1:
            excluded_overlap += 1
        elif len(active) == 1 and characters[active[0]]['usable'] and confidence >= .55:
            frames.append([t, midi, confidence, active[0]])
    if not frames:
        raise ValueError('No unambiguous measured pitch inside aligned lyrics')
    return {'version': 1, 'method': METHOD, 'songId': report['songId'], 'durationSeconds': duration,
            'hopSeconds': reference['hopSeconds'], 'characters': characters, 'frames': frames,
            'quality': {'measuredFrames': len(reference['frames']), 'usableFrames': len(frames),
                        'overlapExcludedFrames': excluded_overlap, 'accuracyCertified': False},
            'provenance': {'alignmentMethod': report['method'], 'audioSha256': report['inputs']['audioSha256'],
                           'lyricsSha256': report['inputs']['lyricsSha256']}}


def publish_performance(root: Path, song_id: str):
    package = root/'songs'/song_id
    track_path = package/'track.json'
    track = json.loads(track_path.read_text())
    media = root/'apps/web/public'
    report_path = media/'media'/f'{song_id}-alignment-review.json'
    report = json.loads(report_path.read_text())
    reference_path = media/track['referenceUrl'].lstrip('/')
    if report['songId'] != song_id or any(sha256(media/track[key].lstrip('/')) != report['inputs'][digest]
        for key, digest in [('audioUrl','audioSha256'),('lyricsUrl','lyricsSha256')]):
        raise ValueError('Alignment belongs to different source material; rerun alignment')
    reference = json.loads(reference_path.read_text())
    if reference.get('sourceSha256') != report['inputs']['audioSha256']:
        raise ValueError('Pitch reference belongs to different audio')
    data = build_performance(report, reference)
    data['provenance'].update(alignmentSha256=sha256(report_path), referenceSha256=sha256(reference_path))
    target = media/'media'/f'{song_id}-performance.json'
    atomic_write(target, json.dumps(data, ensure_ascii=False, allow_nan=False)+'\n')
    track['performanceUrl'] = f'/media/{song_id}-performance.json'
    atomic_write(track_path, json.dumps(track, ensure_ascii=False, indent=2)+'\n')
    manifest_path = package/'preparation.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['track'] = track
    manifest['performance'] = {'method': METHOD, 'quality': data['quality'], 'provenance': data['provenance']}
    for path in (target, track_path):
        manifest['outputs'][str(path.relative_to(root))] = sha256(path)
    atomic_write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    publish_library(root)
    active = root/'songs/active-track.json'
    if active.exists() and json.loads(active.read_text())['id'] == song_id:
        atomic_write(active, track_path.read_text())
    return data['quality']
