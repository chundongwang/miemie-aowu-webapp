import { describe, expect, it } from 'vitest';
import { formatTrackTime, lyricIndexAt, parseLrc } from '../../src/features/singing/audio/lyrics';

describe('timestamped lyrics', () => {
  it('handles metadata, repeated timestamps, fractional precision, offset and stable sorting', () => {
    const lines = parseLrc('[ti:Song]\n[offset:250]\n[00:12.345][00:20.5] Repeat\n[00:02.04] First\n[00:60]invalid\n[00:09.0]\n');
    expect(lines).toEqual([{ time: 2.29, text: 'First' }, { time: 9.25, text: '' }, { time: 12.595, text: 'Repeat' }, { time: 20.75, text: 'Repeat' }]);
  });
  it('uses the audio clock at intro, exact boundaries, backward seeks and outro', () => {
    const lines = parseLrc('[00:20.04]First\n[00:22.82]Second');
    expect(lyricIndexAt(lines, 0)).toBe(-1);
    expect(lyricIndexAt(lines, 20.039)).toBe(-1);
    expect(lyricIndexAt(lines, 20.04)).toBe(0);
    expect(lyricIndexAt(lines, 22.82)).toBe(1);
    expect(lyricIndexAt(lines, 21)).toBe(0);
    expect(lyricIndexAt(lines, 192)).toBe(1);
    expect(lyricIndexAt([], 25)).toBe(-1);
  });
  it('applies a positive user offset by delaying display rather than seeking the audio', () => {
    const lines = parseLrc('[00:20.04]First');
    expect(lyricIndexAt(lines, 20.5 - 1)).toBe(-1);
    expect(lyricIndexAt(lines, 21.05 - 1)).toBe(0);
  });
  it('formats complete track times', () => {
    expect(formatTrackTime(192.445)).toBe('03:12');
    expect(formatTrackTime(-1)).toBe('00:00');
  });
});
