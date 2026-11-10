#!/usr/bin/env python3
"""Add/repair beat maps for the existing library without re-running stem separation."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT, atomic_write, publish_library, sha256
from services.song_preparation.beats import prepare_beats


def main():
    for package in sorted((ROOT / 'songs').glob('*/track.json')):
        track = json.loads(package.read_text())
        if len(sys.argv) > 1 and track['id'] not in sys.argv[1:]:
            continue
        audio = ROOT / 'apps/web/public' / track['audioUrl'].lstrip('/')
        target = ROOT / 'apps/web/public/media' / f"{track['id']}-beats.json"
        if target.exists() and json.loads(target.read_text()).get('method', '').startswith('beat-this-'):
            print(f"{track['id']}: keeping neural beat map; use prepare:library to update", flush=True)
            continue
        result = prepare_beats(audio, target, ROOT / 'private-audio/beats', sha256(audio))
        track['beatsUrl'] = f"/media/{track['id']}-beats.json"
        atomic_write(package, json.dumps(track, ensure_ascii=False, indent=2) + '\n')
        manifest_path = package.with_name('preparation.json')
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            manifest['outputs'][str(target.relative_to(ROOT))] = sha256(target)
            manifest['outputs'][str(package.relative_to(ROOT))] = sha256(package)
            manifest['track'] = track
            # Preserve the original pipeline version; don't certify unexecuted migration steps.
            atomic_write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        active_path = ROOT / 'songs/active-track.json'
        if active_path.exists() and json.loads(active_path.read_text()).get('id') == track['id']:
            atomic_write(active_path, json.dumps(track, ensure_ascii=False, indent=2) + '\n')
        print(f"{track['id']}: {len(result['beats'])} beats; meter unknown", flush=True)
    publish_library(ROOT)

if __name__ == '__main__':
    main()
