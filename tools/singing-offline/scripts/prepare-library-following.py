#!/usr/bin/env python3
"""Upgrade selected/all recorded songs with v5 offline following assets.

Uses published audio/LRC as materials; keeps old input provenance in upgrade metadata.
The existing reference and manifest are archived locally before replacement.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT, atomic_write, sha256


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='*', help='Omit to process all four library songs')
    args = parser.parse_args()
    tracks = json.loads((ROOT / 'songs/library.json').read_text())
    unknown = set(args.ids) - {t['id'] for t in tracks}
    if unknown:
        parser.error(f'Unknown song ids: {sorted(unknown)}')
    active_path = ROOT / 'songs/active-track.json'
    active = json.loads(active_path.read_text()).get('id') if active_path.exists() else None
    results = []
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    for track in tracks:
        if args.ids and track['id'] not in args.ids:
            continue
        song_id = track['id']
        package = ROOT / 'songs' / song_id
        before = json.loads((package / 'preparation.json').read_text())
        old_ref = ROOT / 'apps/web/public' / track['referenceUrl'].lstrip('/')
        old_frames = len(json.loads(old_ref.read_text())['frames'])
        baseline_frames = before.get('upgrade', {}).get('baselineReferenceFrames', before.get('upgrade', {}).get('previousReferenceFrames', old_frames))
        backup = ROOT / 'private-audio/upgrades' / stamp / song_id
        backup.mkdir(parents=True)
        for path in (old_ref, package / 'preparation.json', package / 'track.json'):
            shutil.copyfile(path, backup / path.name)
        print(f'Preparing {song_id}…', file=sys.stderr, flush=True)
        # Isolate each import's native model/thread pools from the next song.
        command = [sys.executable, str(ROOT / 'scripts/prepare-recorded-song.py'),
                   '--audio', str(ROOT / 'apps/web/public' / track['audioUrl'].lstrip('/')),
                   '--lyrics', str(ROOT / 'apps/web/public' / track['lyricsUrl'].lstrip('/')),
                   '--id', song_id, '--title', track['title'], '--replace']
        if song_id == active:
            command.append('--activate')
        result = json.loads(subprocess.run(command, check=True, stdout=subprocess.PIPE, text=True).stdout)
        if not result['cached']:
            result['upgrade'] = {'previousInputs': before['inputs'], 'previousReferenceFrames': old_frames, 'baselineReferenceFrames': baseline_frames,
                                 'previousReferenceSha256': sha256(backup / old_ref.name),
                                 'backup': str(backup.relative_to(ROOT)), 'note': 'Upgraded published material; LRC times not rewritten.'}
            atomic_write(package / 'preparation.json', json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        results.append({'id': song_id, 'previousFrames': baseline_frames, 'frames': result['referenceFrames'],
                        'cached': result['cached'], 'following': result['following']})
    atomic_write(ROOT / 'test-results/library-following-v5.json', json.dumps(results, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
