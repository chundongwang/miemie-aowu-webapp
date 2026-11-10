import { expect, it } from 'vitest';
import { capturePerformanceTime, referenceTimeForFrame, syncProfile, audibleContextTime } from '../../src/features/singing/audio/audio-sync';
import { PlaybackClock } from '../../src/features/singing/audio/playback-clock';
import { VoiceInputSession, type VoiceInputFrame } from '../../src/features/singing/audio/voice-input';
import { measureLatency } from '../../src/features/singing/audio/latency-measurement';

it('timestamps capture independently of worker delivery, retaining pause-separated history',()=>{
  expect(capturePerformanceTime(5,5.1,100)).toBeCloseTo(99.9);
  expect(capturePerformanceTime(5,5.25,100.15)).toBeCloseTo(99.9);
  const session=new VoiceInputSession();
  session.record({time:99.9,rms:.1,pitchHz:440,confidence:1});
  session.record({time:100,rms:.1,pitchHz:440,confidence:1});
  session.record(null);session.record({time:110,rms:.1,pitchHz:440,confidence:1});
  expect(session.count).toBe(3);expect(session.position).toBeCloseTo(.2);
});
it('integrates compensation over rate ramps and applies it only to the calibrated route',()=>{
  const clock=new PlaybackClock();clock.reset(0,10,1);clock.changeRate(1,2,1);
  const profile=syncProfile(2,0,'headphones',1);
  const f:VoiceInputFrame={time:10,captureTime:1.5,songTime:clock.positionAt(1.5),clockSegments:clock.snapshot(),syncProfile:profile,rms:.1,pitchHz:440,confidence:1,playbackSpeed:2};
  expect(referenceTimeForFrame(f,750,profile)).toBeCloseTo(10.75);
  expect(referenceTimeForFrame(f,750,'other')).toBe(f.songTime);
  expect(referenceTimeForFrame(f,null,profile)).toBe(f.songTime);
  expect(referenceTimeForFrame(f,1600,profile)).toBeUndefined();
  expect(f.songTime).toBeCloseTo(11.625); // raw evidence untouched
});
it('uses output timestamp mapping and subtracts DSP only once',()=>{
  const now=performance.now();
  const context={currentTime:10,baseLatency:.01,outputLatency:.1,getOutputTimestamp:()=>({contextTime:9.9,performanceTime:now})};
  expect(audibleContextTime(context,80)).toBeCloseTo(9.82,1);
  expect(audibleContextTime({...context,getOutputTimestamp:()=>({})},80)).toBeCloseTo(9.81);
});
function fixture(lags:number[]) {
  const rate=4000,starts=[.6,1.85,3.1,4.35,5.6],output=new Float32Array(8*rate),input=new Float32Array(output.length);
  let seed=1; const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296-.5;};
  for(let i=0;i<input.length;i++)input[i]=random()*.001;
  starts.forEach((start,k)=>{const at=Math.round((start+.08)*rate),delay=Math.round(lags[k]*rate);for(let j=0;j<280;j++){const sample=random()*.1;output[at+j]=sample;input[at+j+delay]+=.7*sample;}});
  return {output,input,rate,starts};
}
it('measures repeated physical echo plus DSP latency rather than singer reaction',()=>{
  const f=fixture([.12,.121,.119,.12,.122]);const result=measureLatency(f.output,f.input,f.rate,f.starts);
  expect(result.roundTripMs).toBeCloseTo(200,0);expect(result.dspMs).toBeCloseTo(80,0);expect(result.spreadMs).toBeLessThan(5);expect(result.delaysMs).toHaveLength(5);
});
it('refuses missing or unstable loopback instead of inventing calibration',()=>{
  const f=fixture([.12,.2,.12,.2,.12]);expect(()=>measureLatency(f.output,f.input,f.rate,f.starts)).toThrow('波动');
  expect(()=>measureLatency(f.output,new Float32Array(f.input.length),f.rate,f.starts)).toThrow('足够清晰');
});
