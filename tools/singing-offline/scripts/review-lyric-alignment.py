#!/usr/bin/env python3
"""Create the listening comparison and manual timing evaluation page."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from services.song_preparation.recorded import ROOT, atomic_write


def main():
    entries=[]
    for track in json.loads((ROOT/'songs/library.json').read_text()):
        path=ROOT/'apps/web/public/media'/f"{track['id']}-alignment-review.json"
        if path.exists():
            report=json.loads(path.read_text())
            following=json.loads((ROOT/'apps/web/public'/track['followingUrl'].lstrip('/')).read_text())
            entries.append({'track':track,'report':report,'anchors':following['lyricAnchors']})
    if not entries: raise ValueError('Run prepare:align before rendering the review')
    template=(ROOT/'scripts/templates/lyric-alignment-review.html').read_text()
    encoded=json.dumps(entries,ensure_ascii=False,allow_nan=False).replace('<','\\u003c')
    atomic_write(ROOT/'apps/web/public/media/character-playhead.mjs',(ROOT/'scripts/templates/character-playhead.mjs').read_text())
    atomic_write(ROOT/'apps/web/public/media/lyric-alignment-review.html',template.replace('__ALIGNMENT_DATA__',encoded))
    print('Serve this staging workspace: python3 -m http.server 4300 --directory apps/web/public')
    print('http://localhost:4300/media/lyric-alignment-review.html')


if __name__=='__main__': main()
