import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadCharacter(path = 'public/models/luna-v1.glb') {
  const original = readFileSync(path);
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

  return gltf.scene;
}
export function position(model, suffix) {
  let bone;
  model.traverse((object) => { if (object.isBone && object.name.endsWith(suffix)) bone = object; });
  assert.ok(bone, `missing bone: ${suffix}`);
  return bone.getWorldPosition(new THREE.Vector3());
}
export function skinCenter(model, part) {
  const sum = new THREE.Vector3(); let count = 0;
  model.updateMatrixWorld(true);
  model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const indices = mesh.geometry.attributes.skinIndex;
    const weights = mesh.geometry.attributes.skinWeight;
    for (let vertex = 0; vertex < indices.count; vertex++) {
      for (let slot = 0; slot < 4; slot++) {
        if (mesh.skeleton.bones[indices.getComponent(vertex, slot)].name.endsWith(part) && weights.getComponent(vertex, slot) > .7) {
          sum.add(mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
          count++; break;
        }
      }
    }
  });
  assert.ok(count > 0, `${part} has actual weighted skin vertices`);
  return sum.divideScalar(count);
}

