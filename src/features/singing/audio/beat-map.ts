export interface BeatMap { version: 1; beats: number[]; strength: number[]; durationSeconds: number; meter: null; method: string }
export function validateBeatMap(value: unknown): BeatMap {
  const map = value as BeatMap;
  if (!map || map.version !== 1 || !Array.isArray(map.beats) || !Array.isArray(map.strength)
    || map.beats.length !== map.strength.length || !Number.isFinite(map.durationSeconds) || map.durationSeconds <= 0
    || map.beats.some((t, i) => !Number.isFinite(t) || t < 0 || t > map.durationSeconds || (i > 0 && t <= map.beats[i - 1]))
    || map.strength.some(x => !Number.isFinite(x) || x < 0 || x > 1)) throw new Error('节拍地图无效');
  return map;
}
/** Fractional beat position; never extrapolate over an intro/outro or a large gap. */
export function beatPosition(map: BeatMap | null, seconds: number): number | null {
  if (!map || map.beats.length < 2 || seconds < map.beats[0] || seconds > map.beats.at(-1)!) return null;
  let low = 0, high = map.beats.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (map.beats[mid] <= seconds) low = mid; else high = mid - 1; }
  if (low === map.beats.length - 1) return low;
  const length = map.beats[low + 1] - map.beats[low];
  return length <= 1.5 ? low + (seconds - map.beats[low]) / length : null;
}
export function beatFeedback(map: BeatMap | null, seconds: number, speed: number) {
  const beat = beatPosition(map, seconds);
  if (beat === null || !map) return null;
  const i = Math.min(Math.floor(beat), map.beats.length - 2);
  if (i < 0) return null;
  let left = i, right = i + 1;
  while (left > Math.max(0, i - 3) && map.beats[left] - map.beats[left - 1] <= 1.5) left--;
  while (right < Math.min(map.beats.length - 1, i + 5) && map.beats[right + 1] - map.beats[right] <= 1.5) right++;
  const secondsPerBeat = (map.beats[right] - map.beats[left]) / (right - left);
  return { beat, pulse: beat % 1 < .22, bpm: 60 * speed / secondsPerBeat, strength: map.strength[i] };
}

/** Acoustic character extent in estimated beat units, not a transcribed note value. */
export function characterBeats(map: BeatMap | null, start: number, end: number) {
  const from = beatPosition(map, start), to = beatPosition(map, end);
  if (!map || from === null || to === null || end <= start) return null;
  // Reject an interval that spans a missing beat region, even when both endpoints exist.
  for (let i = Math.floor(from); i < Math.ceil(to); i++) {
    if (map.beats[i + 1] === undefined || map.beats[i + 1] - map.beats[i] > 1.5) return null;
  }
  const phase = from - Math.floor(from);
  const placement = Math.min(phase, 1-phase) <= .12 ? '正拍' : Math.abs(phase-.5) <= .12 ? '反拍 &' : '拍间';
  const duration = to - from;
  const fractions: [number,string][] = [[.25,'¼'],[.5,'½'],[.75,'¾'],[1,'1'],[1.5,'1½'],[2,'2'],[3,'3'],[4,'4']];
  const nearest = fractions.reduce((a,b)=>Math.abs(a[0]-duration)<Math.abs(b[0]-duration)?a:b);
  const label = Math.abs(nearest[0]-duration) <= .1 ? nearest[1] : duration.toFixed(2);
  return { from, to, duration, phase, placement, label: `≈${label}拍` };
}
