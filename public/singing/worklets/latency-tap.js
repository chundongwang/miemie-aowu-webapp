/* Temporary calibration PCM; no monitoring and no network. */
class LatencyTap extends AudioWorkletProcessor {
  constructor(){super();this.step=Math.max(1,Math.round(sampleRate/6000));this.samples=[];this.first=0;}
  process(inputs,outputs){
    for(const output of outputs) for(const channel of output) channel.fill(0);
    const input=inputs[0]?.[0];if(!input)return true;
    for(let i=0;i<input.length;i++) if((currentFrame+i)%this.step===0){
      if(!this.samples.length)this.first=(currentFrame+i)/sampleRate;
      this.samples.push(input[i]);
      if(this.samples.length===256){const samples=new Float32Array(this.samples);this.port.postMessage({samples,start:this.first,rate:sampleRate/this.step},[samples.buffer]);this.samples=[];}
    }
    return true;
  }
}
registerProcessor('latency-tap',LatencyTap);
