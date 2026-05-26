// Server-side grading for scribble guesses.
//
// A grade comes from the LLM's closeness score (0..100) crossed with how much
// of the guesser's time budget was spent before this attempt. Faster + closer
// = higher letter. Captured here rather than inline in the route handler so
// the table is easy to scan and tune.

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export const GUESS_TIMER_MS = 90_000; // total guessing budget per scribble

const GRADE_RANK: Record<Grade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

/** Returns the higher of two grades. F wins against null/undefined (treat
 *  a missing prior grade as "no progress yet"). */
export function betterGrade(a: Grade | null | undefined, b: Grade | null | undefined): Grade {
  const ar = a ? GRADE_RANK[a] : -1;
  const br = b ? GRADE_RANK[b] : -1;
  return ar >= br ? (a ?? "F") : (b ?? "F");
}

/** Computes the per-guess letter grade.
 *
 *  closeness — 0..100 from the LLM. ≥95 ≈ exact; ≥75 ≈ same concept;
 *              ≥50 ≈ tangentially related; <50 ≈ unrelated.
 *  timeUsedRatio — 0..1, fraction of GUESS_TIMER_MS spent before this guess. */
export function gradeFor(closeness: number, timeUsedRatio: number): Grade {
  const c = Math.max(0, Math.min(100, closeness));
  const r = Math.max(0, Math.min(1, timeUsedRatio));

  if (c >= 95) {
    if (r < 0.25) return "S";
    if (r < 0.50) return "A";
    if (r < 0.75) return "B";
    return "C";
  }
  if (c >= 75) {
    if (r < 0.25) return "A";
    if (r < 0.50) return "B";
    if (r < 0.75) return "C";
    return "D";
  }
  if (c >= 50) {
    if (r < 0.50) return "C";
    if (r < 0.80) return "D";
    return "F";
  }
  return "F";
}

/** A guess counts as "exact" (game-ending) when the LLM is confident the
 *  player named the answer. We require a slightly looser threshold than
 *  the S-grade boundary so a typo like "宫爆鸡丁" → "宫保鸡丁" still ends
 *  the round. */
export function isExactCloseness(closeness: number): boolean {
  return closeness >= 90;
}
