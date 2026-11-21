import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION, phaseAt, armAngleAt, advance } from '../src/motion.js';
test('stretch starts and ends in the same pose and holds overhead', () => {
  assert.ok(Math.abs(armAngleAt(0) - armAngleAt(DURATION)) < 1e-10);
  assert.equal(armAngleAt(6), armAngleAt(10));
  assert.ok(armAngleAt(6) > 2.8);
  for (let t = 0; t < 6; t += 0.1) assert.ok(armAngleAt(t + .1) >= armAngleAt(t));
});
test('playback clamps at completion and cue boundaries match motion', () => {
  assert.equal(advance(15, 5, 1.5), DURATION);
  assert.equal(advance(4, 2, 0.5), 5);
  assert.equal(advance(4, -5, 1), 4);
  assert.equal(phaseAt(6).label, '伸展停留');
  assert.equal(phaseAt(10).label, '慢慢放下');
  assert.equal(phaseAt(16).label, '示範完成');
});
