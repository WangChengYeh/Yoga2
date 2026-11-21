import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacter, position, skinCenter } from './helpers/character.js';
import { prepareStandingCoach } from '../src/rig.js';


test('startup: upright standing pose with hands below shoulders and feet on mat', async () => {
  const model = await loadCharacter();
  prepareStandingCoach(model);
  for (const side of ['Left', 'Right']) {
    assert.ok(position(model, 'Head').y - position(model, `${side}Foot`).y > 1.2, 'head must be well above feet');
    assert.ok(position(model, `${side}Hand`).y < position(model, 'Spine2').y, 'hands rest below shoulders');
  }
  const box = new THREE.Box3().setFromObject(model, true);
  assert.ok(Math.abs(box.min.y - .02) < .001, 'skin rests on the mat');
  assert.ok(Math.abs(box.getSize(new THREE.Vector3()).y - 1.72) < .001, 'standing height is normalized');
});

test('regression: displayed head and shoes are upright, not only joint coordinates', async () => {
  const model = await loadCharacter();
  prepareStandingCoach(model);
  const head = skinCenter(model, 'Head');
  for (const side of ['Left', 'Right']) {
    const foot = skinCenter(model, `${side}Foot`);
    assert.ok(head.y - foot.y > 1.3, 'visible head is above visible shoes');
    assert.ok(Math.abs(head.z - foot.z) < .25, 'visible body is not lying along depth axis');
    assert.ok(foot.y < .15, 'visible shoes rest near the mat');
  }
});

test('orientation: default and rotated imported assets face the front camera', async () => {
  for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const model = await loadCharacter(); model.rotation.y = yaw;
    prepareStandingCoach(model);
    const forward = position(model, 'LeftToeBase').sub(position(model, 'LeftFoot'))
      .add(position(model, 'RightToeBase').sub(position(model, 'RightFoot')));
    assert.ok(forward.z > 0, 'feet face the +Z front camera');
    assert.ok(Math.abs(forward.x) < 1e-5, 'no sideways default orientation');
    assert.ok(position(model, 'Head').y - position(model, 'LeftFoot').y > 1.2, 'orientation preserves vertical stance');
  }
});

test('reach skin: both hands raise above head while feet stay planted', async () => {
  const model = await loadCharacter(); const pose = prepareStandingCoach(model);
  const feet = ['Left', 'Right'].map((side) => position(model, `${side}Foot`));
  for (const time of [0, 3, 6, 8, 10, 13, 16]) {
    pose(time);
    for (const [i, side] of ['Left', 'Right'].entries()) {
      assert.ok(position(model, `${side}Foot`).distanceTo(feet[i]) < 1e-5, 'feet remain planted');
      if (time >= 6 && time <= 10) {
        assert.ok(position(model, `${side}Hand`).y > position(model, 'Head').y, 'hand bone is overhead');
        assert.ok(skinCenter(model, `${side}Hand`).y > skinCenter(model, 'Head').y, 'visible hand is overhead');
      }
    }
    const box = new THREE.Box3().setFromObject(model, true);
    assert.ok([...box.min, ...box.max].every(Number.isFinite), 'mesh bounds are finite');
    assert.ok(box.getSize(new THREE.Vector3()).z < .7, 'body does not tip backwards during animation');
  }
});

test('side skin: torso bends to both sides, hands follow it, feet remain planted', async () => {
  const model = await loadCharacter(); const pose = prepareStandingCoach(model);
  const feet = ['LeftFoot', 'RightFoot'].map((part) => skinCenter(model, part));
  const initialHead = skinCenter(model, 'Head');
  pose(10, 'side'); const rightHead = skinCenter(model, 'Head');
  pose(22, 'side'); const leftHead = skinCenter(model, 'Head');
  assert.ok(rightHead.x < initialHead.x - .07, 'visible head leans to coach right');
  assert.ok(leftHead.x > initialHead.x + .07, 'visible head leans to coach left');
  assert.ok(Math.abs((rightHead.x - initialHead.x) + (leftHead.x - initialHead.x)) < .001, 'both sides are symmetric');
  for (const time of [0, 4, 8, 12, 16, 20, 24, 28, 32]) {
    pose(time, 'side');
    for (const [index, part] of ['LeftFoot', 'RightFoot'].entries()) assert.ok(skinCenter(model, part).distanceTo(feet[index]) < 1e-5);
    if (time >= 4 && time <= 28) {
      for (const hand of ['LeftHand', 'RightHand']) assert.ok(skinCenter(model, hand).y > skinCenter(model, 'Head').y, 'visible arms remain overhead');
    }
    assert.ok(skinCenter(model, 'Head').y - feet[0].y > 1.2, 'torso remains upright');
  }
});

test('open skin: hands spread sideways and slightly back without moving feet or head', async () => {
  const model = await loadCharacter(); const pose = prepareStandingCoach(model);
  const head = skinCenter(model, 'Head');
  const feet = ['LeftFoot', 'RightFoot'].map((part) => skinCenter(model, part));
  pose(10, 'open');
  const left = skinCenter(model, 'LeftHand'), right = skinCenter(model, 'RightHand');
  assert.ok(left.x > .5 && right.x < -.5, 'visible hands extend to either side');
  assert.ok(Math.abs(left.y - right.y) < .05, 'arms stay level');
  assert.ok(left.z < head.z && right.z < head.z, 'hands open slightly behind torso');
  assert.ok(skinCenter(model, 'Head').distanceTo(head) < 1e-5, 'chest opening does not tip the head backwards');
  for (const time of [0, 3, 6, 10, 14, 17, 20]) {
    pose(time, 'open');
    for (const [index, part] of ['LeftFoot', 'RightFoot'].entries()) assert.ok(skinCenter(model, part).distanceTo(feet[index]) < 1e-5);
  }
});

test('transitions: all three displayed skins return to the same neutral standing pose', async () => {
  const model = await loadCharacter(); const pose = prepareStandingCoach(model);
  const parts = ['Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'];
  const neutral = parts.map((part) => skinCenter(model, part));
  for (const [movement, duration] of [['reach', 16], ['side', 32], ['open', 20]]) {
    pose(duration / 2, movement); pose(duration, movement);
    for (const [index, part] of parts.entries()) assert.ok(skinCenter(model, part).distanceTo(neutral[index]) < 1e-5, `${movement} ends neutral`);
    pose(0, movement);
    for (const [index, part] of parts.entries()) assert.ok(skinCenter(model, part).distanceTo(neutral[index]) < 1e-5, `${movement} begins neutral`);
  }
});

test('replay and scrubbing return to the same standing skin without drift', async () => {
  const model = await loadCharacter(); const pose = prepareStandingCoach(model);
  const before = ['Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'].map((part) => skinCenter(model, part));
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const time of [6, 16, 3, 10, 0]) pose(time);
  }
  for (const [index, part] of ['Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'].entries()) {
    assert.ok(skinCenter(model, part).distanceTo(before[index]) < 1e-5, 'replay returns skin to the original standing pose');
  }
});
