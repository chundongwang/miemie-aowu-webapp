import { usableVoicePitch } from '../perception/voice-quality';

/** Lightweight features only; never microphone PCM. Time is local monotonic seconds. */
export type VoiceInputFrame = { captureTime?: number; arrivalTime?: number; clockSegments?: import('./audio-sync').ClockSegment[]; syncProfile?: string; time: number; rms: number; pitchHz: number | null; confidence: number; segment?: number; songTime?: number; backingShift?: number; playbackSpeed?: number; captureMode?: 'headphones' | 'speakers' };
export const VOICE_HISTORY_SECONDS = 8;
export const VOICE_INPUT_FRESH_SECONDS = .35;
export const PITCH_DISPLAY_HOLD_SECONDS = .25;

/** Presentation only: never fill missing detector frames or feed held notes to scoring.
 * History uses session time; callers must not compare it to performance.now().
 */
export function recentInputPitch(history: VoiceInputFrame[], end: number, live: boolean) {
  const segment = history.at(-1)?.segment;
  for (let i = history.length - 1; i >= 0; i--) {
    const frame = history[i];
    if (frame.segment !== segment) break;
    const age = end - frame.time;
    if (live && age > PITCH_DISPLAY_HOLD_SECONDS) break;
    const midi = inputMidi(frame);
    if (age >= 0 && midi !== null) return { frame, midi, age, held: frame !== history.at(-1) };
  }
  return null;
}

export function inputLevel(rms: number) {
  // Log scale makes quiet input visible without inventing activity in silence.
  return Number.isFinite(rms) && rms > .001 ? Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 60)) : 0;
}

export function inputMidi(frame: VoiceInputFrame | null) {
  return frame && usableVoicePitch(frame.rms, frame.confidence, frame.pitchHz)
    ? 69 + 12 * Math.log2(frame.pitchHz! / 440) : null;
}

export function inputNote(midi: number) {
  const rounded = Math.round(midi);
  return `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

export function pitchSegments(history: VoiceInputFrame[]) {
  const segments: { time: number; midi: number }[][] = [];
  let segment: { time: number; midi: number }[] = [];
  let previousSegment: number | undefined;
  for (const frame of history) {
    const midi = inputMidi(frame);
    if (midi === null || (segment.length && (frame.time - segment[segment.length - 1].time > .18 || previousSegment !== frame.segment))) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (midi !== null) segment.push({ time: frame.time, midi });
    previousSegment = frame.segment;
  }
  if (segment.length) segments.push(segment);
  return segments;
}

/** A song-session archive, independent of microphone/transport lifetimes. */
export class VoiceInputSession {
  private frames: VoiceInputFrame[] = [];
  private previousTime: number | null = null;
  private segment = 0;
  latest: VoiceInputFrame | null = null;
  active = false;
  position = 0;
  version = 0;
  get count() { return this.frames.length; }

  record(frame: VoiceInputFrame | null) {
    if (!frame) {
      if (this.active) { this.active = false; this.previousTime = null; this.segment++; this.version++; }
      return;
    }
    // Bound sampling cost, not session duration: no saved observations expire.
    if (this.previousTime !== null && frame.time - this.previousTime < .05) return;
    this.position += this.previousTime === null ? .05 : frame.time - this.previousTime;
    this.previousTime = frame.time;
    this.latest = frame;
    this.active = true;
    this.frames.push({ ...frame, time: this.position, segment: this.segment });
    this.version++;
  }

  window(end = this.position) {
    const lowerBound = (time: number) => {
      let low = 0, high = this.frames.length;
      while (low < high) { const mid = (low + high) >>> 1; if (this.frames[mid].time < time) low = mid + 1; else high = mid; }
      return low;
    };
    return this.frames.slice(lowerBound(end - VOICE_HISTORY_SECONDS), lowerBound(end + .000001));
  }

  snapshot() { return this.frames.map(frame => ({ ...frame })); }

  reset() {
    this.frames = []; this.previousTime = null; this.segment = 0;
    this.latest = null; this.active = false; this.position = 0; this.version++;
  }
}
