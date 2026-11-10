import { describe, expect, it } from 'vitest';
import { PlaybackClock } from '../../src/features/singing/audio/playback-clock';

describe('variable-speed song clock', () => {
  it('integrates the speed ramp without jumping and preserves historical capture positions', () => {
    const clock = new PlaybackClock();
    clock.reset(10, 20, 1);
    expect(clock.changeRate(12, .5)).toBe(1);
    expect(clock.positionAt(12)).toBe(22);
    expect(clock.positionAt(12.02)).toBeCloseTo(22.0175);
    expect(clock.positionAt(14)).toBeCloseTo(23.01);
    expect(clock.positionAt(11)).toBe(21);
  });
  it('starts an interrupted ramp at its actual current rate', () => {
    const clock = new PlaybackClock();
    clock.changeRate(1, .5);
    expect(clock.changeRate(1.02, 1.5)).toBeCloseTo(.75);
    expect(clock.positionAt(1.02)).toBeCloseTo(1.0175);
    expect(clock.positionAt(1.06)).toBeCloseTo(1.0625);
    expect(clock.automationAt(1.04)).toMatchObject({ target: 1.5, end: 1.06 });
    expect(clock.automationAt(1.04).rate).toBeCloseTo(1.125);
  });
  it('retains recent microphone history across repeated changes and resets on seek', () => {
    const clock = new PlaybackClock();
    const history = new Map<number, number>();
    for (let time = 0; time <= 10; time += .1) {
      clock.changeRate(time, time % 1 > .5 ? .5 : 1.5);
      history.set(time, clock.positionAt(time));
    }
    for (const [time, position] of history) if (time > 7) expect(clock.positionAt(time)).toBeCloseTo(position);
    clock.reset(15, 30, .75);
    expect(clock.positionAt(17)).toBe(31.5);
  });
});
