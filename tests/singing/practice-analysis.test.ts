import { describe, expect, it } from 'vitest';
import { analyzePractice } from '../../src/features/singing/audio/practice-analysis';
import { activeCharacter, practiceLines } from '../../src/features/singing/audio/practice-reference';
import type { PerformanceReference } from '../../src/features/singing/audio/aligned-performance';
import type { VoiceInputFrame } from '../../src/features/singing/audio/voice-input';

const notes = [60, 64, 62, 67, 65, 69, 62, 64, 60, 67, 62, 65, 69, 64, 67, 60, 62, 69, 65, 67];
const chars = notes.map((n,i) => ({ text: String(i), start: i * .37, end: (i + 1) * .37, lineIndex: Math.floor(i / 5), characterIndex: i % 5, usable: true }));
const reference: PerformanceReference = { version: 1, method: 'aligned-performance-v1', songId:'test', durationSeconds:10, hopSeconds:.02, characters:chars, frames: [], provenance: { audioSha256:'',lyricsSha256:'',referenceSha256:'',alignmentSha256:'' } };
for (let i = 0; i < 370; i++) reference.frames.push([i*.02, notes[Math.min(19,Math.floor(i*.02/.37))], .99, Math.min(19,Math.floor(i*.02/.37))]);
const recording = (lag=0,shift=0,backingShift=0,speed=1): VoiceInputFrame[] => Array.from({length:90},(_,i)=> {
  const source=.2+i*.06*speed;
  return { time:.2+i*.06, songTime:source+lag*speed, pitchHz:440*2**((notes[Math.min(19,Math.floor(source/.37))]+shift-69)/12), rms:.1, confidence:.99, segment:0, backingShift, playbackSpeed:speed, captureMode:'headphones' };
});

describe('practice excerpt analysis', () => {
  it('does not apply a new device calibration to an older route or double-subtract delay', () => {
    const frames=recording(.4).map(f=>({...f,syncProfile:'route-a',captureTime:f.songTime,clockSegments:[{at:0,position:0,from:1,to:1,ramp:0}]}));
    const calibrated=analyzePractice(frames,reference,300,'route-a');
    expect(calibrated.excerpts.length).toBeGreaterThan(0);
    expect(calibrated.excerpts[0].timingError).toBeCloseTo(.1,1);
    expect(calibrated.medianLag).toBeCloseTo(.4,1);
    expect(analyzePractice(frames,reference,300,'route-b').timingScore).toBeNull();
  });

  it('aligns late singing without penalizing its pitch and retains initial delay', () => {
    const result=analyzePractice(recording(.4),reference,0);
    expect(result.excerpts.length).toBeGreaterThan(0);
    expect(result.pitchScore).toBeGreaterThan(95);
    expect(result.medianLag).toBeCloseTo(.4,1);
    expect(result.timingScore).toBe(0);
  });
  it('does not erase wrong pitch when estimating melody position', () => {
    const result=analyzePractice(recording(.4,2),reference,0);
    expect(result.excerpts.length).toBeGreaterThan(0);
    expect(result.pitchScore).toBe(0);
  });
  it('uses the backing key and playback speed recorded with each frame; accepts octave choice', () => {
    const result=analyzePractice(recording(.3,14,2,.75),reference,300);
    expect(result.pitchScore).toBeGreaterThan(95);
    expect(result.timingScore).toBe(100);
  });
  it('does not assign timing scores without an independent latency measurement', () => {
    const result=analyzePractice(recording(.3),reference);
    expect(result.pitchScore).not.toBeNull();
    expect(result.timingScore).toBeNull();
    expect(result.excerpts.every(e=>e.timingError===null)).toBe(true);
  });
  it('leaves silence, missing reference, speakers and ambiguous held notes ungraded', () => {
    expect(analyzePractice([],reference).pitchScore).toBeNull();
    expect(analyzePractice(recording(),null).pitchScore).toBeNull();
    expect(analyzePractice(recording().map(f=>({...f,captureMode:'speakers'})),reference).pitchScore).toBeNull();
    const held={...reference,frames:reference.frames.map(f=>[f[0],60,f[2],f[3]] as [number,number,number,number])};
    expect(analyzePractice(recording().map(f=>({...f,pitchHz:261.63})),held).pitchScore).toBeNull();
  });
  it('never joins short fragments across pauses, seeks or changed settings', () => {
    const frames=recording().map((f,i)=>({...f,segment:Math.floor(i/8)}));
    expect(analyzePractice(frames,reference).pitchScore).toBeNull();
    expect(analyzePractice(recording().map((f,i)=>({...f,backingShift:Math.floor(i/8)})),reference).pitchScore).toBeNull();
  });
});

describe('karaoke timing', () => {
  const characters=[{text:'你',start:1,end:2,lineIndex:0,characterIndex:0,usable:true},{text:'好',start:1.8,end:2.4,lineIndex:0,characterIndex:1,usable:true}];
  it('shows only the latest-starting active character during overlaps, none in gaps', () => {
    expect(activeCharacter(characters,1.9)).toBe(1);
    expect(activeCharacter(characters,2.4)).toBe(-1);
  });
  it('uses model starts and carries explicit line calibration to every character', () => {
    const ref={...reference,characters};
    expect(practiceLines([{time:1.5,text:'你好'}],[1.5],ref)[0].time).toBe(1);
    const edited=practiceLines([{time:1.5,text:'你好'}],[2],ref)[0];
    expect(edited.time).toBe(2);
    expect(edited.characters[1].start).toBe(2.8);
  });
  it('falls back to line timing if the reference text differs', () => {
    expect(practiceLines([{time:1.5,text:'你好吗'}],[1.5],{...reference,characters})[0].characters).toEqual([]);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { parseLrc } from '../../src/features/singing/audio/lyrics';
import { validatePerformanceReference } from '../../src/features/singing/audio/aligned-performance';
const preparedSongs = ['wu-niang','kai-dao-tu-mi','wo-bu-nan-guo','bu-ru-tiao-wu'];
it.skipIf(!preparedSongs.every(id => existsSync(`apps/web/public/media/${id}-performance.json`) && existsSync(`apps/web/public/media/${id}.lrc`)))('keeps the four prepared song timelines ordered and uses their character data', () => {
  for (const id of preparedSongs) {
    const base='apps/web/public/media/';
    const ref=validatePerformanceReference(JSON.parse(readFileSync(`${base}${id}-performance.json`,'utf8')));
    const source=parseLrc(readFileSync(`${base}${id}.lrc`,'utf8'));
    const lines=practiceLines(source,source.map(l=>l.time),ref);
    expect(lines.filter(l=>l.characters.length).length).toBeGreaterThan(source.length*.8);
    expect(lines.filter((l,i)=>i>0&&l.time<=lines[i-1].time).map(l=>({song:id,...l}))).toEqual([]);
  }
});
