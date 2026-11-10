import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BandTakeRecorder } from '../../src/features/singing/audio/band-take-recorder';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = (type: string) => type === 'audio/mp4';
  state: RecordingState = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  stop = vi.fn(() => { this.state = 'inactive'; });
  constructor(public stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'audio/mp4';
    FakeRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  chunk(text: string) { this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) }); }
  flush() { this.chunk('final'); this.onstop?.(); }
}

describe('generated band take recording', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeRecorder);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function setup(limits = {}) {
    const tracks: { stop: ReturnType<typeof vi.fn> }[] = [];
    const context = { currentTime: 0, createMediaStreamDestination: vi.fn(() => {
      const track = { stop: vi.fn() };
      tracks.push(track);
      return { stream: { getTracks: () => [track] }, disconnect: vi.fn() };
    }) };
    const output = { connectOutput: vi.fn(), disconnectOutput: vi.fn() };
    const onTakeReady = vi.fn();
    const onStatus = vi.fn();
    const recorder = new BandTakeRecorder(context as unknown as AudioContext, output, { onTakeReady, onStatus, ...limits });
    return { recorder, context, output, tracks, onTakeReady, onStatus };
  }

  it('captures the supplied band bus and includes the final encoder chunk after Stop', async () => {
    const { recorder, context, output, tracks, onTakeReady, onStatus } = setup();
    recorder.start();
    const media = FakeRecorder.instances[0];
    const destination = context.createMediaStreamDestination.mock.results[0].value;
    expect(media.stream).toBe(destination.stream);
    expect(output.connectOutput).toHaveBeenCalledWith(destination);
    expect(media.mimeType).toBe('audio/mp4');
    media.chunk('first');
    context.currentTime = 1;
    recorder.stop();
    expect(onTakeReady).not.toHaveBeenCalled();
    expect(media.stop).not.toHaveBeenCalled();
    context.currentTime = 1.06;
    vi.advanceTimersByTime(60);
    expect(media.stop).toHaveBeenCalledTimes(1);
    expect(onTakeReady).not.toHaveBeenCalled();
    media.flush();
    await Promise.resolve();
    const take = onTakeReady.mock.calls[0][0];
    expect(await take.blob.text()).toBe('firstfinal');
    expect(take.durationMs).toBe(1060);
    expect(take.mimeType).toBe('audio/mp4');
    expect(tracks[0].stop).toHaveBeenCalledOnce();
    expect(output.disconnectOutput).toHaveBeenCalledWith(destination);
    expect(onStatus.mock.lastCall?.[0].state).toBe('ready');
  });

  it('keeps new-session status and cannot replace a newer take with an older async flush', async () => {
    const { recorder, context, onTakeReady, onStatus } = setup();
    recorder.start();
    const first = FakeRecorder.instances[0];
    context.currentTime = 1;
    recorder.stop();
    recorder.start();
    const second = FakeRecorder.instances[1];
    expect(first.stop).toHaveBeenCalledOnce();
    expect(onStatus.mock.lastCall?.[0].state).toBe('recording');
    context.currentTime = 2;
    recorder.stop(0);
    second.flush();
    first.flush();
    await Promise.resolve();
    expect(onTakeReady).toHaveBeenCalledOnce();
    expect(onTakeReady.mock.calls[0][0].durationMs).toBe(1000);
    expect(onStatus.mock.lastCall?.[0].state).toBe('ready');
  });

  it('can deliver a previous take while recording without changing the current recording status', async () => {
    const { recorder, context, onTakeReady, onStatus } = setup();
    recorder.start();
    const first = FakeRecorder.instances[0];
    context.currentTime = 1;
    recorder.start();
    first.flush();
    await Promise.resolve();
    expect(onTakeReady).toHaveBeenCalledOnce();
    expect(onStatus.mock.lastCall?.[0].state).toBe('recording');
    recorder.dispose();
  });

  it('bounds capture duration and rejects oversized encoder output without replacing the last take', () => {
    const { recorder, context, onStatus, onTakeReady, tracks } = setup({ maxDurationMs: 1000, maxBytes: 6 });
    recorder.start();
    const media = FakeRecorder.instances[0];
    media.chunk('first');
    context.currentTime = 1;
    vi.advanceTimersByTime(1000);
    expect(media.stop).toHaveBeenCalledOnce();
    media.flush();
    expect(onTakeReady).not.toHaveBeenCalled();
    expect(onStatus.mock.lastCall?.[0].state).toBe('error');
    expect(tracks[0].stop).toHaveBeenCalledOnce();
  });

  it('pauses with audio interruptions and suppresses callbacks after disposal', () => {
    const { recorder, context, onStatus, onTakeReady, tracks } = setup();
    recorder.start();
    const media = FakeRecorder.instances[0];
    recorder.setPaused(true);
    expect(media.state).toBe('paused');
    recorder.setPaused(false);
    expect(media.state).toBe('recording');
    context.currentTime = 1;
    recorder.dispose();
    onStatus.mockClear();
    media.flush();
    vi.runAllTimers();
    expect(onTakeReady).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalledOnce();
    expect(media.stop).toHaveBeenCalledOnce();
  });

  it('reports unsupported recording without creating a stream or throwing', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const { recorder, context, onStatus } = setup();
    expect(() => recorder.start()).not.toThrow();
    expect(context.createMediaStreamDestination).not.toHaveBeenCalled();
    expect(onStatus.mock.lastCall?.[0].state).toBe('unavailable');
  });
});
