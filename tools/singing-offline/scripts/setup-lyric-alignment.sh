#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -x .audio-venv/bin/python ]; then sh scripts/setup-song-preparation.sh; fi
if command -v uv >/dev/null 2>&1; then
  uv pip install --python .audio-venv/bin/python -r services/song_preparation/requirements-alignment.txt
else
  .audio-venv/bin/python -m pip install -r services/song_preparation/requirements-alignment.txt
fi
.audio-venv/bin/python scripts/setup-alignment-assets.py
