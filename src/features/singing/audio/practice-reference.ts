import type { PerformanceReference } from './aligned-performance';
import type { LyricLine } from './lyrics';

export function performanceFrameAt(reference: PerformanceReference | null, time: number) {
  if (!reference || !Number.isFinite(time)) return null;
  const frames = reference.frames;
  let lo = 0, hi = frames.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (frames[mid][0] < time) lo = mid + 1; else hi = mid; }
  const options = [frames[lo - 1], frames[lo]].filter(Boolean);
  const frame = options.sort((a, b) => Math.abs(a[0] - time) - Math.abs(b[0] - time))[0];
  if (!frame) return null;
  const character = reference.characters[frame[3]];
  return time >= character.start && time < character.end && Math.abs(frame[0] - time) <= reference.hopSeconds * 1.3 ? frame : null;
}

export type PracticeLine = LyricLine & { characters: PerformanceReference['characters']; end: number | null };
/** Reviewed model timing drives karaoke. Explicit line edits shift the entire model line.
 * Non-monotonic line starts fall back to LRC; characters are never stretched to fill gaps.
 */
export function practiceLines(source: LyricLine[], times: number[], reference: PerformanceReference | null): PracticeLine[] {
  const grouped = new Map<number, PerformanceReference['characters']>();
  for (const c of reference?.characters ?? []) grouped.set(c.lineIndex, [...(grouped.get(c.lineIndex) ?? []), c]);
  const result = source.map((line, index) => {
    const chars = (grouped.get(index) ?? []).sort((a, b) => a.characterIndex - b.characterIndex);
    const matches = chars.map(c => c.text).join('') === line.text.replace(/[\s\p{P}]/gu, '');
    const start = chars[0]?.start;
    const usable = matches && Number.isFinite(start);
    const edited = times[index] !== undefined && Math.abs(times[index] - line.time) > .001;
    const delta = usable && edited ? times[index] - start : 0;
    return { text: line.text, time: usable ? start + delta : times[index] ?? line.time,
      characters: usable ? chars.map(c => ({ ...c, start: c.start + delta, end: c.end + delta })) : [],
      end: usable ? Math.max(...chars.map(c => c.end)) + delta : null };
  });
  // A fallback can collide with its neighbor's earlier model onset. Resolve to a
  // fixed point, rather than checking only the original candidate array once.
  for (let pass = 0; pass < result.length; pass++) {
    let changed = false;
    for (let index = 1; index < result.length; index++) {
      if (result[index].time > result[index - 1].time) continue;
      for (const i of [index - 1, index]) if (result[i].characters.length) {
        result[i] = { text: source[i].text, time: times[i] ?? source[i].time, characters: [], end: null };
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

/** One foreground glyph, including overlapping model intervals. Never hold it after its end. */
export function activeCharacter(characters: PerformanceReference['characters'], time: number) {
  let active = -1;
  for (let i = 0; i < characters.length; i++) if (time >= characters[i].start && time < characters[i].end
    && (active < 0 || characters[i].start >= characters[active].start)) active = i;
  return active;
}
