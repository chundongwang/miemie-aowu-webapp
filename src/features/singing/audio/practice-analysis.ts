import { frameLatency, referenceTimeForFrame } from './audio-sync';
import type { PerformanceReference } from './aligned-performance';
import { inputMidi, type VoiceInputFrame } from './voice-input';
import { performanceFrameAt } from './practice-reference';

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const octaveError = (difference: number) => difference - 12 * Math.round(difference / 12);
export type PracticeExcerpt = { start: number; lineIndex: number; samples: number; pitchScore: number; cents: number; lagSeconds: number; timingError: number | null };
export type PracticeReport = ReturnType<typeof analyzePractice>;

/** Provisional excerpt measurements, not word recognition or a whole-song grade.
 * Align contour independently of absolute pitch; retain lag for rhythm measurement.
 * Never use the live follower's confirmed-only observations as the scoring population.
 */
export function analyzePractice(frames: VoiceInputFrame[], reference: PerformanceReference | null, latencyMs: number | null = null, calibrationProfile?: string) {
  const voiced = frames.filter(f => inputMidi(f) !== null).length;
  const excerpts: PracticeExcerpt[] = [];
  const groups: VoiceInputFrame[][] = [];
  for (const frame of frames) {
    const group = groups.at(-1), previous = group?.at(-1);
    if (!group || !previous || frame.segment !== previous.segment || frame.time - group[0].time >= 3
      || frame.time - previous.time > .25 || frame.songTime! < previous.songTime!
      || Math.abs((frame.songTime! - previous.songTime!) - (frame.time - previous.time) * (frame.playbackSpeed ?? 1)) > .25
      || frame.backingShift !== previous.backingShift || frame.playbackSpeed !== previous.playbackSpeed
      || frame.captureMode !== previous.captureMode || frame.syncProfile !== previous.syncProfile) groups.push([frame]);
    else group.push(frame);
  }
  if (reference) for (const group of groups) {
    // Speakers can contain the original singer. These frames remain visible but ungraded.
    if (group[0].captureMode === 'speakers') continue;
    const valid = group.filter(f => inputMidi(f) !== null && Number.isFinite(f.songTime));
    if (valid.length < 16 || valid.at(-1)!.time - valid[0].time < 1.2) continue;
    const speed = valid[0].playbackSpeed ?? 1;
    const appliedLatency = frameLatency(valid[0], latencyMs, calibrationProfile);
    const candidates = [];
    for (let tick = -30; tick <= 30; tick++) {
      const lagSeconds = tick * .05;
      const pairs = valid.flatMap(f => {
        const ref = performanceFrameAt(reference, (referenceTimeForFrame(f, appliedLatency) ?? -Infinity) - lagSeconds * speed);
        return ref ? [{ frame: f, ref, difference: octaveError(inputMidi(f)! - ref[1] - (f.backingShift ?? 0)) }] : [];
      });
      if (pairs.length < 12 || pairs.length / valid.length < .5) continue;
      const center = median(pairs.map(p => p.difference));
      const residual = pairs.reduce((sum, p) => sum + Math.min(3, Math.abs(octaveError(p.difference - center))), 0) / pairs.length;
      const notes = new Set(pairs.map(p => Math.round(p.ref[1]) % 12)).size;
      const chars = new Set(pairs.map(p => p.ref[3])).size;
      candidates.push({ lagSeconds, pairs, residual, notes, chars, cost: residual + .35 * (1 - pairs.length / valid.length) });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const best = candidates[0];
    const runner = candidates.find(c => best && Math.abs(c.lagSeconds - best.lagSeconds) >= .25);
    if (!best || !runner || best.notes < 3 || best.chars < 2 || best.residual > .8 || runner.cost - best.cost < .08 || Math.abs(best.lagSeconds) >= 1.45) continue;
    const errors = best.pairs.map(p => Math.abs(p.difference) * 100);
    excerpts.push({ start: valid[0].songTime!, lineIndex: reference.characters[best.pairs[0].ref[3]].lineIndex,
      samples: errors.length, pitchScore: Math.round(100 * errors.filter(e => e <= 50).length / errors.length),
      cents: Math.round(median(errors)), lagSeconds: best.lagSeconds + (appliedLatency ?? 0) / 1000,
      timingError: appliedLatency === null ? null : best.lagSeconds });
  }
  const compared = excerpts.reduce((sum, e) => sum + e.samples, 0);
  const pitchScore = compared ? Math.round(excerpts.reduce((sum, e) => sum + e.pitchScore * e.samples, 0) / compared) : null;
  const timed = excerpts.filter(e => e.timingError !== null);
  const timingScore = timed.length
    ? Math.round(100 * timed.filter(e => Math.abs(e.timingError!) <= .15).length / timed.length) : null;
  return { frames: frames.length, voiced, compared, excerpts, pitchScore, timingScore,
    coverage: voiced ? compared / voiced : 0,
    medianLag: excerpts.length ? median(excerpts.map(e => e.lagSeconds)) : null,
    seconds: frames.length ? frames.at(-1)!.time : 0 };
}
