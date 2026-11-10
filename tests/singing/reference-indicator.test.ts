import { describe, expect, it } from 'vitest';
import { referenceIndicators, referenceState } from '../../src/features/singing/audio/reference-indicator';
import { VoiceInputSession } from '../../src/features/singing/audio/voice-input';
import type { VocalReference } from '../../src/features/singing/audio/voice-key-follower';
const reference: VocalReference = { version: 1, durationSeconds: 10, hopSeconds: .02, frames: [[1, 60, .99], [2, 61, .3], [8, 62, .99]] };
describe('reference availability on input history', () => {
  it('distinguishes unavailable data from real gaps, using the matcher confidence and time tolerance', () => {
    expect(referenceState(null, 1)).toBe('unknown');
    expect(referenceState(reference, undefined)).toBe('unknown');
    expect(referenceState(reference, -1)).toBe('unknown');
    expect(referenceState(reference, 1.03)).toBe('available');
    expect(referenceState(reference, 1.04)).toBe('gap');
    expect(referenceState(reference, 2)).toBe('gap');
  });
  it('keeps source positions across pause, seek, speed changes and history review without bridging interruptions', () => {
    const session = new VoiceInputSession();
    session.record({ time: 10, songTime: 1, rms: .1, pitchHz: 220, confidence: .99 });
    session.record({ time: 10.1, songTime: 1.15, rms: .1, pitchHz: 220, confidence: .99 });
    const end = session.position;
    const saved = referenceIndicators(session.window(), reference);
    expect(saved.map(point => point.state)).toEqual(['available', 'gap']);
    session.record(null);
    session.record({ time: 200, songTime: 8, rms: .1, pitchHz: 220, confidence: .99 });
    const resumed = referenceIndicators(session.window(), reference);
    expect(resumed[0].songTime).toBe(1);
    expect(resumed.at(-1)?.state).toBe('available');
    expect(resumed[1].end).toBeLessThan(resumed[2].time);
    expect(referenceIndicators(session.window(end), reference)).toEqual(saved);
    session.reset();
    expect(referenceIndicators(session.window(), reference)).toEqual([]);
  });
});
