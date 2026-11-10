/** Visual range only. Never octave-fold, clamp outliers into notes, or change scoring. */
export function pitchScale(targets: number[], voice: number[], halfSpan: number, manualCenter: number | null = null) {
  const values = (targets.length ? targets : voice).filter(Number.isFinite).sort((a,b)=>a-b);
  const center = manualCenter ?? (values.length ? Math.round(values[Math.floor(values.length / 2)] / 3) * 3 : 60);
  const low = halfSpan === 0 ? 36 : center - halfSpan;
  const high = halfSpan === 0 ? 84 : center + halfSpan;
  const step = high - low <= 24 ? 3 : 12;
  const ticks = [];
  for (let note = Math.ceil(low / step) * step; note <= high; note += step) ticks.push(note);
  return { center, low, high, ticks, y: (note: number) => 16 + (high - note) / (high - low) * 120 };
}
