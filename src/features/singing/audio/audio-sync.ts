import type { VoiceInputFrame } from './voice-input';
export type ClockSegment = { at: number; position: number; from: number; to: number; ramp: number };
export function mappedPosition(segments: ClockSegment[], time: number) {
  const s = [...segments].reverse().find(s => s.at <= time) ?? segments[0];
  if (!s) return NaN;
  const delta = Math.max(0, time - s.at), ramp = Math.min(delta, s.ramp);
  return s.position + (s.ramp ? s.from * ramp + (s.to-s.from)*ramp*ramp/(2*s.ramp) : 0) + s.to*Math.max(0,delta-s.ramp);
}
export function syncProfile(speed: number, pitch: number, mode: string, epoch = 0) { return `${speed}:${pitch}:${mode}:${epoch}`; }
export function frameLatency(frame: VoiceInputFrame, latency: number | null, profile?: string) {
  return latency !== null && (!profile || frame.syncProfile === profile) ? latency : null;
}
export function referenceTimeForFrame(frame: VoiceInputFrame, latency: number | null, profile?: string) {
  const ms = frameLatency(frame, latency, profile);
  if (ms === null || frame.songTime === undefined) return frame.songTime;
  if (frame.clockSegments?.length && frame.captureTime !== undefined && frame.captureTime-ms/1000 < frame.clockSegments[0].at) return undefined;
  return frame.clockSegments && frame.captureTime !== undefined
    ? mappedPosition(frame.clockSegments, frame.captureTime-ms/1000)
    : frame.songTime - ms/1000*(frame.playbackSpeed ?? 1);
}
/** Map an audio-render timestamp into monotonic browser time, not worker delivery time. */
export function capturePerformanceTime(capture: number, contextNow: number, performanceNow: number) {
  return performanceNow - (contextNow-capture);
}
export function audibleContextTime(context: Pick<AudioContext, 'currentTime'|'baseLatency'|'outputLatency'|'getOutputTimestamp'>, dspMs: number) {
  const stamp = context.getOutputTimestamp?.();
  const output = stamp && typeof stamp.performanceTime === 'number' && typeof stamp.contextTime === 'number' && stamp.performanceTime > 0 && stamp.contextTime > 0
    ? stamp.contextTime + (performance.now()-stamp.performanceTime)/1000
    : context.currentTime - (context.baseLatency || 0) - (context.outputLatency || 0);
  return Math.max(0, Math.min(context.currentTime, output)-dspMs/1000);
}
