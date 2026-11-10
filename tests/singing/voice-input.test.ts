import { describe, expect, it } from 'vitest';
import { VoiceInputSession, inputLevel, inputMidi, inputNote, pitchSegments, recentInputPitch, type VoiceInputFrame } from '../../src/features/singing/audio/voice-input';

const frame = (time: number, pitchHz: number | null = 440, confidence = .99): VoiceInputFrame => ({ time, pitchHz, confidence, rms: .1 });
describe('microphone feedback', () => {
  it('retains the last measured pitch through a brief dropout without filling recorded gaps', () => {
    const history=[frame(1,160.6758),frame(1.09,null),frame(1.17,null)];
    const reading=recentInputPitch(history,1.17,true)!;
    expect(inputNote(reading.midi)).toBe('E3');
    expect(reading.held).toBe(true);
    expect(reading.age).toBeCloseTo(.17);
    expect(recentInputPitch(history,1.26,true)).toBeNull();
    expect(recentInputPitch(history,1.26,false)?.frame).toBe(history[0]);
    expect(history.filter(f=>inputMidi(f)!==null)).toHaveLength(1);
  });
  it('uses selected history and never carries a note across a new recording segment', () => {
    const history=[{...frame(1,220),segment:0},{...frame(1.05,null),segment:1}];
    expect(recentInputPitch(history,1.05,true)).toBeNull();
    expect(recentInputPitch(history,1.05,false)).toBeNull();
    expect(inputNote(recentInputPitch(history.slice(0,1),1,false)!.midi)).toBe('A3');
  });
  it('shows actual detected notes without octave alignment or phrase matching', () => {
    expect(inputNote(inputMidi(frame(1, 220))!)).toBe('A3');
    expect(inputNote(inputMidi(frame(1, 440))!)).toBe('A4');
    expect(inputMidi(frame(1, 440, .7))).toBeNull();
    expect(inputMidi({ ...frame(1), rms: 0 })).toBeNull();
    expect(inputMidi(frame(1, NaN))).toBeNull();
  });
  it('shows input strength even without a clear pitch, but no fabricated motion in silence', () => {
    expect(inputLevel(.1)).toBeGreaterThan(inputLevel(.01));
    expect(inputLevel(0)).toBe(0);
    expect(inputLevel(NaN)).toBe(0);
    expect(inputLevel(2)).toBe(1);
    expect(inputMidi(frame(1, null))).toBeNull();
    expect(inputLevel(frame(1, null).rms)).toBeGreaterThan(0);
  });
  it('archives a whole session, excludes pauses and preserves historical windows across reconnects', () => {
    const session = new VoiceInputSession();
    for (let i = 0; i < 40; i++) session.record(frame(i * .1));
    const previous = session.window(), end = session.position;
    session.record(null);
    session.record(null);
    expect(session.window()).toEqual(previous);
    session.record(frame(100, 220));
    expect(session.position).toBeCloseTo(end + .05);
    expect(pitchSegments(session.window())).toHaveLength(2);
    for (let i = 1; i < 150; i++) session.record(frame(100 + i * .1, 220));
    expect(session.count).toBe(190);
    expect(session.window(end)).toEqual(previous);
    expect(session.window().length).toBeLessThan(82);
    session.reset();
    expect(session.count).toBe(0);
    expect(session.latest).toBeNull();
    expect(session.window()).toEqual([]);
    expect(session.position).toBe(0);
  });
  it('leaves gaps for breaths, unclear pitch and delayed/missing analysis frames', () => {
    const segments = pitchSegments([frame(0), frame(.05), frame(.1, null), frame(.15, 220), frame(.2, 220, .6), frame(.25), frame(.7)]);
    expect(segments.map(segment => segment.map(point => point.time))).toEqual([[0, .05], [.15], [.25], [.7]]);
  });
});
