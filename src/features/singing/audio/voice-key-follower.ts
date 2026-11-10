import { usableVoicePitch } from '../perception/voice-quality';

export interface VocalReference {
  version: number;
  hopSeconds: number;
  durationSeconds: number;
  frames: [number, number, number][];
}

export interface KeyObservation {
  /** Immutable original-song location from a confident aligned tracker, when available. */
  referenceTime?: number;
  time: number;
  midi: number | null;
  confidence: number;
  rms: number;
}

export const KEY_DELAYS = Array.from({ length: 14 }, (_, i) => i * .05);
export const KEY_THRESHOLDS = { windowSeconds: 4, minimumCompared: 18, minimumCoverage: .4,
  minimumMatches: 18, minimumSpan: .9, minimumNotes: 2, minimumVoiceRange: .8, minimumScore: .72, minimumMargin: .15, confirmationSeconds: .35 };
export interface KeyCandidate {
  shift: number; score: number; rawScore: number; matches: number; compared: number;
  notes: number; span: number; voiceRange: number; coverage: number; delay: number; ref: number | null;
}
export interface KeyDiagnostics {
  evaluatedAt: number; songTime: number; samples: number; candidates: KeyCandidate[];
  best: KeyCandidate; runner: KeyCandidate; margin: number; blockedBy: string[];
  candidateAge: number; nearestReferenceDistance: number | null;
}

export interface KeyEstimate {
  shift: number | null;
  /** Last confirmed vocal key relative to the original, independent of the backing. */
  detectedShift: number | null;
  keyFresh: boolean;
  confidence: number;
  voiceMidi: number | null;
  referenceMidi: number | null;
  reason?: 'position-pending' | 'no-pitch' | 'reference-gap' | 'collecting' | 'ambiguous' | 'confirming' | 'confirmed';
  referenceCoverage?: number;
  diagnostics?: KeyDiagnostics;
  state: 'listening' | 'matching' | 'following' | 'holding';
}

const semitoneDistance = (a: number, b: number) => Math.abs(((a - b + 6) % 12 + 12) % 12 - 6);

export function validateVocalReference(value: unknown): VocalReference {
  const reference = value as VocalReference;
  if (!reference || reference.version !== 1 || !Number.isFinite(reference.hopSeconds) || reference.hopSeconds <= 0 || reference.hopSeconds > .1
    || !Number.isFinite(reference.durationSeconds) || reference.durationSeconds <= 0 || !Array.isArray(reference.frames) || !reference.frames.length) throw new Error('歌曲旋律参考无效。');
  let previous = -Infinity;
  for (const frame of reference.frames) {
    if (!Array.isArray(frame) || frame.length !== 3 || frame.some(value => !Number.isFinite(value))
      || frame[0] < previous || frame[0] < 0 || frame[0] > reference.durationSeconds + .1 || frame[1] < 20 || frame[1] > 110 || frame[2] < 0 || frame[2] > 1) throw new Error('歌曲旋律参考无效。');
    previous = frame[0];
  }
  return reference;
}

export function nearestVocalReference(reference: VocalReference, time: number): [number, number, number] {
    const frames = reference.frames;
    let low = 0, high = frames.length;
    while (low < high) { const mid = (low + high) >>> 1; if (frames[mid][0] < time) low = mid + 1; else high = mid; }
    const before = frames[Math.max(0, low - 1)], after = frames[Math.min(low, frames.length - 1)];
    return Math.abs(before[0] - time) < Math.abs(after[0] - time) ? before : after;
  }

export function vocalReferenceAt(reference: VocalReference, time: number): [number, number, number] | null {
    const nearest = nearestVocalReference(reference, time);
    return nearest && Math.abs(nearest[0] - time) <= Math.max(.035, reference.hopSeconds * 1.6) && nearest[2] >= .55 ? nearest : null;
  }


/** Infer a global key offset from a phrase, never chase individual uncertain notes. */
export class VoiceKeyFollower {
  private samples: KeyObservation[] = [];
  private candidate: number | null = null;
  private candidateSince = 0;
  private lastChange = -Infinity;
  private lastVoiced = -Infinity;
  private lastTime = -Infinity;
  private lastEvaluation = -Infinity;
  private estimate: KeyEstimate = { shift: null, detectedShift: null, keyFresh: false, confidence: 0, voiceMidi: null, referenceMidi: null, state: 'listening' };

  constructor(private reference: VocalReference, private songTimeAt: (captureTime: number) => number = time => time) {}

  reset() {
    this.samples = [];
    this.candidate = null;
    this.lastChange = this.lastVoiced = this.lastTime = this.lastEvaluation = -Infinity;
    this.estimate = { shift: null, detectedShift: null, keyFresh: false, confidence: 0, voiceMidi: null, referenceMidi: null, state: 'listening' };
  }

  private referenceAt(time: number) { return vocalReferenceAt(this.reference, time); }

  observe(sample: KeyObservation, currentShift: number): KeyEstimate {
    if (!Number.isFinite(sample.time)) return this.estimate;
    if (sample.time < this.lastTime || sample.time - this.lastTime > .8) this.reset();
    this.lastTime = sample.time;
    this.samples = this.samples.filter(item => sample.time - item.time <= KEY_THRESHOLDS.windowSeconds);
    const valid = sample.midi !== null && Number.isFinite(sample.midi) && usableVoicePitch(sample.rms, sample.confidence, 440 * 2 ** ((sample.midi - 69) / 12));
    if (!valid) {
      // Breaths and unvoiced consonants do not erase the recent phrase.
      // Only measured frames enter the rolling window; no held/interpolated notes.
      if (sample.time - this.lastVoiced > 1.2) this.candidate = null;
      return this.estimate = { ...this.estimate, shift: null, keyFresh: false, voiceMidi: null, state: 'holding', reason: 'no-pitch' };
    }
    this.lastVoiced = sample.time;
    this.samples.push(sample);
    if (sample.time - this.lastEvaluation < .1) return { ...this.estimate, shift: null, voiceMidi: sample.midi };
    this.lastEvaluation = sample.time;
    const candidates: KeyCandidate[] = [];
    for (let shift = -6; shift <= 6; shift++) {
      let best: KeyCandidate = { shift, score: 0, rawScore: 0, matches: 0, compared: 0, notes: 0, span: 0, voiceRange: 0, coverage: 0, delay: 0, ref: null };
      // A single timing offset per phrase, accounting for output buffering and human lag.
      for (const delay of (this.samples.every(item => item.referenceTime !== undefined) ? [0] : KEY_DELAYS)) {
        let score = 0, matches = 0, compared = 0, first = Infinity, last = -Infinity, lowestVoice = Infinity, highestVoice = -Infinity;
        const notes = new Set<number>();
        let firstVoice: number | null = null;
        for (const item of this.samples) {
          const reference = this.referenceAt(item.referenceTime ?? this.songTimeAt(item.time - delay));
          if (!reference) continue;
          compared++;
          const distance = semitoneDistance(item.midi!, reference[1] + shift);
          score += Math.max(0, 1 - distance / .9);
          if (distance <= .65) { firstVoice ??= item.midi!; const relativeVoice = ((item.midi! - firstVoice + 6) % 12 + 12) % 12 - 6; lowestVoice = Math.min(lowestVoice, relativeVoice); highestVoice = Math.max(highestVoice, relativeVoice); matches++; notes.add(Math.round(reference[1]) % 12); first = Math.min(first, item.time); last = item.time; }
        }
        // Missing reference is unknown, not a wrong note. Require substantial coverage
        // and an absolute sample minimum before scoring, so tiny islands cannot win.
        const coverage = compared / Math.max(1, this.samples.length);
        const rawScore = score / Math.max(1, compared);
        score = compared >= KEY_THRESHOLDS.minimumCompared && coverage >= KEY_THRESHOLDS.minimumCoverage ? rawScore : 0;
        if (score > best.score || (score === best.score && coverage > best.coverage)) best = { shift, score, rawScore, compared, delay, matches, notes: notes.size, span: matches ? last - first : 0, voiceRange: matches ? highestVoice - lowestVoice : 0, coverage, ref: this.referenceAt(sample.referenceTime ?? this.songTimeAt(sample.time - delay))?.[1] ?? null };
      }
      candidates.push(best);
    }
    // +/-6 are the same pitch class. Prefer the closest register to the current setting.
    candidates.sort((a, b) => b.score - a.score || Math.abs(a.shift - currentShift) - Math.abs(b.shift - currentShift));
    const best = candidates[0];
    const runner = candidates.find(item => semitoneDistance(item.shift, best.shift) > .1)!;
    const margin = best.score - runner.score;
    const blockedBy = [
      best.compared < KEY_THRESHOLDS.minimumCompared && 'compared',
      best.coverage < KEY_THRESHOLDS.minimumCoverage && 'coverage',
      best.matches < KEY_THRESHOLDS.minimumMatches && 'matches',
      best.span < KEY_THRESHOLDS.minimumSpan && 'span',
      best.notes < KEY_THRESHOLDS.minimumNotes && 'notes',
      best.voiceRange < KEY_THRESHOLDS.minimumVoiceRange && 'voice-range',
      best.score < KEY_THRESHOLDS.minimumScore && 'score',
      margin < KEY_THRESHOLDS.minimumMargin && 'margin',
    ].filter((gate): gate is string => typeof gate === 'string');
    const clear = blockedBy.length === 0;
    const comparedTime = sample.referenceTime ?? this.songTimeAt(sample.time - best.delay);
    const diagnostics: KeyDiagnostics = {
      evaluatedAt: sample.time, songTime: this.songTimeAt(sample.time), samples: this.samples.length,
      best, runner, candidates, margin, blockedBy, candidateAge: 0,
      nearestReferenceDistance: Math.abs(nearestVocalReference(this.reference, comparedTime)[0] - comparedTime),
    };
    let shift: number | null = null;
    let detectedShift = this.estimate.detectedShift;
    let keyFresh = false;
    if (clear) {
      if (this.candidate !== best.shift) { this.candidate = best.shift; this.candidateSince = sample.time; }
      if (sample.time - this.candidateSince >= KEY_THRESHOLDS.confirmationSeconds) {
        detectedShift = best.shift;
        keyFresh = true;
      }
      if (best.shift !== currentShift && sample.time - this.candidateSince >= KEY_THRESHOLDS.confirmationSeconds && sample.time - this.lastChange >= 2) {
        shift = best.shift;
        this.lastChange = sample.time;
        this.samples = [];
        this.candidate = null;
      }
    } else this.candidate = null;
    diagnostics.candidateAge = clear ? sample.time - this.candidateSince : 0;
    const reason = keyFresh ? 'confirmed' : clear ? 'confirming' : best.coverage < .4 ? 'reference-gap' : best.compared < KEY_THRESHOLDS.minimumCompared || this.samples.length < KEY_THRESHOLDS.minimumCompared ? 'collecting' : 'ambiguous';
    return this.estimate = { shift, detectedShift, keyFresh, confidence: best.score, voiceMidi: sample.midi, referenceMidi: best.ref, reason, referenceCoverage: best.coverage, diagnostics,
      state: clear ? 'following' : this.samples.length > 5 ? 'matching' : 'listening' };
  }
}
