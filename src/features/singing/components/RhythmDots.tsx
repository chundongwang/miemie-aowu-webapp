/** A compact duration cue. One pip = one quarter of the estimated beat. */
const patterns: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8], 8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

export function RhythmDots({ duration }: { duration: number | null }) {
  const valid = duration !== null && Number.isFinite(duration) && duration > 0;
  const count = valid ? Math.max(1, Math.round(duration * 4)) : 0;
  const short = valid && duration < .125;
  const dots = patterns[count] ?? Array.from({ length: Math.min(count, 16) }, (_, i) => i);
  return <svg className="rhythm-dots" viewBox="0 0 28 28" aria-hidden="true" data-dots={count}>
    {count === 0 ? <path d="M11 14h6" stroke="currentColor" strokeWidth="1.5" opacity=".4"/> : dots.map((cell, i) =>
      <circle key={i} cx={count <= 9 ? 6 + (cell % 3) * 8 : 5 + (cell % 4) * 6}
        cy={count <= 9 ? 6 + Math.floor(cell / 3) * 8 : 5 + Math.floor(cell / 4) * 6}
        r={short ? 1.4 : 2.5} fill="currentColor"/>
    )}
    {count > 16 && <path d="M23 24h5m-2.5-2.5v5" stroke="currentColor" strokeWidth="1"/>}
  </svg>;
}
