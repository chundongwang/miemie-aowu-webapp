import { useEffect, useMemo, useRef } from 'react';
import type { PerformanceReference } from '@/features/singing/audio/aligned-performance';
import { analyzePractice } from '@/features/singing/audio/practice-analysis';
import { formatTrackTime, type LyricLine } from '@/features/singing/audio/lyrics';
import type { VoiceInputSession } from '@/features/singing/audio/voice-input';
import { signedMilliseconds } from '@/features/singing/audio/practice-feedback';

export function PracticeSummary({ session, reference, lines, playing, started, ended, latencyMs, calibrationProfile, onLatency, onSeek, onContinue, busy }: {
  session: VoiceInputSession; reference: PerformanceReference | null; lines: LyricLine[];
  playing: boolean; started: boolean; ended: boolean; latencyMs: number | null; calibrationProfile?: string;
  onLatency: (value: number | null) => void; onSeek: (time: number) => void; onContinue: () => void; busy: boolean;
}) {
  const summary = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!playing && started && !busy) summary.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [playing, started]);
  const version = session.version;
  const report = useMemo(() => playing ? null : analyzePractice(session.snapshot(), reference, latencyMs, calibrationProfile), [playing, version, session, reference, latencyMs, calibrationProfile]);
  if (playing || !started || !report) return null;
  return <section ref={summary} className="practice-summary panel" aria-label="本次练习总结" data-testid="practice-summary">
    <div className="summary-heading"><div><span className="eyebrow">YOUR PRACTICE</span><h2>{ended ? '这一遍，唱完了' : '休息一下，看看刚才的表现'}</h2></div><button className="button secondary" disabled={busy} onClick={onContinue}>{ended ? '再练一遍' : '继续练唱'} →</button></div>
    <div className="summary-metrics">
      <div><span>音准 · 可比较片段</span><strong data-testid="pitch-summary">{report.pitchScore === null ? '待评价' : `${report.pitchScore}%`}</strong><small>在目标 ±50 音分内的帧占比 · 八度等价</small></div>
      <div><span>{report.timingScore === null ? '节奏 · 观测偏移中位数' : '节奏 · 片段入拍'}</span><strong data-testid="timing-summary">{report.timingScore !== null ? `${report.timingScore}%` : report.medianLag !== null ? signedMilliseconds(report.medianLag) : '尚无可靠匹配'}</strong><small>{report.timingScore === null ? '含设备延迟 · 尚无适用校准的可评分片段' : '匹配设备设置的片段：校准后偏移在 ±150 ms 内的占比'}</small>{report.excerpts.length > 0 && latencyMs === null && <small>片段范围 {signedMilliseconds(Math.min(...report.excerpts.map(e => e.lagSeconds)))} 至 {signedMilliseconds(Math.max(...report.excerpts.map(e => e.lagSeconds)))}</small>}</div>
      <div><span>可评价覆盖率</span><strong>{Math.round(report.coverage * 100)}%</strong><small>{report.compared} / {report.voiced} 有效音高帧 · {report.excerpts.length} 个片段</small></div>
      <div><span>输入记录</span><strong>{formatTrackTime(report.seconds)}</strong><small>全程采样（含前奏 / 间奏）· 清晰音高 {report.frames ? Math.round(report.voiced / report.frames * 100) : 0}%</small></div>
    </div>
    <p className="summary-context">{!report.frames ? '本次还没有麦克风记录。开启「人声反馈」后跟唱，就能保留音高与练习记录。'
      : !reference ? '字级音高参考尚未就绪，已保留人声；参考就绪后可重新评价。'
      : !report.excerpts.length ? '已保留输入，但还没有足够明确的旋律对应片段。未识别、参考缺口和外放输入不计为唱错；可戴耳机再唱一段有音高变化的旋律。'
      : '这是已匹配片段的练习指标，不是整首歌成绩。先独立对齐旋律，再比较音高；早晚偏移另计，不重复扣音准。未匹配的片段仍未评价。'}</p>
    <div className="summary-advice"><strong>下次用什么调？</strong><span>暂不自动建议升降调。偏高、偏低也可能是跑调；还需要结合高低音区的稳定性和你的舒适度。可以手动换调，再比较同一段。</span></div>
    {report.excerpts.length > 0 && <details className="summary-excerpts"><summary>查看 {report.excerpts.length} 个片段 · 点击回练</summary>
      <div className="summary-table"><table><thead><tr><th>歌词 / 位置</th><th>音准达标</th><th>音高误差中位数</th><th>{latencyMs === null ? '观测偏移（含设备延迟）' : '校准后入拍偏移'}</th></tr></thead><tbody>{report.excerpts.map((e, i) => <tr key={i}>
        <td><button className="text-button" onClick={() => onSeek(Math.max(0, e.start - 2))}>{formatTrackTime(e.start)} · {lines[e.lineIndex]?.text ?? '旋律片段'}</button></td><td>{e.pitchScore}%</td><td>{e.cents} 音分</td><td>{Math.round((e.timingError ?? e.lagSeconds) * 1000)} ms{e.timingError !== null ? e.timingError > .15 ? ' · 偏晚' : e.timingError! < -.15 ? ' · 偏早' : ' · 接近拍点' : ' · 未校准'}</td>
      </tr>)}</tbody></table></div></details>}
    <details className="summary-method"><summary>评分口径与延迟设置</summary><p>按连续 3 秒片段，在 ±1.5 秒内比较旋律形状；不识别你唱了哪个字。只评价对应关系明确的片段，参考缺失、重复旋律和外放不评分。音准按录制当时的伴奏移调计算；节奏保留偏移，不将首次入拍当作零点。不同片段的变速尚不做逐字节奏评分。</p>
      <label>已独立测量的总链路延迟（ms，含伴奏处理）<input aria-label="已测设备延迟" type="number" disabled={busy} min="0" max="1500" step="10" placeholder="未知" value={latencyMs ?? ''} onChange={e => onLatency(e.target.value === '' ? null : Math.max(0, Math.min(1500, Number(e.target.value))))}/></label><p>未测量请留空。不要用本次演唱的落后量来校准；切换设备、听音方式、速度或移调会清除该值。仅保留本页数字特征，刷新或重载歌曲后清除。</p>
    </details>
  </section>;
}
