import { prepareAudioSession, verifyAudioSession } from './native-session';
import { measureLatency, type LatencyMeasurement } from './latency-measurement';
/** Runs only from an explicit user gesture. Temporary PCM is released on success, error or abort. */
export async function calibrateLatency(speed:number,pitch:number,mode:string,signal:AbortSignal, prepare:()=>Promise<void> = async()=>{}):Promise<LatencyMeasurement> {
  const context=new AudioContext({latencyHint:'interactive'});
  let stream:MediaStream|null=null;
  const nodes:AudioNode[]=[];
  const abort=()=>{stream?.getTracks().forEach(t=>t.stop());void context.close().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  const check=()=>{if(signal.aborted)throw new DOMException('已取消校准','AbortError');};
  try {
    await context.resume();check();
    await prepare();check();
    await prepareAudioSession();check();
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:mode==='speakers',noiseSuppression:false,autoGainControl:false}});check();
    void verifyAudioSession();
    await Promise.all([context.audioWorklet.addModule('/singing/worklets/latency-tap.js'),context.audioWorklet.addModule('/singing/worklets/soundtouch-processor.js')]);check();
    const origin=context.currentTime+.3, seconds=8;
    const rate=context.sampleRate/Math.max(1,Math.round(context.sampleRate/6000));
    const output=new Float32Array(Math.ceil(seconds*rate)),input=new Float32Array(output.length);
    const tap=(target:Float32Array)=>{
      const node=new AudioWorkletNode(context,'latency-tap');nodes.push(node);
      node.port.onmessage=({data})=>{if(signal.aborted)return;const at=Math.round((data.start-origin)*rate);for(let i=0;i<data.samples.length;i++)if(at+i>=0&&at+i<target.length)target[at+i]=data.samples[i];};
      node.connect(context.destination);return node;
    };
    const mic=context.createMediaStreamSource(stream);nodes.push(mic);mic.connect(tap(input));
    const shifter=new AudioWorkletNode(context,'soundtouch-processor',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],parameterData:{pitch:1,pitchSemitones:pitch,playbackRate:speed}});
    nodes.push(shifter);shifter.port.postMessage({type:'set-stretch-parameters',params:{sequenceMs:80,seekWindowMs:20,overlapMs:8}});
    const gain=context.createGain();nodes.push(gain);gain.gain.value=.15;shifter.connect(gain);gain.connect(context.destination);gain.connect(tap(output));
    const starts=[.6,1.85,3.1,4.35,5.6];
    const buffer=context.createBuffer(2,Math.ceil(seconds*speed*context.sampleRate),context.sampleRate);
    for(const start of starts) for(let i=0;i<.07*speed*context.sampleRate;i++){
      const t=i/context.sampleRate/speed;
      const v=Math.sin(2*Math.PI*(700*t+11000*t*t))*Math.sin(Math.PI*t/.07)**2;
      for(let channel=0;channel<2;channel++)buffer.getChannelData(channel)[Math.round(start*speed*context.sampleRate)+i]=v;
    }
    const source=context.createBufferSource();nodes.push(source);source.buffer=buffer;source.playbackRate.value=speed;source.connect(shifter);source.start(origin);
    await new Promise<void>((resolve,reject)=>{
      const cancel=()=>{clearTimeout(timer);reject(new DOMException('已取消校准','AbortError'));};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},(seconds+.4)*1000);
      signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
    });check();
    return measureLatency(output,input,rate,starts);
  } finally {
    signal.removeEventListener('abort',abort);
    for(const node of nodes){node.disconnect();if(node instanceof AudioWorkletNode){node.port.onmessage=null;node.port.close();}}
    stream?.getTracks().forEach(t=>t.stop());if(context.state!=='closed')await context.close();
  }
}
