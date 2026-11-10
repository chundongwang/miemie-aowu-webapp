import { activeCharacter, type PracticeLine } from '@/features/singing/audio/practice-reference';
import { useState } from 'react';
import { beatPosition, characterBeats, type BeatMap } from '@/features/singing/audio/beat-map';
import { lyricIndexAt, type LyricLine } from '@/features/singing/audio/lyrics';
import { formatEntryTime, lyricEntryCue } from './lyric-entry';
import { RhythmDots } from './RhythmDots';

/** Each line keeps its DOM identity as it travels from the countdown to the singing position. */
export function LyricEntryCue({ lines, position, offset, playing, ended, speed = 1, unavailable = false, beatMap = null }: {
  lines: (LyricLine & Partial<PracticeLine>)[]; position: number; offset: number; playing: boolean; ended: boolean; speed?: number; unavailable?: boolean; beatMap?: BeatMap | null;
}) {
  const [showRhythm, setShowRhythm] = useState(true);
  const index = lyricIndexAt(lines, position - offset);
  const resting = index >= 0 && lines[index].end != null && position - offset > lines[index].end! + .7 && index < lines.length - 1;
  const cue = lyricEntryCue(lines, position, offset, playing, ended, speed);
  return <div className={`lyric-stage${showRhythm && beatMap ? ' rhythm-enabled' : ''}`} aria-label="当前歌词">
    {beatMap && <div className="lyric-rhythm-control"><label><input type="checkbox" checked={showRhythm} onChange={e=>setShowRhythm(e.target.checked)}/>逐字拍点参考</label><small className="rhythm-dot-legend" title="按估计拍点，一点约 ¼ 拍；四分音符为一拍时相当于十六分音符。点数取近似值，小点表示不足半格，横线表示未知。悬停歌词可看准确估计值；不是乐谱转录。"><RhythmDots duration={.25}/>≈ ¼ 拍<RhythmDots duration={1}/>≈ 1 拍 · 估计</small></div>}
    <div className="lyric-stage-caption">{ended ? '唱完了，再来一次？' : index < 0 ? '前奏 · 看下方提示准备加入' : resting ? '过门 · 看下一句的入场提示' : `${playing ? '正在唱' : '已暂停'} · 第 ${index + 1} / ${lines.length} 句`}</div>
    <div className="lyric-card-window" data-long-lines={lines.slice(Math.max(0, index), index + 2).some(line => line.text.replace(/\s/g, '').length > 12)}>
      {index < 0 && <div className="lyric-stage-placeholder" data-testid="current-lyric">{unavailable ? '歌词暂不可用，音乐仍可播放' : '让节奏先开始'}</div>}
      {lines.map((line, i) => {
        if (i < index - 1 || i > index + 3) return null;
        const slot = i - index;
        const characters = line.characters ?? [];
        const highlighted = activeCharacter(characters, position - offset);
        const active = slot === 0;
        const target = cue.targetIndex === i && !ended;
        const time = Math.max(0, line.time + offset);
        const currentBeat = beatPosition(beatMap, position), entryBeat = beatPosition(beatMap, time);
        const beatsRemaining = currentBeat !== null && entryBeat !== null ? Math.max(0, entryBeat - currentBeat) : null;
        const remaining = Math.max(0, time - position) / speed;
        const progress = Math.max(0, Math.min(1, 1 - remaining / 3));
        const phase = active ? 'enter' : !playing ? 'paused' : remaining <= 3 ? 'countdown' : 'waiting';
        return <div key={i} className={`lyric-card entry-cue entry-${phase}`} data-line={i} data-slot={slot}
          aria-hidden={slot < 0 || slot > 3} data-testid={target ? 'entry-cue' : undefined} data-phase={target ? cue.phase : phase} data-target={i}>
          <div className="entry-cue-heading lyric-card-chrome">
            <span className="entry-signal">{slot > 1 ? '稍后' : active ? '现在唱' : playing && remaining <= 3 ? '准备入句' : '待入句'}</span>
            <time data-testid={target ? 'entry-time' : undefined}>{formatEntryTime(time)} 入句{slot === 1 && beatsRemaining !== null && <span className="entry-beat-count" data-testid="entry-beats"> · 约 {beatsRemaining.toFixed(1)} 拍</span>}</time>
            <strong data-testid={target && !active ? 'entry-countdown' : undefined}>{active ? '✓' : (Math.ceil(remaining * 10) / 10).toFixed(1)}<small>{active ? '' : playing ? '秒后' : '秒 · 暂停'}</small></strong>
          </div>
          <p className="lyric-card-text" data-testid={active ? 'current-lyric' : undefined}>{characters.length ? characters.map((c, ci) => {
            const rhythm = showRhythm && c.usable && slot >= 0 && slot <= 1 ? characterBeats(beatMap, c.start + offset, c.end + offset) : null;
            const rhythmDescription = rhythm ? `${c.text}：估计${rhythm.placement}进入，持续 ${rhythm.duration.toFixed(2)} 拍${rhythm.duration >= 4.125 ? '（超过点阵上限，+ 表示更多）' : ''}` : `${c.text}：拍点参考未知`;
            return <span key={ci} className={`${active && highlighted === ci ? 'karaoke-character current' : active && c.end <= position - offset ? 'karaoke-character sung' : 'karaoke-character'}${showRhythm && beatMap && slot <= 1 ? ' with-rhythm' : ''}`} data-testid={active && highlighted === ci ? 'current-character' : undefined} title={showRhythm && beatMap ? rhythmDescription : undefined}>{c.text}{showRhythm && beatMap && slot >= 0 && slot <= 1 && <span className="character-rhythm" data-testid="character-rhythm" role="img" aria-label={rhythmDescription}><RhythmDots duration={rhythm?.duration ?? null}/></span>}</span>;
          }) : line.text || '♪'}</p>
          <div className="lyric-card-chrome" aria-hidden="true">
            <div className="entry-runway"><i style={{ transform: `scaleX(${progress})` }}/><b style={{ left: `${progress * 100}%` }}/></div>
            <div className="entry-ticks"><span>3 秒</span><span>2</span><span>1</span><span>唱</span></div>
          </div>
        </div>;
      })}
      {index === lines.length - 1 && index >= 0 && <p className="lyric-stage-outro">{ended ? '演唱结束' : '最后一句 · 唱完收尾'}</p>}
    </div>
  </div>;
}
