import { expect, it } from 'vitest';
import { pitchScale } from '../../src/features/singing/audio/pitch-scale';
import { characterBeats, type BeatMap } from '../../src/features/singing/audio/beat-map';
const map:BeatMap={version:1,beats:[0,.5,1,1.5,2,2.5,3],strength:[1,1,1,1,1,1,1],durationSeconds:3,meter:null,method:'test'};

it('zooms around the reference and preserves octave outliers beyond the visible range',()=>{
  const scale=pitchScale([60,61,62,100],[48],12);
  expect(scale.high-scale.low).toBe(24);
  expect(scale.center).toBe(63);
  expect(scale.y(100)).toBeLessThan(16); // Clipped visually, never flattened to the boundary.
  expect(scale.y(scale.high)).toBe(16);
  expect(scale.y(scale.low)).toBe(136);
  expect(pitchScale([], [48,48,49],6).center).toBe(48);
  expect(pitchScale([70],[],12,60).center).toBe(60);
  expect(pitchScale([],[],0)).toMatchObject({low:36,high:84});
});
it('labels beat entrances and acoustic durations without inventing a time signature',()=>{
  expect(characterBeats(map,.5,1)).toMatchObject({placement:'正拍',duration:1,label:'≈1拍'});
  expect(characterBeats(map,.75,1)).toMatchObject({placement:'反拍 &',duration:.5,label:'≈½拍'});
  expect(characterBeats(map,.625,.75)).toMatchObject({placement:'拍间',duration:.25,label:'≈¼拍'});
  expect(characterBeats(map,.5,2)).toMatchObject({duration:3,label:'≈3拍'});
  expect(map.meter).toBeNull();
});
it('uses local tempo, supports shifted timestamps, and refuses gaps or invalid intervals',()=>{
  const variable={...map,beats:[0,.5,1,2,3]};
  expect(characterBeats(variable,.5,2)?.duration).toBe(2);
  expect(characterBeats(map,.75,1)?.placement).toBe('反拍 &');
  const gap={...map,beats:[0,.5,2.5,3]};
  expect(characterBeats(gap,.25,2.75)).toBeNull();
  expect(characterBeats(map,-.1,.5)).toBeNull();
  expect(characterBeats(map,2.5,3.1)).toBeNull();
  expect(characterBeats(map,1,1)).toBeNull();
  expect(characterBeats(null,1,2)).toBeNull();
});
