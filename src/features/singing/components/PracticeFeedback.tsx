import { beatFeedback, type BeatMap } from '@/features/singing/audio/beat-map';
import type { PerformanceReference } from '@/features/singing/audio/aligned-performance';
import { performanceFrameAt } from '@/features/singing/audio/practice-reference';
import { inputNote, recentInputPitch, VOICE_INPUT_FRESH_SECONDS, type VoiceInputSession } from '@/features/singing/audio/voice-input';
import { practiceTiming, signedMilliseconds } from '@/features/singing/audio/practice-feedback';
import type { TempoEstimate } from '@/features/singing/audio/vocal-tempo-follower';

export function PracticeFeedback({ reference, position, pitch, playing, beats, speed, session, tempo, latencyMs }: {
  reference: PerformanceReference | null; position: number; pitch: number; playing: boolean; beats: BeatMap | null; speed: number; session: VoiceInputSession;
  tempo: TempoEstimate; latencyMs: number | null;
}) {
  const target = performanceFrameAt(reference, position);
  const live = !!(playing && session.active && session.latest && performance.now() / 1000 - session.latest.time <= VOICE_INPUT_FRESH_SECONDS);
  const reading = !playing || live ? recentInputPitch(session.window(), session.position, playing) : null;
  const beat = beatFeedback(beats, position, speed);
  const timing = practiceTiming(tempo, speed, latencyMs, playing, live);
  return <>
    <div className="practice-feedback-strip" aria-label="演唱提示">
      <div className="beat-coach"><i className={playing && beat?.pulse ? 'beat-light on' : 'beat-light'}/><span>{beat ? `约 ${Math.round(beat.bpm)} BPM` : '拍点待就绪'}</span><small>伴奏拍点 · 非人声判分</small>
        <div className="beat-phase-reference" aria-label={beat ? `估计拍点 ${Math.floor(beat.beat)+1}，拍内进度 ${Math.round(beat.beat%1*100)}%` : '暂无拍点'}>
          <div className="beat-phase-rail"><b className={playing && beat && beat.beat%1 < .16 ? 'lit' : ''}/><b className={playing && beat && Math.abs(beat.beat%1-.5)<.08 ? 'lit' : ''}/>{beat && <i style={{left:`${beat.beat%1*100}%`}}/>}</div><div className="beat-phase-labels"><span>正拍</span><span>反拍 &</span><span>下一拍</span></div>
        </div>
      </div>
      <div><span>目标音</span><strong className="target-note" data-testid="target-note">{target ? inputNote(target[1] + pitch) : '—'}</strong><small>{target ? '按伴奏调性 · 可换八度' : reference ? '此处没有可靠音高参考' : '参考加载中 / 不可用'}</small></div>
      <div><span>{!playing ? '最近识别音高' : reading?.held ? '刚才的音高' : '你正在唱'}</span><strong className="singer-note" data-testid="singer-note">{reading ? inputNote(reading.midi) : '—'}</strong><small>{reading ? `${Math.round(reading.frame.pitchHz!)} Hz${reading.held ? ` · 距最后输入 ${reading.age.toFixed(2)} 秒` : ' · 实测音高'}` : playing ? '等待清晰音高' : '暂无音高记录'}</small></div>
    </div>
    <div className="practice-timing-observation" data-testid="practice-timing" data-confirmed={timing.confirmed}>
      <strong>{timing.label}</strong>
      <span>{timing.seconds !== null ? `${timing.confirmed ? '观测偏移' : '候选偏移'} ${signedMilliseconds(timing.seconds)}` : '尚无时间偏移'}</span>
      <small>{timing.reason}{timing.seconds !== null && !timing.confirmed ? '；候选含设备延迟，不作为纠正指令' : ''}</small>
    </div>
  </>;
}
