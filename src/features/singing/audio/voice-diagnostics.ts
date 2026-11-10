import type { KeyEstimate, KeyObservation } from './voice-key-follower';

export interface DiagnosticFrame {
  segment: number;
  observation: KeyObservation;
  keyObservation?: KeyObservation;
  captureRate?: number;
  /** Source positions for each KEY_DELAYS entry, preserving speed ramps for replay. */
  referencePositions: number[];
  currentShift: number;
  arrivalAgeMs: number;
  processingMs: number;
  rejected?: string;
  result?: KeyEstimate;
}

/** Feature-only session log. Pauses/seeks add boundaries, never erase history. */
export class VoiceDiagnostics {
  private frames: DiagnosticFrame[] = [];
  private events: { type: string; time: number; details: Record<string, unknown> }[] = [];
  private segment = 0;
  private lastEvaluation = -Infinity;
  private droppedFrames = 0;

  boundary(type: string, time: number, details: Record<string, unknown> = {}) {
    this.segment++;
    this.lastEvaluation = -Infinity;
    this.events.push({ type, time, details });
  }
  event(type: string, time: number, details: Record<string, unknown> = {}) { this.events.push({ type, time, details }); }
  dropped() { this.droppedFrames++; }
  record(frame: Omit<DiagnosticFrame, 'segment'>) {
    const diagnostics = frame.result?.diagnostics;
    const fresh = diagnostics && diagnostics.evaluatedAt !== this.lastEvaluation;
    if (fresh) this.lastEvaluation = diagnostics.evaluatedAt;
    this.frames.push({ ...frame, segment: this.segment, result: frame.result ? { ...frame.result, diagnostics: fresh ? diagnostics : undefined } : undefined });
  }
  snapshot() { return { frames: this.frames.slice(), events: this.events.slice(), droppedFrames: this.droppedFrames }; }
  reset() { this.frames = []; this.events = []; this.segment = 0; this.lastEvaluation = -Infinity; this.droppedFrames = 0; }
}
