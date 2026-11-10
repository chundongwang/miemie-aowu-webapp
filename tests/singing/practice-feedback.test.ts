import { expect, it } from 'vitest';
import { emptyTempo } from '../../src/features/singing/audio/vocal-tempo-follower';
import { practiceTiming, signedMilliseconds } from '../../src/features/singing/audio/practice-feedback';

it('distinguishes an unconfirmed candidate from a usable timing estimate', () => {
  const tempo={...emptyTempo(),lag:.45,samples:20,ageSeconds:.04,blockedBy:['melody-match','timing-ambiguous']};
  const result=practiceTiming(tempo,1,200,true,true);
  expect(result.seconds).toBe(.45); // Do not present an unconfirmed candidate as calibrated.
  expect(result.confirmed).toBe(false);
  expect(result.reason).toContain('旋律对应');
  const ready=practiceTiming({...tempo,state:'estimating',positionReady:true,blockedBy:[]},.5,200,true,true);
  expect(ready.confirmed).toBe(true);
  expect(ready.seconds).toBeCloseTo(.7);
});
it('does not show stale estimates as fresh; preserves paused observations explicitly', () => {
  const tempo={...emptyTempo(),lag:.4,samples:20,ageSeconds:2};
  expect(practiceTiming(tempo,1,null,true,true).seconds).toBeNull();
  expect(practiceTiming({...tempo,ageSeconds:0},1,null,true,false).seconds).toBeNull();
  expect(practiceTiming(tempo,1,null,false,false).seconds).toBe(.4);
  expect(practiceTiming(tempo,1,null,false,false).label).toContain('已暂停');
  expect(signedMilliseconds(.45)).toBe('+450 ms');
  expect(signedMilliseconds(-1.4)).toBe('−1400 ms');
});
