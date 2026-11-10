import type { VoiceFollowStatus } from '@/features/singing/audio/RecordedTrackPlayer';
import { KEY_THRESHOLDS, type KeyDiagnostics } from '@/features/singing/audio/voice-key-follower';

export type KeyPreview = { shift: number; evaluatedAt: number; songTime: number };

/** A display-only candidate. Never authorizes a pitch change or uses a zero-score tie. */
export function previewKey(d?: KeyDiagnostics): KeyPreview | undefined {
  if (!d) return;
  const b = d.best;
  if (b.score <= 0 || d.margin <= 0 || b.compared < KEY_THRESHOLDS.minimumCompared
    || b.matches < KEY_THRESHOLDS.minimumMatches || b.notes < KEY_THRESHOLDS.minimumNotes
    || b.voiceRange < KEY_THRESHOLDS.minimumVoiceRange || b.span < KEY_THRESHOLDS.minimumSpan) return;
  return { shift: b.shift, evaluatedAt: d.evaluatedAt, songTime: d.songTime };
}

export function keyReadiness(voice: VoiceFollowStatus, automatic: boolean, paused: boolean) {
  const d = voice.diagnostics;
  const active = automatic && !paused && !['off', 'error', 'requesting'].includes(voice.state)
    && voice.voiceMidi != null && voice.reason !== 'no-pitch' && voice.reason !== 'position-pending';
  const gates = d?.blockedBy ?? [];
  const evidence = !!d && !gates.some(g => ['compared', 'coverage', 'matches', 'span', 'notes', 'voice-range'].includes(g));
  const fresh = active && voice.keyFresh === true && voice.detectedShift != null;
  const steps = [
    { label: '旋律证据', passed: active && evidence },
    { label: '匹配程度', passed: active && !!d && d.best.score >= KEY_THRESHOLDS.minimumScore },
    { label: '候选区分', passed: active && !!d && d.margin >= KEY_THRESHOLDS.minimumMargin },
    { label: '持续确认', passed: fresh },
  ];
  const state = !automatic ? 'off' : paused ? 'paused' : !active ? 'waiting' : fresh ? 'ready'
    : d && gates.length === 0 ? 'confirming' : 'insufficient';
  const label = { off: '自动移调已关闭', paused: '已暂停 · 暂不移调', waiting: voice.reason === 'position-pending' ? '已收到人声 · 定位中' : '等待人声 · 暂不移调',
    ready: '证据已足够', confirming: '确认中 · 暂不移调', insufficient: '证据不足 · 暂不移调' }[state];
  const reason = voice.state === 'error' ? '麦克风不可用，已有估计保留'
    : !automatic ? '手动控制背景音；已有估计保留' : paused ? '保留上次估计，恢复播放后重新判断'
    : voice.reason === 'position-pending' ? '先确认演唱位置，再比较人声与原唱音高' : !active ? '等待新的清晰音高，已有估计保留'
    : fresh ? '已通过自动移调条件'
    : gates.includes('coverage') ? '这段原唱参考不足'
    : !evidence ? '还需要更多可比对的旋律'
    : gates.includes('score') ? '旋律匹配还不够稳定'
    : gates.includes('margin') ? '多个调性候选接近'
    : '等待候选持续稳定';
  return { active, fresh, state, label, reason, steps };
}
