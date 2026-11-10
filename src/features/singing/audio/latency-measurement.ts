export type LatencyMeasurement = { roundTripMs: number; dspMs: number; spreadMs: number; delaysMs: number[]; correlations: number[] };
const median = (a:number[]) => [...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
/** Correlate the actual post-DSP probe against capture; no singing/reaction timing involved. */
export function measureLatency(output: Float32Array, input: Float32Array, rate: number, starts: number[]): LatencyMeasurement {
  const delays:number[]=[], dsp:number[]=[], scores:number[]=[];
  const width=Math.round(rate*.035), maxLag=Math.round(rate*1), exclusion=Math.round(rate*.012);
  for(const start of starts) {
    const expected=Math.round(start*rate);
    let onset=-1;
    for(let i=expected;i<Math.min(output.length-width,expected+rate*.35);i++) {
      if(Math.abs(output[i])>.008){onset=i;break;}
    }
    if(onset<0) continue;
    let energy=0; for(let j=0;j<width;j++) energy+=output[onset+j]**2;
    if(energy<.0001) continue;
    const matches:{lag:number;score:number}[]=[];
    for(let lag=0;lag<=maxLag && onset+lag+width<input.length;lag++) {
      let dot=0,power=0;
      for(let j=0;j<width;j++){const v=input[onset+lag+j];dot+=output[onset+j]*v;power+=v*v;}
      matches.push({lag,score:power>1e-8?Math.abs(dot)/Math.sqrt(energy*power):0});
    }
    matches.sort((a,b)=>b.score-a.score);
    const best=matches[0], other=matches.find(x=>Math.abs(x.lag-best.lag)>exclusion);
    if(!best || best.score<.3 || (other && best.score-other.score<.08) || best.lag>=maxLag-2) continue;
    const dspMs=(onset-expected)/rate*1000;
    delays.push(best.lag/rate*1000+dspMs);dsp.push(dspMs);scores.push(best.score);
  }
  if(delays.length<4) throw new Error('没有收到足够清晰的测试声。将实际使用的耳机出声口靠近麦克风，或检查扬声器音量后重试；不要跟着测试声拍手或唱歌。');
  const spread=Math.max(...delays)-Math.min(...delays);
  if(spread>35) throw new Error(`测量波动 ${Math.round(spread)} ms，暂不应用。请保持设备与距离不变后重试。`);
  return {roundTripMs:median(delays),dspMs:median(dsp),spreadMs:spread,delaysMs:delays,correlations:scores};
}
