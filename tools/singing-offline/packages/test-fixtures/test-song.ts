import type { SongPackage } from '../shared-types';

export const testSong: SongPackage = {
  id: 'test-scale', title: 'Alignment test motif', artist: 'Synthetic fixture', description: 'Original test phrase',
  key: 'C', tempoBpm: 100, timeSignature: [4, 4], totalBeats: 16, instruments: ['piano'],
  melody: [60, 60, 64, 67, 69, 67, 65, 64, 62, 62, 65, 69, 67, 64, 62, 60]
    .map((midi, beat) => ({ beat, duration: 1, midi })),
  chords: [{ beat: 0, duration: 4, symbol: 'C', midi: [48, 52, 55] },
    { beat: 4, duration: 4, symbol: 'F', midi: [53, 57, 60] },
    { beat: 8, duration: 4, symbol: 'Dm', midi: [50, 53, 57] },
    { beat: 12, duration: 4, symbol: 'G', midi: [55, 59, 62] }],
  sections: [{ name: 'Motif', startBeat: 0, endBeat: 16 }],
  phrases: [{ startBeat: 0, endBeat: 8, text: 'First phrase' }, { startBeat: 8, endBeat: 16, text: 'Second phrase' }],
  provenance: { source: 'Original synthetic fixture', license: 'CC0-1.0', confidence: 1, manuallyCurated: true },
};
