export interface LyricLine { time: number; text: string }

/** LRC timestamps are seconds, independent of musical key and playback rendering. */
export function parseLrc(source: string): LyricLine[] {
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  const lines: LyricLine[] = [];
  for (const row of source.split(/\r?\n/)) {
    const timestamps = [...row.matchAll(/\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = row.replace(/\[[^\]]*\]/g, '').trim();
    for (const timestamp of timestamps) {
      const seconds = Number(timestamp[2]);
      if (seconds >= 60) continue;
      lines.push({ time: Math.max(0, Number(timestamp[1]) * 60 + seconds + Number(`0.${timestamp[3] ?? 0}`) + offset), text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function lyricIndexAt(lines: LyricLine[], seconds: number): number {
  let low = 0, high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].time <= seconds) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function formatTrackTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
