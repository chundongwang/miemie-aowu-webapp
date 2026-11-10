'use client';

import { useState } from 'react';
import activeTrack from '../songs/active-track.json';
import library from '../songs/library.json';
import RecordedStudio from './RecordedStudio';

export default function RecordedLibrary() {
  const [selectedId, setSelectedId] = useState(activeTrack.id);
  const track = library.find(song => song.id === selectedId) ?? activeTrack;
  // Changing songs disposes the old player/microphone and resets its transient state.
  // Per-song lyric calibration remains in its own local-storage entry.
  return <RecordedStudio key={track.id} track={track} songs={library} onSelectSong={setSelectedId}/>;
}
