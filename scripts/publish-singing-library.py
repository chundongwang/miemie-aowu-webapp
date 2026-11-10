#!/usr/bin/env python3
"""Publish prepared song packages into the mobile feature; never modify staging sources."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def publish(source, ffmpeg):
    library = json.loads((source / 'songs/library.json').read_text())
    public = (source / 'apps/web/public').resolve()
    destination = ROOT / 'public/singing/media'
    destination.mkdir(parents=True, exist_ok=True)
    manifest = ROOT / 'src/features/singing/songs/library.json'
    existing = json.loads(manifest.read_text()) if manifest.exists() else []
    merged = {song['id']: song for song in existing}
    def asset(url):
        if not url.startswith('/media/'): raise ValueError('Expected local /media/ asset')
        path = (public / url.lstrip('/')).resolve()
        if not path.is_relative_to(public) or not path.is_file(): raise ValueError(f'Missing or unsafe asset: {url}')
        return path
    # Stage all assets before publishing the new catalog.
    with tempfile.TemporaryDirectory(prefix='singing-publish-') as tmp:
        staging = Path(tmp)
        for song in library:
            if not re.fullmatch(r'[a-z0-9-]+', song['id']): raise ValueError('Invalid song ID')
            reference = json.loads(asset(song['referenceUrl']).read_text())
            if reference.get('sourceSha256') != digest(asset(song['audioUrl'])):
                raise ValueError(f"{song['id']}: reference/audio SHA mismatch")
            if song.get('performanceUrl'):
                performance = json.loads(asset(song['performanceUrl']).read_text())
                for field, key in [('audioSha256', 'audioUrl'), ('lyricsSha256', 'lyricsUrl'), ('referenceSha256', 'referenceUrl')]:
                    if performance['provenance'][field] != digest(asset(song[key])):
                        raise ValueError(f"{song['id']}: {field} mismatch")
            result = dict(song)
            for key in ['audioUrl', 'instrumentalUrl', 'lyricsUrl', 'referenceUrl', 'beatsUrl', 'performanceUrl', 'followingUrl']:
                if not song.get(key): continue
                src = asset(song[key]); name = src.name
                if key == 'instrumentalUrl' and src.suffix == '.wav':
                    if not ffmpeg: raise ValueError('Install ffmpeg or pass --ffmpeg /path/to/ffmpeg')
                    name = src.stem + '.m4a'
                    subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(src), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(staging/name)], check=True)
                else:
                    shutil.copy2(src, staging/name)
                result[key] = '/singing/media/' + name
            merged[song['id']] = result
        # Workers Static Assets limits each file to 25 MiB. Reject before publishing.
        for path in staging.iterdir():
            if path.stat().st_size > 25 * 1024 * 1024:
                raise ValueError(f'{path.name}: exceeds the Cloudflare 25 MiB asset limit')
        for path in staging.iterdir(): shutil.copy2(path, destination/path.name)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    temp = manifest.with_suffix('.tmp')
    temp.write_text(json.dumps(list(merged.values()), ensure_ascii=False, indent=2)+'\n')
    temp.replace(manifest)
    print(f'Published {len(library)} prepared songs; catalog now has {len(merged)} songs.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT/'tools/singing-offline')
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
    args = parser.parse_args()
    publish(args.source.resolve(), args.ffmpeg)
