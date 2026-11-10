import type { VoiceFollowStatus } from '@/features/singing/audio/RecordedTrackPlayer';
import { KEY_THRESHOLDS } from '@/features/singing/audio/voice-key-follower';
import { keyLabel } from './KeyComparison';

const gates: Record<string, string> = { compared: '可比样本不足', coverage: '参考覆盖不足', matches: '匹配音符不足', span: '匹配时长不足', notes: '旋律音级不足', 'voice-range': '人声旋律变化不足', score: '匹配分数不足', margin: '多个调性候选接近' };
const percent = (value: number) => `${Math.round(value * 100)}%`;
export function VoiceDiagnosticPanel({ voice, playing, onExport }: { voice: VoiceFollowStatus; playing: boolean; onExport: () => void }) {
  const d = voice.diagnostics;
  return <details className="voice-input-feedback" data-testid="voice-diagnostics">
    <summary>调性识别诊断 · 导出日志</summary>
    <p>自动记录本次练习的音高、歌曲位置和判断依据。仅保存在本页，不包含麦克风录音，不自动上传；暂停保留，重置或重新加载歌曲后清空。</p>
    {d ? <>
      <p data-testid="diagnostic-reason">{playing && voice.voiceMidi != null ? '最近一次判断' : '上次有效判断'}（歌曲 {d.songTime.toFixed(2)} 秒）：{d.blockedBy.length ? d.blockedBy.map(gate => gates[gate] ?? gate).join('；') : voice.keyFresh ? '已确认' : '等待候选持续稳定'}</p>
      <p>候选：{keyLabel(d.best.shift)}（未通过条件时不代表已识别） · 比对偏移 {Math.round(d.best.delay * 1000)} ms</p>
      <p>参考覆盖 {percent(d.best.coverage)} / 要求 {percent(KEY_THRESHOLDS.minimumCoverage)} · 可比 {d.best.compared} / {d.samples} 帧 · 匹配 {d.best.matches} 帧 / 要求 {KEY_THRESHOLDS.minimumMatches} 帧</p>
      <p>原始匹配分 {percent(d.best.rawScore)} · 门槛后得分 {percent(d.best.score)} / 要求 {percent(KEY_THRESHOLDS.minimumScore)} · 领先差 {percent(d.margin)} / 要求 {percent(KEY_THRESHOLDS.minimumMargin)}</p>
      <p>匹配跨度 {d.best.span.toFixed(2)} 秒 · 音级 {d.best.notes} 个 · 人声变化 {d.best.voiceRange.toFixed(2)} 半音 · 候选稳定 {d.candidateAge.toFixed(2)} 秒</p>
    </> : <p>开启「人声反馈」即可记录音高。这里的实验调性比较还需先确认旋律位置；暂无判断不代表没有收到人声。</p>}
    <button className="text-button" onClick={onExport}>导出诊断日志 JSON</button>
  </details>;
}
