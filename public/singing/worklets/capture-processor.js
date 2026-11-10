/* No inference, network, or PCM allocation in process(). Four transferable frames bound memory. */
class VocalCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 2048;
    this.pool = Array.from({ length: 4 }, () => new Float32Array(this.frameSize));
    this.frame = this.pool.pop();
    this.offset = 0;
    this.droppedFrames = 0;
    this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'recycle' && data.buffer.byteLength === this.frameSize * 4 && this.pool.length < 4) {
        this.pool.push(new Float32Array(data.buffer));
      } else if (data.type === 'stop') {
        this.active = false;
      }
    };
  }

  process(inputs, outputs) {
    // The output stays silent even if the microphone input contains a full-scale signal.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (!this.active) return false;
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      if (!this.frame) {
        this.frame = this.pool.pop();
        if (!this.frame) { this.droppedFrames++; break; }
      }
      this.frame[this.offset++] = input[i];
      if (this.offset === this.frameSize) {
        this.port.postMessage({ type: 'frame', samples: this.frame,
          sampleRate, timestampMs: (currentFrame + i + 1) / sampleRate * 1000,
          droppedFrames: this.droppedFrames }, [this.frame.buffer]);
        this.frame = this.pool.pop();
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('vocal-capture', VocalCaptureProcessor);
