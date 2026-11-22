import * as THREE from 'three';
import { motionAt } from './course.js?v=0.9.29';

// Normalize the actual asset's forward direction before framing it. A camera
// on +Z must see the face even when an imported GLB uses another forward axis.
export function prepareStandingCoach(model, {boneMap={}}={}) {
  const bones = [];
  model.traverse((object) => {
    if (object.isBone) bones.push(object);
  });
  // Keep the GLB's authored local rest transforms. This asset has a rotated,
  // scaled Character parent; Skeleton.pose() reconstructs the root from glTF
  // inverse-bind matrices in a different space and tips the body onto its back.
  model.updateMatrixWorld(true);
  const forward = new THREE.Vector3();
  const find = (suffix) => {const value=boneMap[suffix]??suffix;return typeof value==='string'?bones.find(b=>b.name===value)||bones.find(b=>b.name.endsWith(value)):bones.includes(value)?value:null;};
  for (const side of ['Left', 'Right']) {
    const foot = find(`${side}Foot`), toe = find(`${side}ToeBase`);
    if (foot && toe) forward.add(toe.getWorldPosition(new THREE.Vector3()).sub(foot.getWorldPosition(new THREE.Vector3())));
  }
  forward.y = 0;
  if (forward.lengthSq() > 1e-8) model.rotation.y -= Math.atan2(forward.x, forward.z);
  model.updateMatrixWorld(true);
  const pose = makeStretchPose(model,{boneMap});
  pose(0); // Standing, hands resting beside the body; no autoplay.
  const box = new THREE.Box3().setFromObject(model, true);
  model.scale.multiplyScalar(1.72 / box.getSize(new THREE.Vector3()).y);
  model.updateMatrixWorld(true);
  box.setFromObject(model, true);
  const center = box.getCenter(new THREE.Vector3());
  model.position.add(new THREE.Vector3(-center.x, .02 - box.min.y, -center.z));
  pose(0);
  return pose;
}

// Set bone world directions using bind-pose orientations so twisting is preserved.
// The GLB's embedded SambaDance clip is deliberately not used.
export function makeStretchPose(model, {boneMap={}}={}) {
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); });
  const rest = new Map(bones.map((b) => [b, b.quaternion.clone()]));
  const find = (suffix) => {const value=boneMap[suffix]??suffix;return typeof value==='string'?bones.find(b=>b.name===value)||bones.find(b=>b.name.endsWith(value)):bones.includes(value)?value:null;};
  const spine = ['Spine', 'Spine1', 'Spine2'].map(find);
  if (spine.some((bone) => !bone)) throw new Error('Model is missing the required spine bones');
  const arms = ['Left', 'Right'].map((side, i) => {
    const arm = find(`${side}Arm`), forearm = find(`${side}ForeArm`), hand = find(`${side}Hand`);
    if (!arm || !forearm || !hand) throw new Error('Model is missing the required arm bones');
    return { arm, forearm, hand, sign: i === 0 ? 1 : -1 };
  });
  const origin = new THREE.Vector3(), end = new THREE.Vector3();
  const currentDir = new THREE.Vector3(), worldQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion(), correction = new THREE.Quaternion();
  function aim(bone, child, target) {
    bone.getWorldPosition(origin); child.getWorldPosition(end);
    currentDir.subVectors(end, origin).normalize();
    bone.getWorldQuaternion(worldQ);
    correction.setFromUnitVectors(currentDir, target);
    worldQ.premultiply(correction);
    bone.parent.getWorldQuaternion(parentQ).invert();
    bone.quaternion.copy(parentQ.multiply(worldQ)).normalize();
    bone.updateWorldMatrix(false, true);
  }
  const target = new THREE.Vector3();
  const bendAxis = new THREE.Vector3(0, 0, 1);
  return (time, movement = 'reach') => {
    for (const [bone, q] of rest) bone.quaternion.copy(q);
    model.updateMatrixWorld(true);
    const { armAngle: angle, lean, depth } = motionAt(movement, time);
    for (const bone of spine) {
      bone.getWorldQuaternion(worldQ);
      correction.setFromAxisAngle(bendAxis, lean / spine.length);
      worldQ.premultiply(correction);
      bone.parent.getWorldQuaternion(parentQ).invert();
      bone.quaternion.copy(parentQ.multiply(worldQ)).normalize();
      bone.updateWorldMatrix(false, true);
    }
    for (const { arm, forearm, hand, sign } of arms) {
      target.set(sign * Math.sin(angle), -Math.cos(angle), depth).normalize().applyAxisAngle(bendAxis, lean);
      aim(arm, forearm, target);
      aim(forearm, hand, target);
    }
  };
}

