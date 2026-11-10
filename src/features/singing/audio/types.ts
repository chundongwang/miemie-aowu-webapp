export interface PcmFrame {
  samples: Float32Array;
  sampleRate: number;
  /** Audio-clock time relative to the start of this performance. */
  timestampMs: number;
}

export interface AudioMetrics {
  /** Main-thread scheduler wakeup lateness; not measured audible latency. */
  jitterMs: number;
  baseLatencyMs: number;
  outputLatencyMs: number | null;
  sampleRate: number;
  scheduledNotes: number;
  droppedFrames: number;
  currentBeat: number;
  tempoBpm: number;
}

export interface AudioEngineOptions {
  /** Return true when the consumer has taken ownership of samples.buffer. */
  onFrame?: (frame: PcmFrame) => boolean;
  onStatus?: (status: string) => void;
  onMetrics?: (metrics: AudioMetrics) => void;
  onEnded?: () => void;
  onTransport?: (transport: BandTransport) => void;
  onRecordingStatus?: (status: BandRecordingStatus) => void;
  onTakeReady?: (take: RecordedBandTake) => void;
}

export interface BandTransport {
  positionBeats: number;
  elapsedMs: number;
  tempoBpm: number;
  countInRemaining: number;
}

export interface BandRecordingStatus {
  state: 'recording' | 'processing' | 'ready' | 'unavailable' | 'error';
  message?: string;
}

/** Local generated-instrument output only; never includes microphone or guide input. */
export interface RecordedBandTake {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  createdAt: number;
}
