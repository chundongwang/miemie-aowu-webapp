'use client';

import { AudioRouteStatus } from './AudioRouteStatus';
import { syncProfile } from '@/features/singing/audio/audio-sync';
import type { LatencyMeasurement } from '@/features/singing/audio/latency-measurement';
import { LatencyCalibration } from './LatencyCalibration';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Headphones, Library, Mic, Minus, Music2, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Volume2 } from 'lucide-react';
import type { RecordedSong } from '@/features/singing/audio/recorded-song';
import { RecordedTrackPlayer, type CaptureMode, type TrackSnapshot, type VoiceFollowStatus } from '@/features/singing/audio/RecordedTrackPlayer';
import { formatTrackTime, lyricIndexAt, parseLrc, type LyricLine } from '@/features/singing/audio/lyrics';
import type { BandRecordingStatus } from '@/features/singing/audio/types';
import { VoiceDiagnosticPanel } from './VoiceDiagnosticPanel';
import { KeyComparison } from './KeyComparison';
import { previewKey } from './key-feedback';
import { VoiceInputFeedback } from './VoiceInputFeedback';
import { VoiceInputSession } from '@/features/singing/audio/voice-input';
import { emptyTempo, type TempoEstimate } from '@/features/singing/audio/vocal-tempo-follower';
import { validateBeatMap, type BeatMap } from '@/features/singing/audio/beat-map';
import { validatePerformanceReference, type PerformanceReference } from '@/features/singing/audio/aligned-performance';
import { analyzePractice } from '@/features/singing/audio/practice-analysis';
import { practiceLines } from '@/features/singing/audio/practice-reference';
import { PracticeFeedback } from './PracticeFeedback';
import { PracticeSummary } from './PracticeSummary';
import { LyricEntryCue } from './LyricEntryCue';
import { formatEntryTime } from './lyric-entry';
import { LyricCalibration } from './LyricCalibration';
import { loadTiming, originalTiming, saveTiming, timingError, type LyricTiming } from './lyric-calibration';

type Take = { url: string; filename: string; seconds: number };
export default function RecordedStudio({ track, songs, onSelectSong }: { track: RecordedSong; songs: RecordedSong[]; onSelectSong: (id: string) => void }) {
  const timingStorageKey = `cadence:lyric-timing:${track.id}:v1`;
  const initial: TrackSnapshot = { position: 0, duration: track.durationSeconds, speed: 1, playing: false, ended: false };
  const player = useRef<RecordedTrackPlayer | null>(null);
  const [inputSession] = useState(() => new VoiceInputSession());
  const [inputReset, setInputReset] = useState(0);
  const minimumTakeCreatedAt = useRef(0);
  const takeUrl = useRef<string | null>(null);
  const takeAudio = useRef<HTMLAudioElement>(null);
  const performancePanel = useRef<HTMLElement>(null);
  const lyricsList = useRef<HTMLDivElement>(null);
  const operation = useRef(false);
  const [transport, setTransport] = useState(initial);
  const [sourceLyrics, setSourceLyrics] = useState<LyricLine[]>([]);
  const [timing, setTiming] = useState<LyricTiming>({ times: [], offset: 0 });
  const [timingStatus, setTimingStatus] = useState('');
  const [timingIssue, setTimingIssue] = useState('');
  const [selectedLine, setSelectedLine] = useState(0);
  const [reference, setReference] = useState<PerformanceReference | null>(null);
  const [referenceIssue, setReferenceIssue] = useState('');
  const [started, setStarted] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [calibration, setCalibration] = useState<LatencyMeasurement | null>(null);
  const [deviceEpoch, setDeviceEpoch] = useState(0);
  const lyrics = useMemo(() => practiceLines(sourceLyrics, timing.times, reference), [sourceLyrics, timing.times, reference]);
  const offset = timing.offset;
  const [lyricError, setLyricError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [mix, setMix] = useState<'original' | 'instrumental'>(track.instrumentalUrl ? 'instrumental' : 'original');
  // Practice feedback never controls the accompaniment. Legacy followers remain diagnostic only.
  const autoFollow = false, autoTempo = false;
  const [micEnabled, setMicEnabled] = useState(true);
  const [tempo, setTempo] = useState<TempoEstimate>(emptyTempo);
  const [beats, setBeats] = useState<BeatMap | null>(null);
  const listening = micEnabled;
  const [captureMode, setCaptureMode] = useState<CaptureMode>('headphones');
  const [voice, setVoice] = useState<VoiceFollowStatus>({ state: 'off' });
  const [volume, setVolume] = useState(70);
  const [take, setTake] = useState<Take | null>(null);
  const [recording, setRecording] = useState<BandRecordingStatus | null>(null);
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    if (transport.playing && window.matchMedia('(max-width: 600px)').matches) {
      const frame = requestAnimationFrame(() => performancePanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      return () => cancelAnimationFrame(frame);
    }
  }, [transport.playing]);

  const calibrationProfile = syncProfile(transport.speed, pitch, captureMode, deviceEpoch);
  useEffect(() => { setLatencyMs(null); setCalibration(null); player.current?.setSynchronization(0, deviceEpoch); }, [calibrationProfile]);
  useEffect(() => {
    const changed = () => { setDeviceEpoch(epoch=>epoch+1); };
    navigator.mediaDevices?.addEventListener('devicechange', changed);
    window.addEventListener('singing-route-changed', changed);
    return () => { navigator.mediaDevices?.removeEventListener('devicechange', changed); window.removeEventListener('singing-route-changed', changed); };
  }, []);
  useEffect(() => { player.current?.setSynchronization(calibration?.dspMs ?? 0, deviceEpoch); }, [calibration, deviceEpoch]);

  useEffect(() => {
    const instance = new RecordedTrackPlayer(track.instrumentalUrl ?? track.audioUrl, {
      onChange: () => { const snapshot = instance.snapshot(); setTransport({ ...snapshot, duration: snapshot.duration || track.durationSeconds }); if (snapshot.playing) setStarted(true); },
      onError: setError,
      onRecording: setRecording,
      onAutoPitch: setPitch,
      onTempo: status => setTempo(previous => status.lag === null && previous.lag !== null
        ? { ...previous, state: status.state, positionReady: false, blockedBy: status.blockedBy, ageSeconds: status.ageSeconds ?? Infinity } : status),
      onInput: frame => inputSession.record(frame),
      onVoice: status => {
        setVoice(previous => {
          if (status.state === 'off' && previous.state === 'error') return previous;
          return { ...previous, ...status, preview: previewKey(status.diagnostics) ?? previous.preview, detectedShift: status.detectedShift ?? previous.detectedShift, keyFresh: status.keyFresh === true && status.detectedShift != null };
        });
        // A microphone failure does not change accompaniment playback.
      },
      onTake: result => {
        if (result.createdAt < minimumTakeCreatedAt.current) return;
        if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
        const url = URL.createObjectURL(result.blob);
        takeUrl.current = url;
        const extension = result.mimeType.includes('mp4') ? 'm4a' : result.mimeType.includes('ogg') ? 'ogg' : 'webm';
        setPlaybackError(false);
        setTake({ url, seconds: result.durationMs / 1000, filename: `${track.title}-${result.createdAt}.${extension}` });
      },
    });
    player.current = instance;
    const timer = window.setInterval(() => {
      const snapshot = instance.snapshot();
      if (snapshot.playing) setTransport(snapshot);
    }, 50);
    return () => {
      clearInterval(timer);
      instance.dispose();
      player.current = null;
      if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
      takeUrl.current = null;
    };
  }, []);

  useEffect(() => {
    player.current?.setCaptureMode(captureMode);
    player.current?.setFollowOptions(autoFollow, autoTempo);
    if (listening && transport.playing) void player.current?.enableVoiceFollow(track.referenceUrl, track.performanceUrl);
    else player.current?.disableVoiceFollow();
    return () => player.current?.disableVoiceFollow();
  }, [micEnabled, transport.playing, captureMode]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(track.lyricsUrl, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('歌词文件未能读取。');
      const parsed = parseLrc(await response.text());
      if (!parsed.length) throw new Error('歌词文件没有可用的时间戳。');
      if (!controller.signal.aborted) {
        let restored: LyricTiming | null = null;
        try { restored = loadTiming(localStorage.getItem(timingStorageKey), parsed, track.durationSeconds); }
        catch { setTimingStatus('无法使用本机存储，修改仅在本次页面有效；请导出保存。'); }
        setSourceLyrics(parsed);
        setTiming(restored ?? originalTiming(parsed));
        if (restored) setTimingStatus('已恢复本机保存的校准。');
      }
    }).catch(error => { if (!controller.signal.aborted) setLyricError(error.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!track.beatsUrl) return;
    const controller = new AbortController();
    void fetch(track.beatsUrl, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('No beat map');
      const map = validateBeatMap(await response.json());
      if (!controller.signal.aborted) setBeats(map);
    }).catch(() => { /* Beat cues are optional; audio and exact LRC timing remain available. */ });
    return () => controller.abort();
  }, [track.beatsUrl]);

  useEffect(() => {
    const controller = new AbortController();
    if (!track.performanceUrl) { setReferenceIssue('本曲没有字级参考，使用逐句歌词。'); return; }
    void Promise.all([fetch(track.performanceUrl, { signal: controller.signal }), fetch(track.referenceUrl, { signal: controller.signal }), fetch(track.lyricsUrl, { signal: controller.signal })]).then(async responses => {
      if (responses.some(response => !response.ok)) throw new Error('字级参考加载失败，暂用逐句歌词。');
      const [data, pitchBytes, lyricsBytes] = await Promise.all([responses[0].json(), responses[1].arrayBuffer(), responses[2].arrayBuffer()]);
      const validated = validatePerformanceReference(data);
      const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      if (validated.songId !== track.id || Math.abs(validated.durationSeconds - track.durationSeconds) > .5
        || await hash(pitchBytes) !== validated.provenance.referenceSha256 || await hash(lyricsBytes) !== validated.provenance.lyricsSha256)
        throw new Error('参考版本不匹配，暂用逐句歌词，不评价音准。');
      if (!controller.signal.aborted) setReference(validated);
    }).catch(error => { if (!controller.signal.aborted) setReferenceIssue(error.message); });
    return () => controller.abort();
  }, [track.id, track.performanceUrl, track.referenceUrl, track.lyricsUrl, track.durationSeconds]);

  useEffect(() => {
    const pause = () => { void player.current?.pause(); };
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('singing-interrupted', pause);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('singing-interrupted', pause); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  const act = useCallback(async (action: (instance: RecordedTrackPlayer) => Promise<void>) => {
    if (!player.current || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try { await action(player.current); }
    catch (error) { setError(error instanceof Error ? error.message : '音频播放失败，请重试。'); }
    finally { operation.current = false; setBusy(false); }
  }, []);

  const index = lyricIndexAt(lyrics, transport.position - offset);
  const firstTime = (lyrics[0]?.time ?? 0) + offset;
  const pitchLabel = pitch === 0 ? '原调' : `${pitch > 0 ? '+' : ''}${pitch} 半音`;
  const voiceText = voice.state === 'error' ? voice.message : !listening ? '人声反馈已关闭；伴奏继续播放。' : transport.playing ? '记录人声音高，暂停后查看本次练习。伴奏保持你设定的速度和调性。' : '播放后开启人声反馈；暂停保留本次记录。';
  const noteName = (midi?: number | null) => midi == null ? '—' : `${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;
  const captureText = captureMode === 'headphones' ? '保留原始人声 · 推荐耳机练唱'
    : !listening || !transport.playing ? '人声反馈开启后请求回声消除'
    : voice.state === 'requesting' ? '正在连接麦克风并请求回声消除…'
    : voice.captureMode === captureMode && voice.echoCancellation === true ? '回声消除已启用 · 外放仍可能干扰音高'
    : voice.captureMode === captureMode && voice.echoCancellation === false ? '浏览器未启用回声消除 · 建议改用耳机'
    : '已请求回声消除 · 浏览器未报告是否生效';
  const loading = busy && !transport.playing && !calibrating;

  useEffect(() => {
    const list = lyricsList.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (list && active) list.scrollTo({ top: active.offsetTop - list.clientHeight / 2 + active.clientHeight / 2, behavior: 'smooth' });
  }, [index]);

  const changePitch = (value: number) => {
    const semitones = Math.max(-6, Math.min(6, value));
    setPitch(semitones);
    player.current?.setPitch(semitones);
  };
  const togglePlay = () => void act(async instance => {
    if (instance.snapshot().playing) await instance.pause();
    else { takeAudio.current?.pause(); await instance.play(); }
  });
  const resetPractice = () => void act(async instance => {
    minimumTakeCreatedAt.current = Date.now();
    await instance.pause();
    await instance.seek(0);
    setStarted(false);
    setTake(null);
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = null;
    inputSession.reset();
    instance.resetDiagnostics();
    setInputReset(value => value + 1);
    setVoice({ state: 'off' });
    setTempo(emptyTempo());
  });
  const exportVoiceDiagnostics = () => {
    const report = player.current?.exportDiagnostics();
    if (!report) return;
    const blob = new Blob([JSON.stringify({ ...report, song: track, lyricTiming: timing, mix, automatic: autoFollow, autoTempo, tempoStatus: tempo, voiceStatus: voice, calibration: { result: calibration, profile: calibrationProfile }, practice: { version: 'practice-excerpts-v1', latencyMs, referenceProvenance: reference?.provenance ?? null, frames: inputSession.snapshot(), report: analyzePractice(inputSession.snapshot(), reference, latencyMs, calibrationProfile) } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `cadence-${track.id}-diagnostics-${Date.now()}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const seek = (seconds: number) => void act(instance => instance.seek(seconds));
  const changeMix = (next: 'original' | 'instrumental') => void act(async instance => {
    const url = next === 'instrumental' ? track.instrumentalUrl : track.audioUrl;
    if (!url) return;
    takeAudio.current?.pause();
    await instance.setMix(url);
    setMix(next);
  });
  const changeTiming = (next: LyricTiming) => {
    const issue = timingError(next, sourceLyrics.length, transport.duration);
    if (issue) { setTimingIssue(issue); return; }
    setTimingIssue('');
    setTiming(next);
    try { localStorage.setItem(timingStorageKey, saveTiming(sourceLyrics, next)); setTimingStatus('已自动保存到此浏览器。'); }
    catch { setTimingStatus('无法使用本机存储，修改仅在本次页面有效；请导出保存。'); }
  };
  const previewLine = (seconds: number) => void act(async instance => {
    takeAudio.current?.pause();
    await instance.seek(seconds);
    if (!instance.snapshot().playing) await instance.play();
  });

  return <div className="app-shell recorded-studio compact-studio singing-studio" lang="zh-CN">
    <div className="workspace">
      <main>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="recorded-grid">
          <div className="main-column">
            <section className="song-panel panel studio-toolbar" aria-label="歌曲与播放设置">
              <div className="studio-song-heading"><div><Music2 size={18}/><h1>{track.title}</h1><span>{formatTrackTime(transport.duration)} · 练唱空间</span></div><label className="song-library-select">曲库 · {songs.length} 首<select aria-label="选择歌曲" value={track.id} disabled={busy} onChange={event => onSelectSong(event.target.value)}>{songs.map(song => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label></div>
              <details className="practice-settings"><summary><SlidersHorizontal size={14}/>伴奏设置 <span>{transport.speed.toFixed(2)}× · {pitchLabel} · {mix === 'instrumental' ? '去原唱' : '含原唱'}</span><small>展开调整</small></summary>
              <div className="studio-controls">
              <div className="playback-speed-control" aria-label="播放速度设置">
                <div className="playback-speed-heading"><label htmlFor="playback-speed">播放速度</label><strong data-testid="speed-value">{transport.speed.toFixed(2)}×</strong><button className="text-button" disabled={busy || transport.speed === 1} onClick={() => player.current?.setSpeed(1)}>恢复原速</button></div>
                <input id="playback-speed" type="range" aria-label="播放速度" min={0.5} max={1.5} step={0.05} value={transport.speed} disabled={busy} onChange={event => player.current?.setSpeed(Number(event.target.value))}/>
                <div className="speed-presets">{[.5, .75, 1, 1.25, 1.5].map(speed => <button key={speed} aria-label={`${speed.toFixed(2)} 倍速`} aria-pressed={transport.speed === speed} disabled={busy} onClick={() => player.current?.setSpeed(speed)}>{speed.toFixed(2)}×</button>)}</div>

              </div>
                <div className="compact-pitch"><div className="compact-control-title">背景音移调</div>
<div className="key-stepper"><button aria-label="降低一个半音" disabled={busy || autoFollow || pitch <= -6} onClick={() => changePitch(pitch - 1)}><Minus size={20}/></button><div><strong data-testid="pitch-value">{pitchLabel}</strong><span>{pitch === 0 ? 'ORIGINAL KEY' : pitch < 0 ? 'LOWER KEY' : 'HIGHER KEY'}</span></div><button aria-label="升高一个半音" disabled={busy || autoFollow || pitch >= 6} onClick={() => changePitch(pitch + 1)}><Plus size={20}/></button></div><input type="range" aria-label="背景音升降调" disabled={busy || autoFollow} min={-6} max={6} step={1} value={pitch} onChange={e => changePitch(Number(e.target.value))}/><div className="range-labels"><span>−6 半音</span><button className="text-button" disabled={busy || autoFollow} onClick={() => changePitch(0)}>回到原调</button><span>+6 半音</span></div></div>
                <div className="compact-mix"><div className="compact-control-title">播放版本</div><div className="recorded-mix-toggle" role="group" aria-label="原唱与伴奏">
                  <button aria-pressed={mix === 'original'} disabled={busy} onClick={() => changeMix('original')}>原曲 · 含原唱</button>
                  <button aria-pressed={mix === 'instrumental'} disabled={busy || !track.instrumentalUrl} onClick={() => changeMix('instrumental')}>伴奏 · 去原唱</button>
                </div><div className="recorded-volume"><Volume2 size={17}/><label htmlFor="track-volume">音量</label><input id="track-volume" type="range" min={0} max={100} value={volume} onChange={e => { const value = Number(e.target.value); setVolume(value); player.current?.setVolume(value / 100); }}/><span>{volume}%</span></div></div>
                <div className="compact-capture"><div className="compact-control-title">听音方式</div><div className="capture-mode-toggle recorded-mix-toggle" role="group" aria-label="听音方式">
                  <button aria-pressed={captureMode === 'headphones'} disabled={busy} onClick={() => { setCaptureMode('headphones'); }}>耳机</button>
                  <button aria-pressed={captureMode === 'speakers'} disabled={busy} onClick={() => { setCaptureMode('speakers'); }}>扬声器</button>
                </div><p className="capture-mode-status" data-testid="capture-mode-status" data-mode={captureMode} data-echo-cancellation={voice.captureMode === captureMode ? String(voice.echoCancellation ?? 'unknown') : 'unknown'}>
                  {captureText}
                </p></div>
              </div>
              <AudioRouteStatus/>
              <LatencyCalibration speed={transport.speed} pitch={pitch} mode={captureMode} profile={calibrationProfile} latencyMs={latencyMs} result={calibration}
                onPrepare={async()=>{await player.current?.pause();}} onBusy={value=>{operation.current=value;setBusy(value);setCalibrating(value);}} onClear={()=>{setLatencyMs(null);setCalibration(null);}}
                onResult={value=>{setCalibration(value);setLatencyMs(value.roundTripMs);}}/>
              </details>
            </section>

            <PracticeSummary session={inputSession} reference={reference} lines={sourceLyrics} playing={transport.playing} started={started} ended={transport.ended} latencyMs={latencyMs} calibrationProfile={calibrationProfile} onLatency={value=>{setLatencyMs(value);setCalibration(null);}} onSeek={previewLine} onContinue={togglePlay} busy={busy}/>
            <section ref={performancePanel} className="performance-panel panel recorded-performance" data-testid="recorded-transport" data-position={transport.position.toFixed(3)} data-playing={transport.playing} data-speed={transport.speed}>
              <div className="performance-top"><div className="live-label"><span className={transport.playing ? 'pulse-dot live' : 'pulse-dot'}/>{loading ? '正在准备音频…' : transport.playing ? '音乐播放中 · 随时跟唱' : transport.ended ? '播放结束' : transport.position > 0 ? '已暂停 · 从这里继续' : '准备好了，就开始'}</div><span className="timecode">{formatTrackTime(transport.position)}<span> / {formatTrackTime(transport.duration)}</span></span></div>
              <div className="singing-mode-bar"><span>固定伴奏 · 跟随歌词与拍点练习</span><label><Mic size={14}/>人声反馈 <input type="checkbox" aria-label="人声反馈" checked={micEnabled} disabled={busy} onChange={e => setMicEnabled(e.target.checked)}/></label></div>
              <PracticeFeedback reference={reference} position={transport.audiblePosition ?? transport.position} pitch={pitch} playing={transport.playing} beats={beats} speed={transport.speed} session={inputSession} tempo={tempo} latencyMs={inputSession.latest?.syncProfile === calibrationProfile ? latencyMs : null}/>
              {referenceIssue && <p className="reference-issue" role="status">{referenceIssue}</p>}
              <div className="practice-focus">
                <LyricEntryCue beatMap={beats} lines={lyrics} position={transport.audiblePosition ?? transport.position} offset={offset} playing={transport.playing} ended={transport.ended} speed={transport.speed} unavailable={!!lyricError}/>
                <VoiceInputFeedback latencyMs={latencyMs} calibrationProfile={calibrationProfile} key={inputReset} referenceUrl={track.referenceUrl} performanceReference={reference} backingShift={pitch} songPosition={transport.position} session={inputSession} enabled={listening && transport.playing && voice.state !== 'error'} paused={!transport.playing && voice.state !== 'error'} status={voice.state}/>
              </div>
              <div className="singing-transport-dock"><div className="track-progress"><input type="range" aria-label="歌曲进度" min={0} max={transport.duration} step={0.1} value={Math.min(transport.position, transport.duration)} disabled={busy} onChange={e => seek(Number(e.target.value))}/></div>
              <div className="recorded-transport-controls">
                <button className="icon-button" title="重置练习并清除识别记录" aria-label="重置练习" disabled={busy} onClick={resetPractice}><RotateCcw size={19}/></button>
                <button className="button primary recorded-play" disabled={busy} onClick={togglePlay}>{transport.playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}{loading ? '正在加载…' : transport.playing ? '暂停' : transport.ended ? '再唱一次' : transport.position > 0 ? '继续播放' : '开始播放'}</button>
                <button className="text-button skip-intro" disabled={busy || !lyrics.length} onClick={() => seek(Math.max(0, firstTime - 2))}>回到第一句<ArrowRight size={14}/></button>
              </div>
              </div>
            </section>


            <details className="practice-details panel" aria-label="分析与诊断">
              <summary>分析详情与诊断</summary>
              <p className="tempo-explanation">练唱模式保持伴奏速度与调性；下面保留实验旋律匹配数据，供排查参考缺口。实验调性估计不参与本次练习评分。</p>
              <KeyComparison voice={voice} backingShift={pitch} automatic={false} paused={!transport.playing}/>
              <div className="voice-follow-status" data-testid="voice-follow-status" data-state={voice.state} data-confidence={(voice.confidence ?? 0).toFixed(3)} role="status"><span className={autoFollow && transport.playing ? 'pulse-dot live' : 'pulse-dot'}/><p>{voiceText}</p></div>
              {listening && <details className="instant-pitch"><summary>查看瞬时音高</summary><div className="voice-notes"><span>你的音符 <strong>{noteName(voice.voiceMidi)}</strong></span><span>原曲音符 <strong>{noteName(voice.referenceMidi)}</strong></span></div><p>音符随旋律变化；这里是实验旋律匹配数据；演唱时以目标音与输入曲线为参考。</p></details>}
              <VoiceDiagnosticPanel voice={voice} playing={transport.playing && listening} onExport={exportVoiceDiagnostics}/>
            </details>

            <details className="take-panel panel" aria-label="本次背景音回放"><summary>伴奏回放与下载（不含人声）</summary>
              <div className="section-title"><Headphones size={17}/><h2>刚才播放的版本</h2><span className="take-state" role="status">{recording?.state === 'recording' ? '正在保存背景音…' : recording?.state === 'processing' ? '正在准备回放…' : ''}</span></div>
              {take ? <div className="take-playback-row"><audio ref={takeAudio} src={take.url} controls={!transport.playing && !busy} aria-label="回放刚才的背景音" onPlay={() => { if (transport.playing || busy) takeAudio.current?.pause(); }} onError={() => setPlaybackError(true)}/><a className="button secondary" href={take.url} download={take.filename}><ArrowDownToLine size={15}/>下载</a></div> : <p className="take-empty">暂停后，可以回放刚才听到的版本，包括播放中的升降调变化。</p>}
              <p className="take-note">{take ? `${formatTrackTime(take.seconds)} · ` : ''}保存实际播放的版本，包括变速、移调与原曲／伴奏切换；不录制你的麦克风。刷新页面后清除。</p>
              {playbackError && <p className="take-note" role="alert">当前浏览器无法回放这段录音，可以下载后播放。</p>}
              {(recording?.state === 'error' || recording?.state === 'unavailable') && <p className="take-note" role="status">本次背景音未能保存，歌曲播放仍可使用。</p>}
            </details>
          </div>
          <div className="side-column recorded-side">
            <details className="panel lyrics-panel" id="song-lyrics"><summary>全部歌词与时间校准</summary><div className="section-title"><Library size={17}/><h2>歌词</h2><span className="subtle-label">点击跳转</span></div>{lyricError && <p className="key-note" role="alert">{lyricError}</p>}<div className="lyrics-list" ref={lyricsList}>{lyrics.map((line, i) => <button key={i} aria-current={i === index ? 'true' : undefined} disabled={busy} onClick={() => { setSelectedLine(i); seek(line.time + offset); }}><time>{formatEntryTime(Math.max(0, line.time + offset))}</time><span>{line.text || '♪'}</span></button>)}</div><div className="lyrics-offset"><label htmlFor="lyric-offset">歌词时间微调</label><select id="lyric-offset" value={offset} onChange={e => changeTiming({ ...timing, offset: Number(e.target.value) })}>{Array.from({ length: 61 }, (_, i) => (i - 30) / 10).map(value => <option key={value} value={value}>{value === 0 ? '原始时间' : `${value > 0 ? '延后' : '提前'} ${Math.abs(value)} 秒`}</option>)}</select></div><p className="lyric-timing-note">整首都偏早或偏晚，可统一微调；只有个别句不准，用下方逐句校准。</p>
              {timingIssue && <p className="calibration-error" role="alert">{timingIssue}</p>}
              <LyricCalibration source={sourceLyrics} timing={timing} duration={transport.duration} selected={selectedLine} onSelect={setSelectedLine} onChange={changeTiming} getPosition={() => player.current?.snapshot().position ?? transport.position} playing={transport.playing} busy={busy} onPreview={previewLine} saved={timingStatus} title={track.title}/>
            </details>
          </div>
        </div>

      </main>
    </div>
  </div>;
}
