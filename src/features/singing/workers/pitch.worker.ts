import { FeatureExtractor, type ExtractionProfile } from '../perception/extract-features';
import type { FeatureFrame } from '../perception/feature-pipeline';

let profile: ExtractionProfile = 'default';
let extractor = new FeatureExtractor();
type WorkerInput = (FeatureFrame & { generation: number }) | { type: 'reset' } | { type: 'configure'; profile: ExtractionProfile };
const worker = self as unknown as { onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void };
worker.onmessage = ({ data }) => {
  if ('type' in data) {
    if (data.type === 'configure') profile = data.profile;
    extractor = new FeatureExtractor(profile);
    return;
  }
  const buffer = data.samples.buffer as ArrayBuffer;
  try {
    const features = extractor.process(data.samples, data.sampleRate, data.timestampMs);
    worker.postMessage({ features, buffer, generation: data.generation }, [buffer]);
  } catch (error) {
    worker.postMessage({ error: error instanceof Error ? error.message : 'Feature extraction failed', buffer, generation: data.generation }, [buffer]);
  }
};
