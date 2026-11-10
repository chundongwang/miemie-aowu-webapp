// Exact intervals remain untouched. A separate trail makes sub-frame intervals visible.
export class CharacterPlayhead {
  constructor(ranges) {
    this.ranges = ranges;
    this.reset();
  }

  reset() {
    this.previousTime = null;
    this.trails = this.ranges.map(() => -Infinity);
  }

  update(time, wallTime, continuous = false, playbackRate = 1) {
    const delta = this.previousTime === null ? Infinity : time - this.previousTime;
    const canCross = continuous && delta >= 0 && delta <= .5 * Math.max(.25, playbackRate);
    if (!canCross) this.trails.fill(-Infinity);
    const states = this.ranges.map(({ start, end }, i) => {
      if (canCross && this.previousTime < end && time >= end) this.trails[i] = wallTime + 140;
      const active = time >= start && time < end;
      return { active, recent: !active && wallTime < this.trails[i] };
    });
    this.previousTime = time;
    return states;
  }
}
