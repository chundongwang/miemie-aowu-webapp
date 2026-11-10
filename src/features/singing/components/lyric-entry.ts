import { lyricIndexAt, type LyricLine } from '@/features/singing/audio/lyrics';

export function lyricEntryCue(lines: LyricLine[], position: number, offset: number, playing: boolean, ended: boolean, speed = 1) {
  const index = lyricIndexAt(lines, position - offset);
  const current = lines[index];
  const justStarted = playing && !ended && current?.text && (position - (current.time + offset)) / speed < .65;
  const targetIndex = justStarted ? index : lines.findIndex((line, i) => i > index && line.text.length > 0);
  const target = lines[targetIndex];
  const time = target ? Math.max(0, target.time + offset) : null;
  const remaining = time === null ? 0 : Math.max(0, time - position) / speed;
  const phase = ended ? 'ended' : !target ? 'outro' : !playing ? 'paused' : justStarted ? 'enter' : remaining <= 3 ? 'countdown' : 'waiting';
  return { phase, targetIndex, text: target?.text ?? '', time, remaining,
    progress: phase === 'enter' ? 1 : Math.max(0, Math.min(1, 1 - remaining / 3)) };
}

export function formatEntryTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  return `${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}
