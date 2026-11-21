import * as THREE from 'three';
import { armAngleAt } from './motion.js';

// Normalize the actual asset's forward direction before framing it. A camera
// on +Z must see the face even when an imported GLB uses another forward axis.
export function prepareStandingCoach(model) {
  const bones = [];
  model.traverse((object) => {
    if (object.isBone) bones.push(object);
  });
  // Keep the GLB's authored local rest transforms. This asset has a rotated,
  // scaled Character parent; Skeleton.pose() reconstructs the root from glTF
  // inverse-bind matrices in a different space and tips the body onto its back.
  model.updateMatrixWorld(true);
  const forward = new THREE.Vector3();
  const find = (suffix) => bones.find((bone) => bone.name.endsWith(suffix));
  for (const side of ['Left', 'Right']) {
    const foot = find(`${side}Foot`), toe = find(`${side}ToeBase`);
    if (foot && toe) forward.add(toe.getWorldPosition(new THREE.Vector3()).sub(foot.getWorldPosition(new THREE.Vector3())));
  }
  forward.y = 0;
  if (forward.lengthSq() > 1e-8) model.rotation.y -= Math.atan2(forward.x, forward.z);
  model.updateMatrixWorld(true);
  const pose = makeStretchPose(model);
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
export function makeStretchPose(model) {
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); });
  const rest = new Map(bones.map((b) => [b, b.quaternion.clone()]));
  const find = (suffix) => bones.find((b) => b.name.endsWith(suffix));
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
  return (time) => {
    for (const [bone, q] of rest) bone.quaternion.copy(q);
    model.updateMatrixWorld(true);
    const angle = armAngleAt(time);
    for (const { arm, forearm, hand, sign } of arms) {
      target.set(sign * Math.sin(angle), -Math.cos(angle), 0.06).normalize();
      aim(arm, forearm, target);
      aim(forearm, hand, target);
    }
  };
}

