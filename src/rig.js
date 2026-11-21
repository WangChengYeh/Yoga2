import * as THREE from 'three';
import { armAngleAt } from './motion.js';

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

