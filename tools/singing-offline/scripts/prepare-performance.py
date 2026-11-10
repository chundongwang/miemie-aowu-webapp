#!/usr/bin/env python3
"""Prepare/cache alignment and publish online performance references for selected/all songs."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT
from services.song_preparation.performance import publish_performance

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='*')
    args = parser.parse_args()
    known = [t['id'] for t in json.loads((ROOT/'songs/library.json').read_text())]
    if set(args.ids)-set(known): parser.error('Unknown song id')
    for sid in args.ids or known:
        subprocess.run([sys.executable, str(ROOT/'scripts/align-song-lyrics.py'), sid], check=True)
        print(sid, publish_performance(ROOT, sid), flush=True)

if __name__ == '__main__': main()
