import { PitchDetector } from 'pitchy';
import { VOICE_MIN_RMS, usableVoicePitch } from './voice-quality';
import type { VocalFeatures } from '@/features/singing/shared/shared-types';

export type ExtractionProfile = 'default' | 'singing';

/** One reusable detector/window per worker. No audio is retained or uploaded. */
export class FeatureExtractor {
  private readonly size = 2048;
  private readonly samples = new Float32Array(this.size);
  private readonly detector = PitchDetector.forFloat32Array(this.size);
  private previousRms = 0;
  private previousPitch: number | null = null;
  private lastOnsetMs = -Infinity;

  private previousInput = 0;
  private highPass = 0;
  private lowPass = 0;
  private lowPass2 = 0;
  private previousTime = -Infinity;
  private previousRate = 0;

  constructor(private readonly profile: ExtractionProfile = 'default') {
    // Prefer a full fundamental period over an early, almost-as-strong harmonic peak.
    if (profile === 'singing') this.detector.clarityThreshold = .95;
  }

  process(input: Float32Array, sampleRate: number, timestampMs: number): VocalFeatures {
    const started = performance.now();
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
      throw new Error('Unsupported audio sample rate');
    }
    const count = Math.min(input.length, this.size);
    if (sampleRate !== this.previousRate || timestampMs - this.previousTime > 120 || timestampMs <= this.previousTime) {
      this.previousInput = this.highPass = this.lowPass = this.lowPass2 = 0;
      this.samples.fill(0);
    }
    this.previousRate = sampleRate;
    this.previousTime = timestampMs;
    this.samples.copyWithin(0, count);
    const highDecay = Math.exp(-2 * Math.PI * 50 / sampleRate);
    const lowMix = 1 - Math.exp(-2 * Math.PI * 1800 / sampleRate);
    for (let i = 0; i < count; i++) {
      const value = input[input.length - count + i];
      if (this.profile === 'singing') {
        // Remove DC/rumble and high-frequency breath noise before periodicity analysis.
        // Meter RMS remains raw: this never amplifies or fabricates microphone activity.
        this.highPass = highDecay * (this.highPass + value - this.previousInput);
        this.previousInput = value;
        this.lowPass += lowMix * (this.highPass - this.lowPass);
        this.lowPass2 += lowMix * (this.lowPass - this.lowPass2);
        this.samples[this.size - count + i] = this.lowPass2;
      } else this.samples[this.size - count + i] = value;
    }
    let sum = 0;
    for (let i = 0; i < count; i++) sum += input[input.length - count + i] ** 2;
    const rms = Math.sqrt(sum / Math.max(1, count));
    const [pitch, clarity] = rms >= (this.profile === 'singing' ? VOICE_MIN_RMS : .008) ? this.detector.findPitch(this.samples, sampleRate) : [0, 0];
    const accepted = this.profile === 'singing' ? usableVoicePitch(rms, clarity, pitch) : clarity >= .72 && pitch >= 65 && pitch <= 1200;
    const pitchHz = accepted ? pitch : null;
    const pitchChange = pitchHz !== null && this.previousPitch !== null
      && Math.abs(12 * Math.log2(pitchHz / this.previousPitch)) > 0.85;
    const onset = rms > 0.012 && timestampMs - this.lastOnsetMs > 120
      && (rms > Math.max(0.015, this.previousRms * 1.65) || pitchChange);
    if (onset) this.lastOnsetMs = timestampMs;
    this.previousRms = this.previousRms * 0.45 + rms * 0.55;
    if (pitchHz !== null) this.previousPitch = pitchHz;
    if (rms < 0.006) this.previousPitch = null;
    return { timestampMs, pitchHz, pitchConfidence: pitchHz === null ? 0 : clarity, rms, onset,
      processingMs: performance.now() - started };
  }
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
