import type { LyricLine } from '@/features/singing/audio/lyrics';
import { formatEntryTime } from './lyric-entry';

export type LyricTiming = { times: number[]; offset: number };
export const originalTiming = (lines: LyricLine[]): LyricTiming => ({ times: lines.map(line => line.time), offset: 0 });
export const roundTime = (value: number) => Math.round(value * 100) / 100;

export function timingError(timing: LyricTiming, length: number, duration: number): string | null {
  if (timing.times.length !== length || !Number.isFinite(timing.offset) || Math.abs(timing.offset) > 3) return '时间设置无效。';
  for (let i = 0; i < length; i++) {
    const time = timing.times[i] + timing.offset;
    if (!Number.isFinite(time) || roundTime(time) < 0 || roundTime(time) > duration) return '入句时间需要在歌曲范围内。';
    if (i && roundTime(timing.times[i]) < roundTime(timing.times[i - 1])) return '入句时间不能越过前一句或后一句。';
  }
  return null;
}

export function calibrateLine(timing: LyricTiming, index: number, audibleTime: number, duration: number): LyricTiming {
  if (!Number.isInteger(index) || index < 0 || index >= timing.times.length || !Number.isFinite(audibleTime)) throw new Error('请选择有效的歌词与时间。');
  const time = roundTime(audibleTime - timing.offset);
  // Keep line identity and sequence; never silently sort lyrics after a mistimed tap.
  if ((index > 0 && time <= timing.times[index - 1]) || (index < timing.times.length - 1 && time >= timing.times[index + 1])) throw new Error('入句时间不能越过前一句或后一句，请先调整相邻句。');
  const result = { ...timing, times: timing.times.map((previous, i) => i === index ? time : previous) };
  const error = timingError(result, timing.times.length, duration);
  if (error) throw new Error(error);
  return result;
}

export function saveTiming(source: LyricLine[], timing: LyricTiming) {
  return JSON.stringify({ version: 1, source, timing });
}

export function loadTiming(raw: string | null, source: LyricLine[], duration: number): LyricTiming | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || JSON.stringify(value.source) !== JSON.stringify(source)) return null;
    const timing = value.timing;
    if (!timing || !Array.isArray(timing.times) || timing.times.some((time: unknown) => typeof time !== 'number') || typeof timing.offset !== 'number' || timingError(timing, source.length, duration)) return null;
    return timing;
  } catch { return null; }
}

export function exportLrc(source: LyricLine[], timing: LyricTiming) {
  // Timestamps already include the global offset. No [offset:] tag, so it cannot be applied twice.
  return source.map((line, i) => `[${formatEntryTime(timing.times[i] + timing.offset)}]${line.text}`).join('\n') + '\n';
}
