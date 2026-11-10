#!/usr/bin/env python3
"""One-command local recorded-song preparation; functions live in services.song_preparation.recorded."""
import argparse
import json
from pathlib import Path
import sys
import subprocess

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import prepare_recorded_song


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio', type=Path, required=True)
    parser.add_argument('--lyrics', type=Path, required=True, help='UTF-8 line-timed LRC, including exported calibrations')
    parser.add_argument('--id', dest='song_id', required=True, help='Stable lowercase song slug')
    parser.add_argument('--title', required=True)
    parser.add_argument('--replace', action='store_true', help='Replace materials for an existing song id')
    parser.add_argument('--activate', action='store_true', help='Use the prepared song on the practice page')
    parser.add_argument('--reference', type=Path, help='Reuse an existing reference, verified against audio SHA-256')
    parser.add_argument('--force-reference', action='store_true', help='Recompute pitch reference instead of reusing its JSON')
    parser.add_argument('--align-lyrics', action='store_true', help='Prepare SOFA character alignment and publish online performance reference')
    args = parser.parse_args()
    align = vars(args).pop('align_lyrics')
    try:
        result = prepare_recorded_song(**vars(args))
        if align:
            root = Path(__file__).resolve().parents[1]
            subprocess.run([sys.executable, str(root/'scripts/prepare-performance.py'), args.song_id], check=True, stdout=sys.stderr)
            result = json.loads((root/'songs'/args.song_id/'preparation.json').read_text())
    except Exception as error:
        parser.exit(1, f'Preparation failed: {error}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
