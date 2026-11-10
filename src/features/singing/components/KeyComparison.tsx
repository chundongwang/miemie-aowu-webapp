import type { VoiceFollowStatus } from '@/features/singing/audio/RecordedTrackPlayer';
import { keyReadiness } from './key-feedback';

export const keyLabel = (shift: number) => shift === 0 ? '原调' : `${shift > 0 ? '+' : ''}${shift} 半音`;

export function KeyComparison({ voice, backingShift, automatic, paused = false }: {
  voice: VoiceFollowStatus; backingShift: number; automatic: boolean; paused?: boolean;
}) {
  const readiness = keyReadiness(voice, automatic, paused);
  const detected = voice.detectedShift ?? null;
  const preview = voice.preview;
  const previewCurrent = readiness.active && !!preview && preview.evaluatedAt === voice.diagnostics?.evaluatedAt;
  const vocalLabel = readiness.fresh ? keyLabel(detected!) : preview ? `倾向${keyLabel(preview.shift)}`
    : detected !== null ? keyLabel(detected) : '未确认调性';
  const freshness = readiness.fresh ? '已确认' : preview ? previewCurrent ? '初步估计' : '上次估计' : detected !== null ? '上次确认' : '等待旋律';
  const action = readiness.fresh ? detected === backingShift ? `保持${keyLabel(backingShift)}` : `目标${keyLabel(detected!)}` : readiness.reason;
  return <section className="key-comparison" aria-label="实时调性对照" data-testid="key-comparison" data-fresh={readiness.fresh}>
    <div className="key-comparison-grid">
      <div><span>参考调</span><strong>原调</strong><small>歌曲基准 · 0 半音</small></div>
      <div className={`vocal-key ${readiness.fresh ? 'confirmed' : ''}`} title="人声相对原曲的估计移调；初步估计不会触发伴奏换调">
        <span>人声估计 <em data-testid="vocal-key-freshness">· {freshness}</em></span>
        <strong data-testid="vocal-key">{vocalLabel}</strong>
      </div>
      <div><span>背景音乐</span><strong data-testid="backing-key">{keyLabel(backingShift)}</strong><small>{automatic ? '自动跟调' : '手动调性'}</small></div>
    </div>
    <div className="key-readiness" data-testid="key-readiness" data-state={readiness.state} aria-label="自动移调就绪状态">
      <div className="key-readiness-status" title={readiness.reason}><i aria-hidden="true"/><strong>{readiness.label}</strong></div>
      <div className="key-readiness-steps" aria-label="自动移调所需条件">{readiness.steps.map(step =>
        <span key={step.label} data-passed={step.passed} aria-label={`${step.label}：${step.passed ? '已满足' : '未满足'}`}><i aria-hidden="true">{step.passed ? '✓' : '·'}</i>{step.label}</span>
      )}</div>
      <p className="key-readiness-reason" data-testid="key-relation">{action}</p>
    </div>
  </section>;
}
