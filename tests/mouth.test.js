import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMouthMotion, mouthAmount } from '../src/mouth.js';
import { prepareStandingCoach } from '../src/rig.js';
import { loadCharacter, skinCenter } from './helpers/character.js';

test('mouth: talking amount is bounded and silence closes the mouth exactly',()=>{
  for(let t=0;t<10;t+=.01){const amount=mouthAmount(true,t);assert.ok(amount>=0&&amount<=1);assert.equal(mouthAmount(false,t),0);}
});
test('real model: lip target moves only head-weighted vertices and cannot move feet',async()=>{
  const model=await loadCharacter();prepareStandingCoach(model);
  const feet=['LeftFoot','RightFoot'].map((part)=>skinCenter(model,part));
  const mouth=createMouthMotion(model);assert.equal(mouth.supported,true);assert.equal(mouth.mode,'preview-morph');
  let mesh;model.traverse((object)=>{if(object.isSkinnedMesh)mesh=object;});
  const delta=mesh.geometry.morphAttributes.position[0];let changed=0,sample=-1;
  for(let index=0;index<delta.count;index++)if(delta.getY(index)!==0){
    changed++;if(sample===-1&&Math.abs(delta.getY(index))>.0005)sample=index;let headWeight=0;
    for(let slot=0;slot<4;slot++)if(mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(index,slot)].name.endsWith('Head'))headWeight+=mesh.geometry.attributes.skinWeight.getComponent(index,slot);
    assert.ok(headWeight>.8);assert.ok(Math.abs(delta.getY(index))<=.0061);
  }
  assert.ok(changed>10,'mouth has an actual deformation');
  assert.ok(sample>=0);
  const closed=mesh.getVertexPosition(sample,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  mouth.setAmount(.8);assert.equal(mesh.morphTargetInfluences[0],.8);
  const opened=mesh.getVertexPosition(sample,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  assert.ok(opened.distanceTo(closed)>.0001&&opened.distanceTo(closed)<.01,'actual skinned lip moves by a small amount');
  for(const [index,part] of ['LeftFoot','RightFoot'].entries())assert.ok(skinCenter(model,part).distanceTo(feet[index])<1e-6);
  mouth.setAmount(0);assert.equal(mesh.morphTargetInfluences[0],0);
  assert.ok(mesh.getVertexPosition(sample,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).distanceTo(closed)<1e-8,'closing restores exact skin position');
  mouth.setAmount(NaN);assert.equal(mesh.morphTargetInfluences[0],0);
});
test('unsupported characters keep working without a mouth rig',()=>{
  const mouth=createMouthMotion(new THREE.Group());assert.equal(mouth.supported,false);assert.doesNotThrow(()=>mouth.setAmount(1));
});
