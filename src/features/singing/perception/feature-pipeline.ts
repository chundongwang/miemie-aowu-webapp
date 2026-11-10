import type { ExtractionProfile } from './extract-features';
import type { VocalFeatures } from '@/features/singing/shared/shared-types';

export interface FeatureFrame { samples: Float32Array; sampleRate: number; timestampMs: number }

/** Single in-flight frame prevents worker queues from adding unbounded latency. */
export class FeaturePipeline {
  private readonly worker: Worker;
  private busy = false;
  private disposed = false;
  private generation = 0;
  constructor(
    onFeatures: (features: VocalFeatures) => void,
    onReleased: (buffer: ArrayBuffer) => void = () => {},
    onError: (message: string) => void = () => {},
    profile: ExtractionProfile = 'default',
  ) {
    this.worker = new Worker(new URL('../workers/pitch.worker.ts', import.meta.url), { type: 'module' });
    this.worker.postMessage({ type: 'configure', profile });
    this.worker.onmessage = ({ data }: MessageEvent<{ features?: VocalFeatures; buffer: ArrayBuffer; generation: number; error?: string }>) => {
      this.busy = false;
      onReleased(data.buffer);
      if (data.error) onError(data.error);
      if (data.features && !this.disposed && data.generation === this.generation) onFeatures(data.features);
    };
    this.worker.onerror = (event) => { this.busy = false; onError(event.message || 'Pitch worker failed'); };
  }
  process(frame: FeatureFrame): boolean {
    if (this.busy || this.disposed) return false;
    this.busy = true;
    this.worker.postMessage({ ...frame, generation: this.generation }, [frame.samples.buffer as ArrayBuffer]);
    return true;
  }
  reset() { this.generation++; this.worker.postMessage({ type: 'reset' }); }
  dispose() { this.disposed = true; this.worker.terminate(); }
}
