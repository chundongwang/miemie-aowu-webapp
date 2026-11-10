import type { BandRecordingStatus, RecordedBandTake } from './types';
import { withWebmDuration } from './webm-duration';

interface BandOutput {
  connectOutput(destination: AudioNode): void;
  disconnectOutput(destination: AudioNode): void;
}

interface RecorderOptions {
  onStatus?: (status: BandRecordingStatus) => void;
  onTakeReady?: (take: RecordedBandTake) => void;
  maxDurationMs?: number;
  maxBytes?: number;
}

interface Capture {
  id: number;
  recorder: MediaRecorder;
  destination: MediaStreamAudioDestinationNode;
  chunks: Blob[];
  bytes: number;
  startedAt: number;
  createdAt: number;
  durationMs: number;
  failed: boolean;
  limited: boolean;
  stopTimer: ReturnType<typeof setTimeout> | null;
  limitTimer: ReturnType<typeof setTimeout> | null;
}

/** Encodes only a supplied band bus. It never requests or receives a microphone stream. */
export class BandTakeRecorder {
  private active: Capture | null = null;
  private pending = new Set<Capture>();
  private generation = 0;
  private deliveredGeneration = 0;
  private lastCreatedAt = 0;
  private disposed = false;

  constructor(private context: AudioContext, private output: BandOutput, private options: RecorderOptions = {}) {}

  start() {
    if (this.disposed) return;
    // Complete any fade-tail capture before attaching the next take's output.
    this.stop(0);
    const id = ++this.generation;
    if (typeof MediaRecorder === 'undefined' || typeof this.context.createMediaStreamDestination !== 'function') {
      this.options.onStatus?.({ state: 'unavailable', message: 'This browser cannot save band playback. You can still play live.' });
      return;
    }
    let destination: MediaStreamAudioDestinationNode | null = null;
    try {
      destination = this.context.createMediaStreamDestination();
      const formats = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'];
      const mimeType = formats.find((type) => MediaRecorder.isTypeSupported(type));
      let recorder: MediaRecorder;
      try { recorder = new MediaRecorder(destination.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 }); }
      catch { recorder = new MediaRecorder(destination.stream); }
      this.output.connectOutput(destination);
      const capture: Capture = { id, recorder, destination, chunks: [], bytes: 0,
        startedAt: this.context.currentTime, createdAt: Math.max(Date.now(), this.lastCreatedAt + 1),
        durationMs: 0, failed: false, limited: false, stopTimer: null, limitTimer: null };
      this.lastCreatedAt = capture.createdAt;
      this.active = capture;
      this.pending.add(capture);
      recorder.ondataavailable = ({ data }) => {
        if (this.disposed || capture.failed || !data.size) return;
        // Do not retain an over-limit chunk: long background suspensions can coalesce chunks.
        if (capture.bytes + data.size > (this.options.maxBytes ?? 50 * 1024 * 1024)) {
          capture.failed = true;
          capture.chunks = [];
          this.report(capture, { state: 'error', message: 'This take exceeded the local recording size limit. Your previous take is still available.' });
          this.finish(capture);
          return;
        }
        capture.chunks.push(data);
        capture.bytes += data.size;
      };
      recorder.onerror = () => {
        capture.failed = true;
        capture.chunks = [];
        this.report(capture, { state: 'error', message: 'Band playback could not be saved. Live playing is still available.' });
        this.finish(capture);
      };
      recorder.onstop = () => { void this.complete(capture); };
      recorder.start(1000);
      capture.limitTimer = setTimeout(() => {
        capture.limited = true;
        this.finish(capture);
      }, this.options.maxDurationMs ?? 10 * 60 * 1000);
      this.options.onStatus?.({ state: 'recording' });
    } catch {
      // A browser may advertise a codec but reject capture at runtime.
      if (this.active?.id === id) {
        this.active.failed = true;
        this.cleanup(this.active);
      } else if (destination) {
        try { this.output.disconnectOutput(destination); } catch { /* Connection was not established. */ }
        destination.stream.getTracks().forEach((track) => track.stop());
        destination.disconnect();
      }
      this.options.onStatus?.({ state: 'unavailable', message: 'Band playback is unavailable in this browser. You can still play live.' });
    }
  }

  /** Allow the existing 35 ms voice-cancellation envelope to reach the recording. */
  stop(tailMs = 60) {
    const capture = this.active;
    if (!capture) return;
    if (capture.stopTimer) clearTimeout(capture.stopTimer);
    this.report(capture, { state: 'processing' });
    if (tailMs > 0 && capture.recorder.state === 'recording') {
      capture.stopTimer = setTimeout(() => this.finish(capture), tailMs);
    } else this.finish(capture);
  }

  setPaused(paused: boolean) {
    const recorder = this.active?.recorder;
    if (!recorder) return;
    try {
      if (paused && recorder.state === 'recording') recorder.pause();
      else if (!paused && recorder.state === 'paused') recorder.resume();
    } catch { /* State may change while the browser is interrupting audio. */ }
  }

  private finish(capture: Capture) {
    if (capture.stopTimer) clearTimeout(capture.stopTimer);
    if (capture.limitTimer) clearTimeout(capture.limitTimer);
    capture.stopTimer = capture.limitTimer = null;
    if (this.active === capture) this.active = null;
    capture.durationMs = Math.max(0, (this.context.currentTime - capture.startedAt) * 1000);
    if (!capture.failed) this.report(capture, { state: 'processing' });
    try {
      if (capture.recorder.state !== 'inactive') capture.recorder.stop();
    } catch {
      capture.failed = true;
      this.report(capture, { state: 'error', message: 'Band playback could not be finalized.' });
      this.cleanup(capture);
    }
  }

  private async complete(capture: Capture) {
    // MediaRecorder guarantees its final dataavailable event precedes stop.
    const mimeType = capture.recorder.mimeType || capture.chunks[0]?.type || 'audio/webm';
    let blob = new Blob(capture.chunks, { type: mimeType });
    const valid = !this.disposed && !capture.failed && blob.size > 0 && capture.durationMs > 50;
    this.cleanup(capture);
    if (valid) blob = await withWebmDuration(blob, capture.durationMs);
    if (valid && !this.disposed && capture.id > this.deliveredGeneration) {
      this.deliveredGeneration = capture.id;
      this.options.onTakeReady?.({ blob, mimeType, durationMs: capture.durationMs, createdAt: capture.createdAt });
      this.report(capture, { state: 'ready', ...(capture.limited ? { message: 'The capture limit was reached. Your recorded band audio is ready to play.' } : {}) });
    } else if (!capture.failed && !this.disposed && capture.id === this.generation) {
      this.options.onStatus?.({ state: 'error', message: 'This take was too short to save. Start another session to make a take.' });
    }
  }

  private report(capture: Capture, status: BandRecordingStatus) {
    if (!this.disposed && capture.id === this.generation) this.options.onStatus?.(status);
  }

  private cleanup(capture: Capture) {
    if (capture.stopTimer) clearTimeout(capture.stopTimer);
    if (capture.limitTimer) clearTimeout(capture.limitTimer);
    if (this.active === capture) this.active = null;
    this.pending.delete(capture);
    capture.recorder.ondataavailable = capture.recorder.onstop = capture.recorder.onerror = null;
    capture.chunks = [];
    try { this.output.disconnectOutput(capture.destination); } catch { /* Already detached. */ }
    capture.destination.stream.getTracks().forEach((track) => track.stop());
    capture.destination.disconnect();
  }

  dispose() {
    this.disposed = true;
    for (const capture of this.pending) {
      capture.failed = true;
      try { if (capture.recorder.state !== 'inactive') capture.recorder.stop(); } catch { /* Already stopped. */ }
      this.cleanup(capture);
    }
  }
}
