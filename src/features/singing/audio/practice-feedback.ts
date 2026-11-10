import type { TempoEstimate } from './vocal-tempo-follower';

const reasons: Record<string, string> = {
  'melody-match': '旋律对应不够明确', 'timing-ambiguous': '多个时间位置接近',
  'search-boundary': '可能超出搜索范围', 'melody-variety': '旋律变化不足',
  'reference-gap': '参考不足', 'collecting': '正在积累旋律', 'confirming': '正在确认',
  'no-pitch': '等待清晰音高', 'inactive': '已暂停',
};

/** Observation is separate from correctness and never drives the accompaniment. */
export function practiceTiming(tempo: TempoEstimate, speed: number, latencyMs: number | null, playing: boolean, inputFresh: boolean) {
  const stale = playing && (!inputFresh || (tempo.ageSeconds ?? Infinity) > .5);
  const available = !stale && tempo.lag !== null && Number.isFinite(tempo.lag) && tempo.samples > 0;
  const confirmed = available && tempo.positionReady === true && tempo.state !== 'holding';
  const seconds = available ? tempo.lag! / speed - (confirmed && latencyMs !== null ? latencyMs / 1000 : 0) : null;
  return {
    seconds, confirmed,
    label: !playing ? available ? '已暂停 · 上次位置估计' : '人声节奏 · 等待输入' : confirmed ? '已匹配旋律位置' : '位置尚未确认',
    reason: !playing && !available ? '播放后比较人声与参考旋律' : stale ? '等待新的可比输入' : confirmed
      ? latencyMs === null ? '含设备延迟，不能据此判赶拍或拖拍' : '已减去手动校准延迟'
      : tempo.blockedBy.map(r => reasons[r]).filter(Boolean).slice(0, 2).join(' · ') || '尚无可靠对应',
  };
}

export const signedMilliseconds = (seconds: number) => `${seconds >= 0 ? '+' : '−'}${Math.round(Math.abs(seconds) * 1000)} ms`;
