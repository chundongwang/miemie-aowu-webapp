/** Integrates the same rate ramps scheduled on Web Audio, retaining recent capture history. */
type Segment = { at: number; position: number; from: number; to: number; ramp: number };
export class PlaybackClock {
  private segments: Segment[] = [{ at: 0, position: 0, from: 1, to: 1, ramp: 0 }];

  snapshot() { return this.segments.map(segment => ({ ...segment })); }

  reset(at: number, position: number, rate: number) {
    this.segments = [{ at, position, from: rate, to: rate, ramp: 0 }];
  }

  private segmentAt(time: number) {
    for (let i = this.segments.length - 1; i >= 0; i--) if (time >= this.segments[i].at) return this.segments[i];
    return this.segments[0];
  }

  rateAt(time: number) {
    const segment = this.segmentAt(time);
    const fraction = segment.ramp > 0 ? Math.min(1, Math.max(0, time - segment.at) / segment.ramp) : 1;
    return segment.from + (segment.to - segment.from) * fraction;
  }

  positionAt(time: number) {
    const segment = this.segmentAt(time);
    const delta = Math.max(0, time - segment.at);
    const rampTime = Math.min(delta, segment.ramp);
    const rampDistance = segment.ramp ? segment.from * rampTime + (segment.to - segment.from) * rampTime * rampTime / (2 * segment.ramp) : 0;
    return segment.position + rampDistance + segment.to * Math.max(0, delta - segment.ramp);
  }

  changeRate(at: number, rate: number, ramp = .04) {
    const from = this.rateAt(at), position = this.positionAt(at);
    this.segments = this.segments.filter(segment => segment.at < at);
    this.segments.push({ at, position, from, to: rate, ramp });
    // Preserve the six-second tempo window plus alignment lag.
    while (this.segments.length > 1 && this.segments[1].at < at - 8) this.segments.shift();
    return from;
  }

  /** Start a newly crossfaded source at the exact rate of an in-progress ramp. */
  automationAt(time: number) {
    const segment = this.segmentAt(time);
    return { rate: this.rateAt(time), target: segment.to, end: Math.max(time, segment.at + segment.ramp) };
  }
}
