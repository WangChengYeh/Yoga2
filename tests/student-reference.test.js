import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudentModel } from '../src/student-model.js';
import { createStudentRetarget } from '../src/student-retarget.js';
import { prepareStandingCoach } from '../src/rig.js';
import { poseSample } from './helpers/pose-samples.js';
function setup({prefix='',rotation=0,missing=false}={}){
 const model=createStudentModel();prepareStandingCoach(model);model.rotation.y+=rotation;
 if(missing)model.getObjectByName('LeftHand').name='UnavailableHand';
 if(prefix)model.traverse(o=>{if(o.isBone)o.name=prefix+o.name;});
 return {model,retarget:createStudentRetarget(model),prefix};
}
function apply(h,time,at){
 assert.equal(h.retarget.accept(poseSample(time,{capturedAt:at}),at),true);
 for(let i=1;i<=80;i++)h.retarget.update(at+i*10);
 return at+800;
}
test('neutral-reference solve returns to the same rotations after repeated pose cycles',()=>{
 const h=setup();let now=apply(h,8,0);const reference=new Map();h.model.traverse(o=>{if(o.isBone)reference.set(o.name,o.quaternion.clone());});
 for(let cycle=0;cycle<8;cycle++)for(const time of [58,26,38,8])now=apply(h,time,now+1);
 for(const [name,q] of reference)assert.ok(h.model.getObjectByName(name).quaternion.angleTo(q)<.002,`${name}: no cumulative twist`);
 assert.equal(h.retarget.diagnostics.orientationSolver,'neutral-reference-swing');assert.equal(h.retarget.diagnostics.boundBones,9);
});
test('prefixed humanoid names and model yaw retain equivalent local solutions',()=>{
 const a=setup(),b=setup({prefix:'Rig:',rotation:1.2});apply(a,58,0);apply(b,58,0);
 for(const name of ['Spine','LeftArm','LeftForeArm','RightArm','RightForeArm','LeftUpLeg'])
  assert.ok(a.model.getObjectByName(name).quaternion.angleTo(b.model.getObjectByName('Rig:'+name).quaternion)<1e-5,name);
});
test('missing mapped bones are explicit in diagnostics and never guessed',()=>{
 const h=setup({missing:true});apply(h,8,0);assert.deepEqual(h.retarget.diagnostics.missingBones,['LeftForeArm']);assert.equal(h.retarget.diagnostics.boundBones,8);
 h.retarget.reset();assert.equal(h.retarget.diagnostics.tracking,'waiting');
});
