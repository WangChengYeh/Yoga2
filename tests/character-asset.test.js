import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadCharacter } from './helpers/character.js';

test('Luna asset: bundled checksum, mobile size, triangle budget and provenance are fixed',()=>{
  const meta=JSON.parse(readFileSync('public/models/luna-source.json','utf8'));
  const bytes=readFileSync('public/models/luna-v1.glb');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.output_sha256);
  assert.equal(bytes.length,meta.output_bytes);assert.ok(bytes.length<2500000);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const triangles=json.meshes.flatMap((mesh)=>mesh.primitives).reduce((sum,primitive)=>sum+json.accessors[primitive.indices].count/3,0);
  assert.ok(triangles<=40000);assert.equal(meta.license,'CC0-1.0');assert.equal(json.animations,undefined);
  assert.ok(json.meshes.some((mesh)=>mesh.extras?.targetNames?.includes('jawOpen')));
});
test('Luna rig uses the existing course joint contract and has a real mouth target',async()=>{
  const model=await loadCharacter();const names=[];let mouth=false;
  model.traverse((object)=>{if(object.isBone)names.push(object.name);if(object.isSkinnedMesh&&object.morphTargetDictionary?.jawOpen!==undefined)mouth=true;});
  for(const name of ['Hips','Spine','Spine1','Spine2','Head','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand','LeftFoot','RightFoot'])assert.ok(names.includes(name),`missing ${name}`);
  assert.equal(mouth,true);
});
