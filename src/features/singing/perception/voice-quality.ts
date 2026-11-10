/** Shared acceptance for measured singing pitches, not a probability of vocal identity. */
export const VOICE_MIN_RMS = .0015;
export const VOICE_MIN_CLARITY = .8;
export function usableVoicePitch(rms: number, confidence: number, pitchHz: number | null) {
  return Number.isFinite(rms) && rms >= VOICE_MIN_RMS && Number.isFinite(confidence)
    && confidence >= VOICE_MIN_CLARITY && pitchHz !== null && Number.isFinite(pitchHz)
    && pitchHz >= 65 && pitchHz <= 1200;
}
