import type { SongPackage, VocalFeatures } from '../shared-types';

export interface ReplayOptions {
  tempoScale?: number; drift?: number; transpose?: number; frameMs?: number;
  silenceAtBeat?: number; silenceDurationMs?: number; sustainAtBeat?: number; sustainDurationMs?: number;
}
export interface ReplayFeature { features: VocalFeatures; expectedBeat: number; noteIndex: number }

/** Synthetic F0 observations, not a recording or proof of vocal tracking accuracy. */
export function generateReplayWithTruth(song: SongPackage, options: ReplayOptions = {}): ReplayFeature[] {
  const { tempoScale = 1, drift = 0, transpose = 0, frameMs = 50, silenceAtBeat = 12,
    silenceDurationMs = 0, sustainAtBeat = 6, sustainDurationMs = 0 } = options;
  const frames: ReplayFeature[] = [];
  let timestampMs = 0;
  for (let index = 0; index < song.melody.length; index++) {
    const note = song.melody[index];
    if (note.beat === silenceAtBeat) {
      for (let elapsed = 0; elapsed < silenceDurationMs; elapsed += frameMs) {
        frames.push({ features: { timestampMs, pitchHz: null, pitchConfidence: 0, rms: 0.002, onset: false, processingMs: 0 },
          expectedBeat: note.beat, noteIndex: index }); timestampMs += frameMs;
      }
    }
    const localScale = Math.max(0.5, tempoScale + drift * note.beat / song.totalBeats);
    const durationMs = note.duration * 60000 / (song.tempoBpm * localScale);
    const sustain = note.beat === sustainAtBeat ? sustainDurationMs : 0;
    for (let elapsed = 0; elapsed < durationMs + sustain; elapsed += frameMs) {
      const vibrato = Math.sin(timestampMs / 73) * 0.045;
      frames.push({ features: { timestampMs,
        pitchHz: 440 * 2 ** ((note.midi + transpose + vibrato - 69) / 12),
        pitchConfidence: 0.97, rms: 0.09 + Math.sin(timestampMs / 300) * 0.012,
        onset: elapsed === 0, processingMs: 0 },
        expectedBeat: note.beat + Math.min(note.duration - 0.02, elapsed * song.tempoBpm * localScale / 60000), noteIndex: index });
      timestampMs += frameMs;
    }
  }
  return frames;
}

export const generateReplay = (song: SongPackage, options: ReplayOptions = {}): VocalFeatures[] =>
  generateReplayWithTruth(song, options).map(frame => frame.features);
