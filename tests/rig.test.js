import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeStretchPose } from '../src/rig.js';

test('real character skeleton raises both hands above head and keeps feet fixed', async () => {
  const original = readFileSync('public/models/michelle.glb');
  const jsonLength = original.readUInt32LE(12);
  const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
  // GPU-free geometry test: retain all geometry/skin buffers; omit texture decoding.
  delete json.images; delete json.textures; delete json.materials;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  let jsonBytes = Buffer.from(JSON.stringify(json));
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 32)]);
  const binChunk = original.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + jsonBytes.length + binChunk.length, 8);
  header.writeUInt32LE(jsonBytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const buffer = Buffer.concat([header, jsonBytes, binChunk]);
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  const model = gltf.scene;
  const skeletons = new Set();
  model.traverse((o) => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
  for (const skeleton of skeletons) skeleton.pose();
  const pose = makeStretchPose(model);
  const find = (suffix) => { let result; model.traverse((o) => { if (o.isBone && o.name.endsWith(suffix)) result = o; }); return result; };
  const position = (name) => find(name).getWorldPosition(new THREE.Vector3());
  pose(0);
  const feet = ['LeftFoot', 'RightFoot'].map(position);
  const neutral = ['LeftHand', 'RightHand'].map(position);
  assert.ok(neutral.every((p) => p.y < position('Head').y));
  for (const time of [0, 3, 6, 8, 10, 13, 16]) {
    pose(time);
    for (const [i, name] of ['LeftFoot', 'RightFoot'].entries()) assert.ok(position(name).distanceTo(feet[i]) < 1e-5);
    if (time >= 6 && time <= 10) {
      assert.ok(position('LeftHand').y > position('Head').y);
      assert.ok(position('RightHand').y > position('Head').y);
    }
    const box = new THREE.Box3().setFromObject(model, true);
    assert.ok([...box.min, ...box.max].every(Number.isFinite));
  }
  for (const [i, name] of ['LeftHand', 'RightHand'].entries()) assert.ok(position(name).distanceTo(neutral[i]) < 1e-5);
});
