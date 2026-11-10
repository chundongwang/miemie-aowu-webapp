'use client';

import { referenceTimeForFrame, frameLatency } from '@/features/singing/audio/audio-sync';

import type { PerformanceReference } from '@/features/singing/audio/aligned-performance';
import { performanceFrameAt } from '@/features/singing/audio/practice-reference';
import { memo, useEffect, useId, useState } from 'react';
import { Mic } from 'lucide-react';
import { inputLevel, inputMidi, inputNote, pitchSegments, recentInputPitch, VOICE_HISTORY_SECONDS, VOICE_INPUT_FRESH_SECONDS, type VoiceInputSession } from '@/features/singing/audio/voice-input';
import { validateVocalReference, type VocalReference } from '@/features/singing/audio/voice-key-follower';
import { referenceIndicators, referenceState } from '@/features/singing/audio/reference-indicator';
import type { VoiceFollowStatus } from '@/features/singing/audio/RecordedTrackPlayer';
import { pitchScale } from '@/features/singing/audio/pitch-scale';

export const VoiceInputFeedback = memo(function VoiceInputFeedback({ session, enabled, paused, status, referenceUrl, songPosition, performanceReference = null, backingShift = 0, latencyMs = null, calibrationProfile }: {
  session: VoiceInputSession; enabled: boolean; paused: boolean; status: VoiceFollowStatus['state']; referenceUrl: string; songPosition: number; performanceReference?: PerformanceReference | null; backingShift?: number; latencyMs?: number | null; calibrationProfile?: string;
}) {
  const patternId = useId().replace(/:/g, '');
  const [reference, setReference] = useState<VocalReference | null>(null);
  const [referenceLoad, setReferenceLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    setReference(null); setReferenceLoad('loading');
    void fetch(referenceUrl, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Reference unavailable');
      const data = validateVocalReference(await response.json());
      if (!controller.signal.aborted) { setReference(data); setReferenceLoad('ready'); }
    }).catch(() => { if (!controller.signal.aborted) setReferenceLoad('error'); });
    return () => controller.abort();
  }, [referenceUrl]);
  const [view, setView] = useState({ version: session.version, live: false });
  const [reviewEnd, setReviewEnd] = useState<number | null>(null);
  const [halfSpan, setHalfSpan] = useState(12);
  const [manualCenter, setManualCenter] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => {
      const live = enabled && session.active && !!session.latest && performance.now() / 1000 - session.latest.time <= VOICE_INPUT_FRESH_SECONDS;
      setView(previous => previous.version === session.version && previous.live === live ? previous : { version: session.version, live });
    };
    refresh();
    const timer = window.setInterval(refresh, 50);
    return () => window.clearInterval(timer);
  }, [session, enabled]);

  const [corrected, setCorrected] = useState(true);
  const frozen = !view.live && session.count > 0;
  const current = view.live || frozen ? session.latest : null;
  const level = inputLevel(current?.rms ?? 0);
  const state = status === 'error' ? 'error' : !enabled && paused && frozen ? 'paused' : !enabled ? 'off' : status === 'requesting' ? 'requesting' : !view.live ? 'waiting' : inputMidi(current) !== null ? 'pitched' : level > 0 ? 'sound' : 'quiet';
  const message = { paused: '已暂停 · 本次识别记录已保留', error: '麦克风不可用 · 已有记录保留', off: '麦克风未开启 · 已有记录保留', requesting: '正在连接麦克风 · 已有记录保留', waiting: '等待新输入 · 已有记录保留', pitched: '正在收到声音 · 音高清晰', sound: '收到声音 · 音高尚不清晰', quiet: '麦克风已连接 · 等待声音' }[state];
  const end = reviewEnd === null ? session.position : Math.min(reviewEnd, session.position);
  const history = session.window(end);
  const reading = recentInputPitch(history, end, view.live && reviewEnd === null);
  const midi = reading?.midi ?? null;
  const segments = pitchSegments(history);
  const preview = session.count === 0;
  const rawReferenceHistory: import('@/features/singing/audio/voice-input').VoiceInputFrame[] = preview ? Array.from({ length: 161 }, (_, i) => ({
    time: end - 8 + i * .05, songTime: songPosition - 8 + i * .05, rms: 0, pitchHz: null, confidence: 0,
  })) : history;
  const referenceHistory = rawReferenceHistory.map(frame => ({ ...frame, songTime: referenceTimeForFrame(frame, corrected ? latencyMs : null, calibrationProfile) }));
  const targetSegments: { time: number; midi: number }[][] = [];
  let targetSegment: { time: number; midi: number }[] = [];
  for (let i = 0; i < referenceHistory.length; i++) {
    const frame = referenceHistory[i];
    const target = performanceFrameAt(performanceReference, frame.songTime ?? -1);
    const previous = referenceHistory[i - 1];
    if (!target || (previous && (frame.time - previous.time > .18 || frame.segment !== previous.segment))) {
      if (targetSegment.length) targetSegments.push(targetSegment);
      targetSegment = [];
    }
    if (target) targetSegment.push({ time: frame.time, midi: target[1] + (frame.backingShift ?? backingShift) });
  }
  if (targetSegment.length) targetSegments.push(targetSegment);
  const indicators = referenceIndicators(referenceHistory, reference);
  const displayedSongTime = preview ? songPosition : referenceHistory.at(-1)?.songTime;
  const currentReference = referenceState(reference, displayedSongTime);
  const referenceLabel = referenceLoad === 'loading' ? '参考加载中' : referenceLoad === 'error' ? '参考加载失败'
    : currentReference === 'available' ? '有参考音高' : currentReference === 'gap' ? '无参考音高' : '参考状态未知';
  const voicedCount = history.filter(frame => inputMidi(frame) !== null).length;
  const x = (time: number) => 42 + Math.max(0, Math.min(1, (time - end + VOICE_HISTORY_SECONDS) / VOICE_HISTORY_SECONDS)) * 550;
  const voiceNotes = segments.flatMap(segment => segment.map(p => p.midi));
  const scale = pitchScale(targetSegments.flatMap(segment => segment.map(p => p.midi)), voiceNotes, halfSpan, manualCenter);
  const y = scale.y;
  const outside = voiceNotes.filter(note => note < scale.low || note > scale.high).length;
  return <section className="voice-input-feedback" aria-label="麦克风实时反馈" data-testid="voice-input-feedback" data-state={state} data-points={history.length} data-total-points={session.count} data-end={end.toFixed(3)}>
    <div className="voice-input-heading"><span><Mic size={15}/>你的声音 <small className="pitch-trace-legend">橙 · 人声 / 青 · 目标</small></span><small>{reviewEnd !== null ? '查看历史' : frozen ? '已保存' : '最近'} {VOICE_HISTORY_SECONDS} 秒</small></div>
    <div className="voice-input-live">
      <div><span className="voice-input-status" data-testid="input-status">{message}</span><div className="voice-input-meter" role="meter" aria-label="麦克风输入强度" aria-valuetext={frozen ? `上次输入强度 ${Math.round(level * 100)}` : undefined} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}><i style={{ transform: `scaleX(${level})` }}/></div></div>
      <div className="voice-input-note"><small>{reviewEnd !== null ? '所选记录最近音高' : frozen ? '最近识别音高' : reading?.held ? '刚才的音高' : '当前音高'}</small><strong data-testid="input-note">{midi === null ? '—' : inputNote(midi)}</strong><span data-testid="input-frequency">{reading ? `${Math.round(reading.frame.pitchHz!)} Hz${reading.held ? ` · 距此 ${reading.age.toFixed(2)} 秒` : ''}` : '这段记录暂无清晰音高'}</span></div>
    </div>
    {latencyMs !== null && <label className="sync-chart-toggle"><input type="checkbox" checked={corrected} onChange={e=>setCorrected(e.target.checked)}/>延迟补偿 · {Math.round(latencyMs)} ms · 本窗口 {history.filter(f=>frameLatency(f, latencyMs, calibrationProfile)!==null).length} 帧适用 <small>关闭查看原始时间；仅补偿匹配设备设置的记录</small></label>}
    <svg className="voice-input-chart" viewBox="0 0 608 207" role="img" aria-label="人声音高、输入强度和原唱参考状态；参考行实色表示有参考，斜纹表示无参考">
      <defs><pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#f0eee7"/><path d="M-1 1L1 -1M0 5L5 0M4 6L6 4" stroke="#b9b4a6" strokeWidth="1"/></pattern></defs>
      <defs><clipPath id={`${patternId}-pitch`}><rect x="42" y="14" width="552" height="124"/></clipPath></defs>
      {scale.ticks.map(note => <g key={note}><text x="2" y={y(note) + 3}>{inputNote(note)}</text><line x1="42" x2="592" y1={y(note)} y2={y(note)} className="voice-input-grid"/></g>)}
      <g clipPath={`url(#${patternId}-pitch)`}>
      {targetSegments.map((segment, i) => <polyline key={`target-${i}`} points={segment.map(point => `${x(point.time).toFixed(1)},${y(point.midi).toFixed(1)}`).join(' ')} className="practice-target-trace"/>)}
      {segments.map((segment, i) => <polyline key={i} data-testid="input-pitch-segment" points={segment.map(point => `${x(point.time).toFixed(1)},${y(point.midi).toFixed(1)}`).join(' ')} className="voice-input-trace"/>)}
      {segments.filter(segment => segment.length === 1).map((segment, i) => <circle key={i} cx={x(segment[0].time)} cy={y(segment[0].midi)} r="1.5" className="voice-input-point"/>)}
      </g>
      <text x="2" y="159">输入</text>
      {history.map(frame => <line key={frame.time} x1={x(frame.time)} x2={x(frame.time)} y1="163" y2={163 - inputLevel(frame.rms) * 17} className="voice-input-amplitude"/>)}
      <text x="2" y="182">参考</text>
      {indicators.map((point, index) => <rect key={index} data-testid="reference-band" data-reference={point.state} x={x(point.time)} y="174"
        width={Math.max(1, Math.min(592 - x(point.time), x(point.end) - x(point.time)))} height="9" rx="1"
        fill={point.state === 'available' ? '#668b88' : point.state === 'gap' ? `url(#${patternId})` : '#e9ece7'}>
        <title>{point.songTime === undefined || point.songTime < 0 ? '未记录' : `歌曲 ${point.songTime.toFixed(2)} 秒：${point.state === 'available' ? '有参考音高' : point.state === 'gap' ? '无参考音高' : '参考状态未知'}`}</title>
      </rect>)}
      <text x="42" y="205">−8 秒</text><text x="312" y="205" textAnchor="middle">−4 秒</text><text x="592" y="205" textAnchor="end">{reviewEnd !== null ? '所选位置' : frozen ? '上次输入' : '现在'}</text>
      {!segments.length && <text x="317" y="65" textAnchor="middle" className="voice-input-empty">{history.length ? '这段记录没有清晰音高' : enabled ? '唱出一个音，音高会出现在这里' : '播放并开启「人声反馈」以查看输入'}</text>}
    </svg>
    <details className="singing-chart-settings"><summary>音高范围与缩放</summary>
    <div className="pitch-scale-controls">
      <label>音高范围 <select aria-label="音高图范围" value={halfSpan} onChange={e => setHalfSpan(Number(e.target.value))}><option value={6}>上下各 6 半音</option><option value={12}>上下各 1 八度</option><option value={24}>上下各 2 八度</option><option value={0}>全音域 C2–C6</option></select></label>
      {halfSpan > 0 && <><button aria-label="音高图中心降低一个八度" onClick={() => setManualCenter(scale.center-12)}>−8度</button><button aria-label="音高图中心升高一个八度" onClick={() => setManualCenter(scale.center+12)}>+8度</button><button disabled={manualCenter === null} onClick={() => setManualCenter(null)}>自动居中</button></>}
      <small>{inputNote(scale.low)}–{inputNote(scale.high)}{outside > 0 ? ` · ${outside} 帧超出图外（原始值保留）` : ''}</small>
    </div>
    </details>
    <div className="reference-indicator-legend">
      <span className={`reference-indicator-current ${currentReference}`} data-testid="reference-status" data-reference={currentReference}>
        {preview ? '歌曲当前位置' : reviewEnd !== null ? '所选位置' : frozen ? '上次记录' : '当前输入位置'} · {referenceLabel}
      </span>
      <span><i className="reference-swatch available"/>有参考</span><span><i className="reference-swatch gap"/>无参考</span><span><i className="reference-swatch unknown"/>未知</span>
    </div>
    {session.count > 0 && <div className="voice-history-controls">
      <label htmlFor="voice-history">本次记录 · {Math.floor(session.position / 60)}:{String(Math.floor(session.position % 60)).padStart(2, '0')}</label>
      <input id="voice-history" aria-label="查看人声识别历史" type="range" min={0} max={session.position} step="any" value={end} onChange={event => setReviewEnd(Number(event.target.value))}/>
      <button className="text-button" disabled={reviewEnd === null} onClick={() => setReviewEnd(null)}>回到最新</button>
    </div>}
    <p data-testid="input-coverage">这段记录 · {voicedCount} / {history.length} 帧有有效音高。</p>
    <details className="input-help"><summary>图例与记录说明</summary>
    <p>{preview ? '参考带预览歌曲当前位置之前 8 秒；播放并开启麦克风后，与输入记录对齐。' : '参考带按记录时的歌曲位置显示，未补偿演唱延迟；有参考不代表唱准，无参考也可能是换气或休止。'}</p>
    <p>记录保留至重置或重新加载歌曲。橙线：人声音高 · 绿条：输入强度。音符随旋律变化，青线：按伴奏调性显示的字级参考。开启已测延迟补偿后，青线按校准后的歌曲位置对照；原始人声与演唱早晚保留。不同设备设置或旧版本的记录不自动套用校准。换气与不确定音高留空。</p>
    </details>
  </section>;
});
