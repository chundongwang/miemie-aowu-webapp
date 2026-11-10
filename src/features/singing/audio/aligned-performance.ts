import { usableVoicePitch } from '../perception/voice-quality';
import { emptyTempo, type TempoEstimate } from './vocal-tempo-follower';
import type { KeyObservation } from './voice-key-follower';

export interface PerformanceReference {
  version: 1; method: string; songId: string; durationSeconds: number; hopSeconds: number;
  characters: { text: string; start: number; end: number; lineIndex: number; characterIndex: number; usable: boolean }[];
  frames: [number, number, number, number][];
  provenance: { audioSha256: string; lyricsSha256: string; referenceSha256: string; alignmentSha256: string };
}
export const PERFORMANCE_LIMITS = { window: 1.25, interval: .1, minimumSpan: .55, score: .76,
  coverage: .4, timingMargin: .025, confirmation: .2, searchSeconds: 2, history: 2, phaseLimit: .03 };

export function validatePerformanceReference(value: unknown): PerformanceReference {
  const p = value as PerformanceReference;
  if (!p || p.version !== 1 || p.method !== 'aligned-performance-v1' || !Number.isFinite(p.durationSeconds) || p.durationSeconds <= 0
    || !Number.isFinite(p.hopSeconds) || p.hopSeconds <= 0 || p.hopSeconds > .1
    || !Array.isArray(p.characters) || !Array.isArray(p.frames) || !p.frames.length || !p.provenance) throw new Error('字级跟随参考无效');
  if (!['audioSha256','lyricsSha256','referenceSha256','alignmentSha256'].every(key => /^[a-f0-9]{64}$/.test(p.provenance[key as keyof typeof p.provenance]))) throw new Error('字级参考版本标识无效');
  for (const c of p.characters) if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.start >= c.end || c.end > p.durationSeconds
    || !Number.isInteger(c.lineIndex) || c.lineIndex < 0 || !Number.isInteger(c.characterIndex) || typeof c.text !== 'string' || typeof c.usable !== 'boolean') throw new Error('字级时间无效');
  let previous = -Infinity;
  for (const f of p.frames) {
    const c = p.characters[f[3]];
    if (!Array.isArray(f) || f.length !== 4 || !f.every(Number.isFinite) || f[0] <= previous || !c?.usable
      || f[0] < c.start || f[0] >= c.end || f[1] < 20 || f[1] > 110 || f[2] < .55 || f[2] > 1) throw new Error('字级音高参考无效');
    previous = f[0];
  }
  return p;
}

type Sample = KeyObservation & { songTime: number };
type Point = { time: number; position: number; lag: number };
type Candidate = { lag: number; score: number; coverage: number; shift: number; notes: number; characters: number };
const median = (a: number[]) => [...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];

/** Short-window melodic location within measured, nonconflicting character intervals.
 * This does not transcribe microphone words. No held pitch or synthetic reference is used.
 */
export class AlignedPerformanceFollower {
  private samples: Sample[] = [];
  private points: Point[] = [];
  private lastEvaluation = -Infinity;
  private lastVoiced = -Infinity;
  private candidateSince = 0;
  private candidateLag: number | null = null;
  private baselineLag: number | null = null;
  private stableRate: number | null = null;
  private phaseSince = 0;
  private phaseDirection = 0;
  private estimate: TempoEstimate = { ...emptyTempo(), mode: 'aligned' };
  constructor(private reference: PerformanceReference) {}
  reset() {
    this.samples=[]; this.points=[]; this.lastEvaluation=this.lastVoiced=-Infinity;
    this.candidateLag=this.baselineLag=this.stableRate=null; this.phaseDirection=0;
    this.estimate={...emptyTempo(),mode:'aligned'};
  }
  private at(time: number) {
    const fs=this.reference.frames; let lo=0,hi=fs.length;
    while(lo<hi){const m=(lo+hi)>>>1;if(fs[m][0]<time)lo=m+1;else hi=m;}
    const a=fs[Math.max(0,lo-1)],b=fs[Math.min(fs.length-1,lo)];
    const f=Math.abs(a[0]-time)<Math.abs(b[0]-time)?a:b;
    const c=this.reference.characters[f[3]];
    return time>=c.start && time<c.end && Math.abs(f[0]-time)<=Math.max(.025,this.reference.hopSeconds*1.3)?f:null;
  }
  private match(samples: Sample[]): Candidate[] {
    const candidates:Candidate[]=[];
    for(let k=-80;k<=80;k++){
      const lag=k*.025,scores=new Float64Array(12),notes=new Set<number>(),characters=new Set<number>();let compared=0;
      for(const item of samples){
        const f=this.at(item.songTime-lag);if(!f)continue;
        compared++;notes.add(Math.round(f[1])%12);characters.add(f[3]);
        const diff=((item.midi!-f[1])%12+12)%12,lower=Math.floor(diff),fraction=diff-lower;
        scores[lower]+=Math.max(0,1-fraction/.9);scores[(lower+1)%12]+=Math.max(0,1-(1-fraction)/.9);
      }
      const best=Math.max(...scores),coverage=compared/samples.length;
      candidates.push({lag,coverage,score:compared>=8&&coverage>=PERFORMANCE_LIMITS.coverage?best/compared:0,
        shift:scores.indexOf(best),notes:notes.size,characters:characters.size});
    }
    candidates.sort((a,b)=>b.score-a.score||b.coverage-a.coverage||Math.abs(a.lag-(this.candidateLag??0))-Math.abs(b.lag-(this.candidateLag??0)));
    return candidates;
  }
  observe(sample: KeyObservation, songTime: number, speed: number): TempoEstimate {
    if (!Number.isFinite(sample.time) || !Number.isFinite(songTime) || !Number.isFinite(speed) || speed<=0) return this.estimate;
    if(this.samples.length && (sample.time<this.samples.at(-1)!.time || sample.time-this.samples.at(-1)!.time>1))this.reset();
    const valid=sample.midi!==null && usableVoicePitch(sample.rms,sample.confidence,440*2**((sample.midi-69)/12));
    if(!valid){
      if(sample.time-this.lastVoiced>.6){this.candidateLag=null;this.points=[];this.phaseDirection=0;}
      return this.estimate={...this.estimate,state:'holding',positionReady:false,blockedBy:['no-pitch']};
    }
    this.lastVoiced=sample.time;
    this.samples=this.samples.filter(s=>sample.time-s.time<=PERFORMANCE_LIMITS.window);
    if(!this.samples.length || sample.time-this.samples.at(-1)!.time>=.04)this.samples.push({...sample,songTime});
    if(sample.time-this.lastEvaluation<PERFORMANCE_LIMITS.interval)return this.estimate;
    this.lastEvaluation=sample.time;
    if(this.samples.length<8 || sample.time-this.samples[0].time<PERFORMANCE_LIMITS.minimumSpan)
      return this.estimate={...emptyTempo(),mode:'aligned',at:sample.time,samples:this.samples.length};
    const candidates=this.match(this.samples);
    const best=candidates[0],runner=candidates.find(c=>Math.abs(c.lag-best.lag)>=.2)!;
    const margin=best.score-runner.score;
    const blocked=[best.score<PERFORMANCE_LIMITS.score&&'melody-match',best.coverage<PERFORMANCE_LIMITS.coverage&&'reference-gap',
      (best.notes<2||best.characters<2)&&'melody-variety',margin<PERFORMANCE_LIMITS.timingMargin&&'timing-ambiguous',Math.abs(best.lag)>=1.95&&'search-boundary'].filter((s):s is string=>typeof s==='string');
    if(blocked.length)this.candidateLag=null;
    else {
      if(this.candidateLag===null||Math.abs(best.lag-this.candidateLag)>.2)this.candidateSince=sample.time;
      this.candidateLag=best.lag;
    }
    const positionReady=!blocked.length&&sample.time-this.candidateSince>=PERFORMANCE_LIMITS.confirmation;
    const base:TempoEstimate={...emptyTempo(),mode:'aligned',at:sample.time,state:'estimating',lag:best.lag,score:best.score,coverage:best.coverage,
      samples:this.samples.length,timingMargin:margin,positionReady,referencePosition:songTime-best.lag,
      characterIndex:this.at(songTime-best.lag)?.[3]??null,blockedBy:blocked.length?blocked:['confirming']};
    if(!positionReady)return this.estimate=base;
    const previous=this.points.at(-1);
    // A sudden displacement is a phase event, not a sustainable speed measurement.
    if(previous && (sample.time-previous.time>.65 || Math.abs(best.lag-previous.lag)>.18))this.points=[];
    this.points=this.points.filter(p=>sample.time-p.time<=PERFORMANCE_LIMITS.history);
    this.points.push({time:sample.time,position:songTime-best.lag,lag:best.lag});
    this.baselineLag??=best.lag/speed;
    this.stableRate??=speed;
    const phaseError=best.lag-this.baselineLag*speed;
    const direction=Math.abs(phaseError)>.12?Math.sign(phaseError):0;
    if(direction!==this.phaseDirection){this.phaseDirection=direction;this.phaseSince=sample.time;}
    let rateReady=false,residual=1,slope=this.stableRate;
    if(this.points.length>=7 && sample.time-this.points[0].time>=.9){
      const slopes:number[]=[];
      for(let i=0;i<this.points.length;i++)for(let j=i+1;j<this.points.length;j++){
        const dt=this.points[j].time-this.points[i].time;
        if(dt>=.6)slopes.push((this.points[j].position-this.points[i].position)/dt);
      }
      if(slopes.length){
        slope=median(slopes);
        // Quantized location jitter is not a tempo trend. Require drift beyond two lag bins.
        const lagSpan=Math.max(...this.points.map(p=>p.lag))-Math.min(...this.points.map(p=>p.lag));
        if(lagSpan<.065)slope=speed;
        const intercept=median(this.points.map(p=>p.position-slope*p.time));
        residual=Math.sqrt(this.points.reduce((s,p)=>s+(p.position-slope*p.time-intercept)**2,0)/this.points.length);
        rateReady=residual<.045 && slope>=speed*.85 && slope<=speed*1.15;
        if(rateReady)this.stableRate=slope;
      }
    }
    const phaseReady=direction!==0&&sample.time-this.phaseSince>=.2;
    const action=phaseReady?'phase':rateReady?'tempo':'steady';
    const drift=rateReady?this.stableRate-speed:0;
    return this.estimate={...base,state:phaseReady||rateReady?'ready':'estimating',action,phaseError,
      singerRate:this.stableRate,ratio:1+drift/speed,drift,rateSpread:residual,zeroRateMargin:rateReady?1:0,
      blockedBy:phaseReady||rateReady?[]:['rate-collecting']};
  }
}

export function performanceTarget(e:TempoEstimate,current:number,base:number):number {
  if(e.mode!=='aligned'||e.state!=='ready'||!e.positionReady||e.singerRate==null)return current;
  // Ignore tiny estimated rate noise. Phase correction returns to the singer's rate as it catches up.
  const rate=Math.abs(e.singerRate-base)<.018?base:e.singerRate;
  const phase=e.action==='phase'?Math.max(-.03,Math.min(.03,-(e.phaseError??0)*.08)):0;
  const target=Math.max(.5,base*.95,Math.min(1.5,base*1.05,rate+phase));
  return Math.round(Math.max(current-.01,Math.min(current+.01,target))*10000)/10000;
}
