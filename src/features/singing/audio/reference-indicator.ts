import { vocalReferenceAt, type VocalReference } from './voice-key-follower';
import type { VoiceInputFrame } from './voice-input';
export type ReferenceState = 'available' | 'gap' | 'unknown';
export function referenceState(reference: VocalReference | null, songTime: number | undefined): ReferenceState {
  if (!reference || songTime === undefined || !Number.isFinite(songTime) || songTime < 0) return 'unknown';
  return vocalReferenceAt(reference, songTime) ? 'available' : 'gap';
}

/** Preserve the recorded source position; never remap saved samples after a seek or speed change. */
export function referenceIndicators(history: VoiceInputFrame[], reference: VocalReference | null) {
  return history.map((frame, index) => {
    const next = history[index + 1];
    const continuous = next && next.segment === frame.segment && next.time - frame.time <= .18;
    return { time: frame.time, end: continuous ? next.time : frame.time + .04,
      songTime: frame.songTime, state: referenceState(reference, frame.songTime) };
  });
}
