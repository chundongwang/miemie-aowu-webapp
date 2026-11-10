import { usableVoicePitch } from '../perception/voice-quality';
import { vocalReferenceAt, type KeyObservation, type VocalReference } from './voice-key-follower';

export const TEMPO_LIMITS = { window: 6, evaluationInterval: .5, score: .7, coverage: .45, confirmation: 1.5, maximumChange: .05, minimumRateMargin: .05 };
export interface TempoEstimate {
  ageSeconds?: number;
  mode?: "aligned"; positionReady?: boolean; referencePosition?: number; characterIndex?: number | null;
  action?: "phase" | "tempo" | "steady"; phaseError?: number; singerRate?: number;
  at: number; state: 'collecting' | 'holding' | 'estimating' | 'ready';
  lag: number | null; drift: number; ratio: number; score: number; coverage: number;
  rateSpread: number; timingMargin: number; zeroRateMargin: number; samples: number; blockedBy: string[];
}
type Sample = KeyObservation & { songTime: number };
type Candidate = { lag: number; drift: number; score: number; coverage: number; notes: number };
export const emptyTempo = (): TempoEstimate => ({ at: 0, state: 'collecting', lag: null, drift: 0, ratio: 1, score: 0, coverage: 0, rateSpread: 1, timingMargin: 0, zeroRateMargin: 0, samples: 0, blockedBy: ['collecting'] });

/** Joint phrase alignment and rate estimation, independent of confirmed key.
 * A constant audio/device delay changes lag but cannot itself request a speed change.
 * Stored source positions account for any playback ramps during the observation window.
 */
export class VocalTempoFollower {
  private samples: Sample[] = [];
  private lastEvaluation = -Infinity;
  private direction: number | null = null;
  private since = 0;
  private estimate = emptyTempo();
  constructor(private reference: VocalReference) {}
  reset() { this.samples = []; this.lastEvaluation = -Infinity; this.direction = null; this.estimate = emptyTempo(); }
  observe(sample: KeyObservation, songTime: number, speed: number): TempoEstimate {
    if (this.samples.length && (sample.time < this.samples.at(-1)!.time || sample.time - this.samples.at(-1)!.time > 1)) this.reset();
    this.samples = this.samples.filter(s => sample.time - s.time <= TEMPO_LIMITS.window);
    const valid = sample.midi !== null && usableVoicePitch(sample.rms, sample.confidence, 440 * 2 ** ((sample.midi - 69) / 12));
    if (!valid) {
      if (!this.samples.length || sample.time - this.samples.at(-1)!.time > .6) this.direction = null;
      return this.estimate = { ...this.estimate, state: 'holding', blockedBy: ['no-pitch'] };
    }
    // Bound work regardless of microphone feature frame rate.
    if (!this.samples.length || sample.time - this.samples.at(-1)!.time >= .065) this.samples.push({ ...sample, songTime });
    if (sample.time - this.lastEvaluation < TEMPO_LIMITS.evaluationInterval) return this.estimate;
    this.lastEvaluation = sample.time;
    if (this.samples.length < 35 || sample.time - this.samples[0].time < 4) return this.estimate = { ...emptyTempo(), at: sample.time, samples: this.samples.length };
    const candidates: Candidate[] = [];
    for (let step = -5; step <= 5; step++) {
      const drift = step * .02 * speed;
      for (let offset = -48; offset <= 48; offset++) {
        const lag = offset * .025;
        const scores = new Float64Array(12);
        const notes = new Set<number>();
        let compared = 0;
        for (const item of this.samples) {
          const reference = vocalReferenceAt(this.reference, item.songTime - lag + (item.time - sample.time) * drift);
          if (!reference) continue;
          compared++; notes.add(Math.round(reference[1]) % 12);
          const difference = ((item.midi! - reference[1]) % 12 + 12) % 12;
          const floor = Math.floor(difference), fraction = difference - floor;
          scores[floor] += Math.max(0, 1 - fraction / .9);
          scores[(floor + 1) % 12] += Math.max(0, 1 - (1 - fraction) / .9);
        }
        const coverage = compared / this.samples.length;
        candidates.push({ lag, drift, score: compared >= 25 && coverage >= TEMPO_LIMITS.coverage ? Math.max(...scores) / compared : 0, coverage, notes: notes.size });
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.coverage - a.coverage || Math.abs(a.drift) - Math.abs(b.drift));
    const best = candidates[0];
    const near = candidates.filter(c => c.score >= best.score - .025);
    const rateSpread = (Math.max(...near.map(c => c.drift)) - Math.min(...near.map(c => c.drift))) / speed;
    const otherTiming = candidates.find(c => Math.abs(c.lag - best.lag) >= .25);
    const zeroRateMargin = best.score - (candidates.find(c => c.drift === 0)?.score ?? 0);
    const timingMargin = best.score - (otherTiming?.score ?? 0);
    const blockedBy = [best.coverage < TEMPO_LIMITS.coverage && 'reference-gap', best.score < TEMPO_LIMITS.score && 'melody-match',
      best.notes < 3 && 'melody-variety', Math.abs(best.drift) > .015 * speed && zeroRateMargin < TEMPO_LIMITS.minimumRateMargin && 'rate-evidence', rateSpread > .061 && 'rate-ambiguous', timingMargin < .04 && 'timing-ambiguous',
      Math.abs(best.lag) >= 1.15 && 'search-boundary', Math.abs(best.drift / speed) >= .099 && 'rate-boundary'].filter((x): x is string => typeof x === 'string');
    const direction = Math.abs(best.drift / speed) < .015 ? 0 : Math.sign(best.drift);
    if (blockedBy.length) this.direction = null;
    else if (this.direction !== direction) { this.direction = direction; this.since = sample.time; }
    const ready = !blockedBy.length && sample.time - this.since >= TEMPO_LIMITS.confirmation;
    return this.estimate = { at: sample.time, state: ready ? 'ready' : 'estimating', lag: best.lag,
      drift: best.drift, ratio: 1 + best.drift / speed, score: best.score, coverage: best.coverage,
      rateSpread, timingMargin, zeroRateMargin, samples: this.samples.length, blockedBy: ready ? [] : blockedBy.length ? blockedBy : ['confirming'] };
  }
}

/** Bounded around the user's manual speed, no phase correction and no stopping. */
export function tempoTarget(estimate: TempoEstimate, current: number, base: number): number {
  if (estimate.state !== 'ready' || Math.abs(estimate.ratio - 1) < .015) return current;
  const target = Math.max(.5, base * .95, Math.min(1.5, base * 1.05, current + estimate.drift));
  const rounded = Math.round(Math.max(current - .01, Math.min(current + .01, target)) * 1000) / 1000;
  return Math.max(.5, base * .95, Math.min(1.5, base * 1.05, rounded));
}
