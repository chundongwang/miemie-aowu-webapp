import { prepareAudioSession, verifyAudioSession } from './native-session';
import { audibleContextTime, capturePerformanceTime, syncProfile } from './audio-sync';
import { AlignedPerformanceFollower, validatePerformanceReference, performanceTarget, PERFORMANCE_LIMITS, type PerformanceReference } from './aligned-performance';
import { VocalTempoFollower, emptyTempo, tempoTarget, TEMPO_LIMITS, type TempoEstimate } from './vocal-tempo-follower';
import { VoiceDiagnostics } from './voice-diagnostics';
import { VOICE_MIN_RMS, VOICE_MIN_CLARITY } from '../perception/voice-quality';
import { PlaybackClock } from './playback-clock';
import type { VoiceInputFrame } from './voice-input';
import { BandTakeRecorder } from './band-take-recorder';
import type { BandRecordingStatus, RecordedBandTake } from './types';
import { FeaturePipeline } from '../perception/feature-pipeline';
import { VoiceKeyFollower, KEY_DELAYS, KEY_THRESHOLDS, validateVocalReference, type KeyEstimate, type VocalReference } from './voice-key-follower';

export type CaptureMode = 'headphones' | 'speakers';
export type VoiceFollowStatus = { preview?: { shift: number; evaluatedAt: number; songTime: number }; captureMode?: CaptureMode; echoCancellation?: boolean; diagnostics?: KeyEstimate['diagnostics']; reason?: KeyEstimate['reason']; referenceCoverage?: number; state: KeyEstimate['state'] | 'off' | 'requesting' | 'error'; detectedShift?: number | null; keyFresh?: boolean; voiceMidi?: number | null; referenceMidi?: number | null; confidence?: number; message?: string };

export interface TrackSnapshot {
  position: number;
  audiblePosition?: number;
  duration: number;
  speed: number;
  playing: boolean;
  ended: boolean;
  tempoAdjustment?: { from: number; to: number; active: boolean };
}

interface Callbacks {
  onChange: () => void;
  onError: (message: string) => void;
  onTake: (take: RecordedBandTake) => void;
  onRecording: (status: BandRecordingStatus) => void;
  onVoice?: (status: VoiceFollowStatus) => void;
  onAutoPitch?: (semitones: number) => void;
  onTempo?: (estimate: TempoEstimate) => void;
  onInput?: (frame: VoiceInputFrame | null) => void;
}

/** A pitch-independent, variable-speed stereo recording. Microphone input never controls its transport. */
export class RecordedTrackPlayer {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private shifter: AudioWorkletNode | null = null;
  private sourceGain: GainNode | null = null;
  private retiring = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();
  private buffers = new Map<string, { buffer: AudioBuffer; duration: number }>();
  private gain: GainNode | null = null;
  private recorder: BandTakeRecorder | null = null;
  private loading: Promise<void> | null = null;
  private abort = new AbortController();
  private disposed = false;
  private position = 0;
  private speed = 1;
  private baseSpeed = 1;
  private automaticTempo = false;
  private automaticPitch = false;
  private tempoFollower: VocalTempoFollower | AlignedPerformanceFollower | null = null;
  private lastTempoEvaluation = -Infinity;
  private lastTempoChange = -Infinity;
  private tempoLog: unknown[] = [];
  private tempoRamp: { from: number; to: number; end: number } | null = null;
  setFollowOptions(pitch: boolean, tempo: boolean) {
    this.automaticPitch = pitch;
    if (tempo !== this.automaticTempo) { this.tempoFollower?.reset(); this.lastTempoEvaluation = -Infinity; }
    this.automaticTempo = tempo;
  }
  private clock = new PlaybackClock();
  private anchor = 0;
  private duration = 0;
  private playing = false;
  private ended = false;
  private semitones = 0;
  private volume = 0.7;
  private dspLatencyMs = 0;
  private deviceEpoch = 0;
  setSynchronization(dspMs: number, epoch: number) { this.dspLatencyMs = dspMs; this.deviceEpoch = epoch; }

  private micGeneration = 0;
  private captureMode: CaptureMode = 'headphones';

  // The caller reconnects only capture when this changes; transport and history stay intact.
  setCaptureMode(mode: CaptureMode) { this.captureMode = mode; }
  private stream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private pipeline: FeaturePipeline | null = null;
  private reference: VocalReference | null = null;
  private performanceReference: PerformanceReference | null = null;
  private performanceError: string | null = null;
  private follower: VoiceKeyFollower | null = null;
  private captureLoaded = false;
  private diagnostics = new VoiceDiagnostics();

  resetDiagnostics() { this.diagnostics.reset(); this.tempoLog = []; this.tempoRamp = null; }
  exportDiagnostics() {
    return { schemaVersion: 1, algorithmVersion: 'voice-key-v2-diagnostics', exportedAt: new Date().toISOString(),
      privacy: 'Local numeric features only; no microphone audio, device IDs or device labels.',
      thresholds: { ...KEY_THRESHOLDS, minimumRms: VOICE_MIN_RMS, minimumClarity: VOICE_MIN_CLARITY },
      performance: { mode: this.performanceReference ? 'aligned' : 'legacy', error: this.performanceError, provenance: this.performanceReference?.provenance, reference: this.performanceReference },
      tempo: { version: 2, limits: this.performanceReference ? PERFORMANCE_LIMITS : TEMPO_LIMITS, baseSpeed: this.baseSpeed, automatic: this.automaticTempo, evaluations: this.tempoLog },
      delays: KEY_DELAYS, reference: this.reference, sourceUrl: this.url,
      transport: this.snapshot(), captureMode: this.captureMode, backingShift: this.semitones, ...this.diagnostics.snapshot() };
  }

  constructor(private url: string, private callbacks: Callbacks) {}

  snapshot(): TrackSnapshot {
    const position = this.source && this.context
      ? this.clock.positionAt(this.context.currentTime)
      : this.position;
    return { position: Math.min(this.duration || Infinity, position),
      audiblePosition: this.playing && this.context && this.source ? Math.min(this.duration, this.clock.positionAt(audibleContextTime(this.context, this.dspLatencyMs))) : Math.min(this.duration || Infinity, position), duration: this.duration, speed: this.speed, playing: this.playing, ended: this.ended,
      tempoAdjustment: this.tempoRamp ? { from: this.tempoRamp.from, to: this.tempoRamp.to, active: this.playing && !!this.context && this.context.currentTime < this.tempoRamp.end } : undefined };
  }

  async load() {
    if (this.disposed) throw new Error('播放器已关闭。');
    if (this.buffer) return;
    if (this.loading) return this.loading;
    this.loading = this.initialize();
    try { await this.loading; }
    catch (error) {
      this.recorder?.dispose();
      const context = this.context;
      this.context = null;
      this.buffer = null;
      this.gain = null;
      this.recorder = null;
      if (context && context.state !== 'closed') await context.close();
      throw error;
    } finally { this.loading = null; }
  }

  private async initialize() {
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    // Called directly from the play gesture, before any network/decode await.
    await context.resume();
    const [response] = await Promise.all([
      fetch(this.url, { signal: this.abort.signal }),
      context.audioWorklet.addModule('/singing/worklets/soundtouch-processor.js'),
    ]);
    if (!response.ok) throw new Error('无法读取歌曲文件，请检查本地音频。');
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    if (this.disposed) throw new Error('播放器已关闭。');
    const prepared = this.padBuffer(decoded);
    this.duration = prepared.duration;
    this.buffer = prepared.buffer;
    this.buffers.set(this.url, prepared);
    this.gain = context.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(context.destination);
    this.recorder = new BandTakeRecorder(context, {
      connectOutput: node => this.gain!.connect(node),
      disconnectOutput: node => this.gain?.disconnect(node),
    }, { onStatus: this.callbacks.onRecording, onTakeReady: this.callbacks.onTake });
    context.onstatechange = () => {
      if (this.disposed || !this.playing) return;
      if (context.state !== 'running') {
        this.playing = false;
        this.disableVoiceFollow();
        this.recorder?.stop(0);
        this.callbacks.onChange();
      }
    };
    this.callbacks.onChange();
  }

  private padBuffer(decoded: AudioBuffer) {
    const context = this.context!;
    // Drain the pitch processor's final notes without moving the visible song endpoint.
    const buffer = context.createBuffer(2, decoded.length + Math.ceil(context.sampleRate * .35), context.sampleRate);
    for (let channel = 0; channel < 2; channel++) buffer.copyToChannel(decoded.getChannelData(Math.min(channel, decoded.numberOfChannels - 1)), channel);
    return { buffer, duration: decoded.duration };
  }

  /** Switch aligned original/instrumental stems without restarting the clock or pitch DSP. */
  async setMix(url: string) {
    if (this.disposed) throw new Error('播放器已关闭。');
    if (url === this.url) return;
    if (!this.context) { this.url = url; return; }
    const context = this.context;
    let prepared = this.buffers.get(url);
    if (!prepared) {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error('伴奏未能加载，继续使用当前版本。');
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      if (this.disposed) throw new Error('播放器已关闭。');
      if (Math.abs(decoded.duration - this.duration) > .1) throw new Error('伴奏与原曲长度不一致，继续使用当前版本。');
      prepared = this.padBuffer(decoded);
      this.buffers.set(url, prepared);
    }
    // Read the clock AFTER decoding: audio has continued throughout the load.
    const position = this.snapshot().position;
    this.buffer = prepared.buffer;
    this.url = url;
    if (this.source && this.sourceGain && this.shifter) {
      const old = { source: this.source, gain: this.sourceGain };
      this.retiring.add(old);
      old.source.onended = () => { old.source.disconnect(); old.gain.disconnect(); this.retiring.delete(old); };
      this.position = position;
      this.startBuffer(.09);
      old.gain.gain.cancelAndHoldAtTime(context.currentTime);
      old.gain.gain.linearRampToValueAtTime(0, context.currentTime + .09);
      old.source.stop(context.currentTime + .1);
    }
    this.callbacks.onChange();
  }

  private disconnectSource() {
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch { /* Source may already have ended. */ }
      this.source.disconnect();
    }
    this.sourceGain?.disconnect();
    this.sourceGain = null;
    for (const old of this.retiring) {
      old.source.onended = null;
      try { old.source.stop(); } catch { /* Already ended. */ }
      old.source.disconnect(); old.gain.disconnect();
    }
    this.retiring.clear();
    this.shifter?.disconnect();
    this.shifter?.port.close();
    this.source = null;
    this.shifter = null;
  }

  private createSource() {
    const context = this.context!;
    this.disconnectSource();
    const shifter = new AudioWorkletNode(context, 'soundtouch-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      parameterData: { pitch: 1, pitchSemitones: this.semitones, playbackRate: this.speed },
    });
    // One stable processing window across key changes. This runs off the UI thread.
    shifter.port.postMessage({ type: 'set-stretch-parameters', params: { sequenceMs: 80, seekWindowMs: 20, overlapMs: 8 } });
    shifter.onprocessorerror = () => {
      void this.pause();
      this.disconnectSource();
      this.callbacks.onError('音频移调出现错误，请重新播放。');
    };
    shifter.connect(this.gain!);
    this.shifter = shifter;
    this.clock.reset(context.currentTime, this.position, this.speed);
    this.startBuffer();
  }

  private startBuffer(fadeIn = 0) {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    // Source speed and the worklet's compensation follow the same automation.
    // The worklet cancels rate-induced pitch changes, preserving the selected key.
    const automation = this.clock.automationAt(context.currentTime);
    source.playbackRate.setValueAtTime(automation.rate, context.currentTime);
    if (automation.end > context.currentTime) source.playbackRate.linearRampToValueAtTime(automation.target, automation.end);
    const gain = context.createGain();
    gain.gain.setValueAtTime(fadeIn ? 0 : 1, context.currentTime);
    if (fadeIn) gain.gain.linearRampToValueAtTime(1, context.currentTime + fadeIn);
    source.connect(gain);
    gain.connect(this.shifter!);
    this.sourceGain = gain;
    this.source = source;
    this.anchor = context.currentTime;
    source.onended = () => {
      if (this.source !== source || this.disposed) return;
      this.position = this.duration;
      this.playing = false;
      this.ended = true;
      this.recorder?.stop(0);
      this.disableVoiceFollow();
      this.disconnectSource();
      void context.suspend();
      this.callbacks.onChange();
    };
    source.start(this.anchor, this.clock.positionAt(this.anchor));
  }

  async play() {
    await this.load();
    if (this.disposed || this.playing) return;
    if (this.position >= this.duration) { this.position = 0; this.disconnectSource(); }
    await this.context!.resume();
    if (this.disposed) return;
    if (!this.source) this.createSource();
    this.playing = true;
    this.ended = false;
    this.recorder?.start();
    this.callbacks.onChange();
  }

  async pause() {
    if (!this.context || !this.playing) return;
    this.playing = false;
    this.disableVoiceFollow();
    this.recorder?.stop(0);
    // Freeze source, DSP buffers and audio clock together; resume has no position jump.
    await this.context.suspend();
    if (!this.disposed) this.callbacks.onChange();
  }

  async seek(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    this.callbacks.onInput?.(null);
    const playing = this.playing;
    this.diagnostics.boundary('seek', this.context?.currentTime ?? 0, { target: seconds });
    this.follower?.reset();
    this.tempoFollower?.reset();
    this.tempoRamp = null;
    this.callbacks.onTempo?.(emptyTempo());
    this.pipeline?.reset();
    this.disconnectSource();
    this.position = Math.max(0, Math.min(this.duration || Infinity, seconds));
    this.ended = this.duration > 0 && this.position >= this.duration;
    if (this.ended) {
      this.playing = false;
      this.recorder?.stop(0);
      this.disableVoiceFollow();
      await this.context?.suspend();
    } else if (playing && this.buffer) this.createSource();
    if (!this.disposed) this.callbacks.onChange();
  }

  setSpeed(value: number) {
    if (!Number.isFinite(value)) return;
    this.baseSpeed = Math.round(Math.max(.5, Math.min(1.5, value)) * 100) / 100;
    this.tempoFollower?.reset();
    this.tempoRamp = null;
    this.callbacks.onTempo?.(emptyTempo());
    this.applySpeed(this.baseSpeed, .04);
  }

  private applySpeed(value: number, ramp: number) {
    if (!Number.isFinite(value)) return;
    const speed = Math.round(Math.max(.5, Math.min(1.5, value)) * 10000) / 10000;
    if (speed === this.speed) return;
    this.speed = speed;
    if (this.source && this.context && this.shifter) {
      const now = this.context.currentTime;
      const from = this.clock.changeRate(now, speed, ramp);
      const parameters = [this.source.playbackRate, ...Array.from(this.retiring, old => old.source.playbackRate), this.shifter.parameters.get('playbackRate')!];
      for (const parameter of parameters) {
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(from, now);
        parameter.linearRampToValueAtTime(speed, now + ramp);
      }
    }
    this.callbacks.onChange();
  }

  setPitch(semitones: number) {
    if (!Number.isFinite(semitones)) return;
    this.semitones = Math.round(Math.max(-6, Math.min(6, semitones)));
    const parameter = this.shifter?.parameters.get('pitchSemitones');
    if (parameter && this.context) {
      parameter.cancelScheduledValues(this.context.currentTime);
      parameter.setTargetAtTime(this.semitones, this.context.currentTime, 0.025);
    }
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
  }

  async enableVoiceFollow(referenceUrl: string, performanceUrl?: string) {
    if (this.stream || this.disposed || !this.playing) return;
    const generation = ++this.micGeneration;
    const captureMode = this.captureMode;
    this.callbacks.onVoice?.({ state: 'requesting', captureMode, echoCancellation: undefined });
    let stream: MediaStream | null = null;
    try {
      if (!this.reference) {
        const response = await fetch(referenceUrl, { signal: this.abort.signal });
        if (!response.ok) throw new Error('歌曲旋律参考尚未准备好，可以先使用手动调性。');
        const raw = await response.text();
        this.reference = validateVocalReference(JSON.parse(raw));
        if (performanceUrl) {
          try {
            const asset = await fetch(performanceUrl, { signal: this.abort.signal });
            if (!asset.ok) throw new Error('字级参考加载失败');
            const aligned = validatePerformanceReference(await asset.json());
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), b => b.toString(16).padStart(2, '0')).join('');
            if (aligned.provenance.referenceSha256 !== hash || Math.abs(aligned.durationSeconds - this.reference.durationSeconds) > .05) throw new Error('字级参考与音高版本不一致');
            this.performanceReference = aligned;
            this.performanceError = null;
          } catch (error) {
            this.performanceError = error instanceof Error ? error.message : String(error);
          }
        }
      }
      if (generation !== this.micGeneration || this.disposed || !this.playing) return;
      if (!this.captureLoaded) {
        await this.context!.audioWorklet.addModule('/singing/worklets/capture-processor.js');
        this.captureLoaded = true;
      }
      if (generation !== this.micGeneration || !this.playing) return;
      await prepareAudioSession();
      if (this.disposed || generation !== this.micGeneration) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: captureMode === 'speakers', noiseSuppression: false, autoGainControl: false } });
      if (generation !== this.micGeneration || this.disposed || !this.playing) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      void verifyAudioSession();
      const settings = stream.getAudioTracks()[0]?.getSettings();
      this.diagnostics.boundary('microphone-connected', this.context!.currentTime, {
        captureMode, requestedEchoCancellation: captureMode === 'speakers',
        sampleRate: this.context!.sampleRate, baseLatency: this.context!.baseLatency, outputLatency: this.context!.outputLatency,
        capture: settings ? { sampleRate: settings.sampleRate, channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl } : null,
      });
      const aligned = this.performanceReference;
      const keyReference = aligned ? { ...this.reference, frames: aligned.frames.map(([t, midi, confidence]) => [t, midi, confidence] as [number, number, number]) } : this.reference;
      this.follower = new VoiceKeyFollower(keyReference, time => this.clock.positionAt(time));
      this.tempoFollower = aligned ? new AlignedPerformanceFollower(aligned) : new VocalTempoFollower(this.reference);
      this.lastTempoEvaluation = this.lastTempoChange = -Infinity;
      const context = this.context!;
      const capture = new AudioWorkletNode(context, 'vocal-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.capture = capture;
      const release = (buffer: ArrayBuffer) => { if (this.capture === capture && buffer.byteLength) capture.port.postMessage({ type: 'recycle', buffer }, [buffer]); };
      this.pipeline = new FeaturePipeline(features => {
        if (!this.playing || this.disposed || generation !== this.micGeneration || !this.source) return;
        const captureTime = features.timestampMs / 1000;
        const observation = { time: captureTime, midi: features.pitchHz ? 69 + 12 * Math.log2(features.pitchHz / 440) : null,
          confidence: features.pitchConfidence, rms: features.rms };
        const diagnosticFrame = { observation, captureRate: this.clock.rateAt(captureTime), currentShift: this.semitones,
          referencePositions: KEY_DELAYS.map(delay => this.clock.positionAt(captureTime - delay)),
          arrivalAgeMs: (context.currentTime - captureTime) * 1000, processingMs: features.processingMs };
        if (captureTime < this.anchor || context.currentTime - captureTime > .3) {
          this.diagnostics.record({ ...diagnosticFrame, rejected: captureTime < this.anchor ? 'before-source' : 'stale' });
          return;
        }
        // Immediate signal feedback must not wait for a phrase-level key estimate.
        this.callbacks.onInput?.({ time: capturePerformanceTime(captureTime, context.currentTime, performance.now()/1000), arrivalTime: performance.now()/1000, captureTime, clockSegments: this.clock.snapshot(), syncProfile: syncProfile(this.baseSpeed, this.semitones, this.captureMode, this.deviceEpoch), songTime: this.clock.positionAt(captureTime), backingShift: this.semitones, playbackSpeed: this.clock.rateAt(captureTime), captureMode: this.captureMode, rms: features.rms, pitchHz: features.pitchHz, confidence: features.pitchConfidence });
        const tempoStarted = performance.now();
        const tempo = this.tempoFollower!.observe(observation, this.clock.positionAt(captureTime), this.clock.rateAt(captureTime));
        // Freeze each observation's aligned position. Never retrospectively remap a sung note.
        const keyObservation = aligned ? tempo.positionReady && tempo.referencePosition != null && captureTime - tempo.at <= .15
          ? { ...observation, referenceTime: tempo.referencePosition + (captureTime - tempo.at) * (tempo.singerRate ?? this.clock.rateAt(captureTime)) }
          : { ...observation, midi: null } : observation;
        const estimate = { ...this.follower!.observe(keyObservation, this.semitones) };
        if (aligned && keyObservation.midi === null && observation.midi !== null && tempo.blockedBy[0] !== 'no-pitch') {
          estimate.reason = 'position-pending';
          estimate.voiceMidi = observation.midi;
        }
        this.diagnostics.record({ ...diagnosticFrame, keyObservation, result: estimate });
        if (this.automaticPitch && estimate.shift !== null) {
          this.setPitch(estimate.shift);
          this.callbacks.onAutoPitch?.(estimate.shift);
        }
        this.callbacks.onVoice?.(estimate);
        this.callbacks.onTempo?.({ ...tempo, ageSeconds: Math.max(0, context.currentTime - tempo.at) });
        if (tempo.at > this.lastTempoEvaluation) {
          this.lastTempoEvaluation = tempo.at;
          const before = this.speed;
          const target = this.automaticTempo && this.captureMode === 'headphones' && captureTime - this.lastTempoChange >= (aligned ? .4 : 1)
            ? (aligned ? performanceTarget : tempoTarget)(tempo, before, this.baseSpeed) : before;
          if (target !== before) {
            const ramp = aligned ? .35 : 1;
            this.tempoRamp = { from: this.clock.rateAt(context.currentTime), to: target, end: context.currentTime + ramp };
            this.applySpeed(target, ramp); this.lastTempoChange = captureTime;
          }
          this.tempoLog.push({ ...tempo, computationMs: performance.now() - tempoStarted, songTime: this.clock.positionAt(captureTime), before, target, automatic: this.automaticTempo, captureMode: this.captureMode });
          if (this.tempoLog.length > 2400) this.tempoLog.shift();
        }
      }, release, () => {
        this.disableVoiceFollow();
        this.callbacks.onVoice?.({ state: 'error', message: '人声音高检测中断，音乐会继续。请重新开启人声反馈。' });
      }, 'singing');
      capture.port.onmessage = ({ data }) => {
        if (data.type !== 'frame') return;
        // Match frame centre to the source clock; worker arrival time must not shift the reference.
        const timestampMs = data.timestampMs - 1024 / data.sampleRate * 1000;
        if (!this.playing || !this.pipeline?.process({ samples: data.samples, sampleRate: data.sampleRate, timestampMs })) {
          this.diagnostics.dropped(); release(data.samples.buffer);
        }
      };
      capture.onprocessorerror = () => {
        this.disableVoiceFollow();
        this.callbacks.onVoice?.({ state: 'error', message: '麦克风处理已中断。音乐继续，请重新开启人声反馈。' });
      };
      this.micSource = context.createMediaStreamSource(stream);
      // The capture processor emits silence: no microphone monitoring, recording or feedback path.
      this.micSource.connect(capture).connect(context.destination);
      for (const track of stream.getTracks()) track.onended = () => {
        this.disableVoiceFollow();
        this.callbacks.onVoice?.({ state: 'error', message: '麦克风已断开。当前调性保持不变，音乐继续。' });
      };
      this.callbacks.onVoice?.({ state: 'listening', confidence: 0, captureMode, echoCancellation: settings?.echoCancellation });
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (generation !== this.micGeneration || this.disposed) return;
      this.disableVoiceFollow();
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.callbacks.onVoice?.({ state: 'error', message: denied ? '未获麦克风权限。允许访问后可开启人声反馈；音乐会继续播放。' : error instanceof Error ? error.message : '麦克风不可用，音乐会继续播放。' });
    }
  }

  disableVoiceFollow() {
    if (this.stream) this.diagnostics.event('microphone-disconnected', this.context?.currentTime ?? 0, { position: this.snapshot().position });
    this.micGeneration++;
    this.callbacks.onInput?.(null);
    this.pipeline?.dispose();
    this.pipeline = null;
    if (this.capture) {
      this.capture.port.postMessage({ type: 'stop' });
      this.capture.port.onmessage = null;
      this.capture.disconnect();
      this.capture.port.close();
    }
    this.capture = null;
    this.micSource?.disconnect();
    this.micSource = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
    this.follower?.reset();
    this.follower = null;
    this.tempoFollower = null;
    this.callbacks.onTempo?.({ ...emptyTempo(), mode: this.performanceReference ? 'aligned' : undefined, state: 'holding', blockedBy: ['inactive'] });
    if (!this.disposed) this.callbacks.onVoice?.({ state: 'off' });
  }

  dispose() {
    this.disposed = true;
    this.disableVoiceFollow();
    this.abort.abort();
    this.buffers.clear();
    this.buffer = null;
    this.recorder?.dispose();
    this.disconnectSource();
    this.gain?.disconnect();
    if (this.context) {
      this.context.onstatechange = null;
      if (this.context.state !== 'closed') void this.context.close();
    }
  }
}
