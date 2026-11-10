import { useState } from 'react';
import type { LyricLine } from '@/features/singing/audio/lyrics';
import { calibrateLine, exportLrc, originalTiming, roundTime, type LyricTiming } from './lyric-calibration';
import { formatEntryTime } from './lyric-entry';

export function LyricCalibration({ source, timing, duration, selected, onSelect, onChange, getPosition, playing, busy, onPreview, saved, title }: {
  source: LyricLine[]; timing: LyricTiming; duration: number; selected: number; onSelect: (index: number) => void;
  onChange: (timing: LyricTiming) => void; getPosition: () => number; playing: boolean; busy: boolean;
  onPreview: (time: number) => void; saved: string; title: string;
}) {
  const [error, setError] = useState('');
  if (!source.length) return null;
  const time = roundTime(timing.times[selected] + timing.offset);
  const delta = roundTime(timing.times[selected] - source[selected].time);
  const update = (value: number) => {
    try { onChange(calibrateLine(timing, selected, value, duration)); setError(''); }
    catch (error) { setError((error as Error).message); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportLrc(source, timing)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${title}-校准.lrc`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details className="lyric-calibration">
    <summary>逐句校准时间 <span>听原唱，修正入句点</span></summary>
    <p className="lyric-timing-note">选好一句，提前试听；听到原唱开口时点“此刻入句”。选中的句子不会随播放切换。</p>
    <label className="calibration-select">校准哪一句<select aria-label="校准哪一句" value={selected} onChange={e => { onSelect(Number(e.target.value)); setError(''); }}>{source.map((line, i) => <option value={i} key={i}>{i + 1}. {line.text || '♪'}</option>)}</select></label>
    <p className="calibration-lyric">{source[selected].text || '♪'}</p>
    <div className="calibration-time"><span>入句时间</span><strong data-testid="calibrated-time">{formatEntryTime(time)}</strong><small>{delta === 0 ? '本句未调整' : `本句${delta < 0 ? '提前' : '延后'} ${Math.abs(delta).toFixed(2)} 秒`}</small></div>
    <div className="calibration-actions"><button className="button secondary" onClick={() => update(time - .1)}>提前 0.1 秒</button><button className="button secondary" onClick={() => update(time + .1)}>延后 0.1 秒</button></div>
    <div className="calibration-actions"><button className="button secondary" disabled={busy} onClick={() => onPreview(Math.max(0, time - 3))}>提前 3 秒试听</button><button className="button primary" disabled={!playing || busy} onClick={() => update(getPosition())}>此刻入句</button></div>
    <p className="lyric-timing-note">{playing ? '正在播放，可直接打点。' : '播放时可打点；暂停时可微调。'} 人工打点可再微调，并非自动识别人声起点。</p>
    {error && <p className="calibration-error" role="alert">{error}</p>}
    <div className="calibration-actions calibration-reset"><button className="text-button" onClick={() => update(source[selected].time + timing.offset)}>还原本句</button><button className="text-button" onClick={() => { onChange(originalTiming(source)); setError(''); }}>还原全部时间</button></div>
    <button className="button secondary calibration-export" onClick={download}>导出校准后的 LRC</button>
    <p className="lyric-timing-note" role="status">{saved || '修改后自动保存在此浏览器。'} 导出包含整首偏移，原文件保留。</p>
  </details>;
}
