#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if command -v uv >/dev/null 2>&1; then
  if [ ! -x .audio-venv/bin/python ]; then uv venv --python 3.12 .audio-venv; fi
  uv pip install --python .audio-venv/bin/python -r services/song_preparation/requirements-audio.txt
else
  if [ ! -x .audio-venv/bin/python ]; then python3.12 -m venv .audio-venv; fi
  .audio-venv/bin/python -m pip install -r services/song_preparation/requirements-audio.txt
fi
# Pitchy's refinement step uses this project's Node dependencies.
node --input-type=module -e "await import('pitchy')" # supplied by the host app
