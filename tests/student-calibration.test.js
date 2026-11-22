import { worldSample } from './helpers/world-pose-samples.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudentModel } from '../src/student-model.js';
import { prepareStandingCoach } from '../src/rig.js';
import { createStudentRetarget } from '../src/student-retarget.js';
import { inspectHumanoidRig, HUMANOID_BONES } from '../src/humanoid-rig.js';
import { poseSample } from './helpers/pose-samples.js';
function setup(options={}){const model=createStudentModel();prepareStandingCoach(model);return {model,retarget:createStudentRetarget(model,{mirror:false,...options})};}
function settle(h,data){h.retarget.accept(data,data.capturedAt);for(let i=0;i<=120;i++)h.retarget.update(data.capturedAt+i*10);}
test('rig contract resolves explicit aliases; rejects ambiguous, broken hierarchy and unskinned replacements',()=>{
 const model=createStudentModel(),mapping={};model.traverse(o=>{if(o.isBone){mapping[o.name]='custom_'+o.name;o.name='custom_'+o.name;}});
 assert.equal(inspectHumanoidRig(model,{boneMap:mapping}).diagnostics.compatible,true);
 const extra=new THREE.Bone();extra.name='another_LeftArm';model.add(extra);assert.ok(inspectHumanoidRig(model).diagnostics.ambiguous.includes('LeftArm'));
 const plain=new THREE.Group();assert.equal(inspectHumanoidRig(plain).diagnostics.compatible,false);assert.equal(inspectHumanoidRig(plain).diagnostics.skinnedMeshes,0);
 const broken=createStudentModel();broken.add(broken.getObjectByName('LeftForeArm'));assert.ok(inspectHumanoidRig(broken).diagnostics.hierarchy.includes('LeftArm/LeftForeArm'));
 assert.equal(HUMANOID_BONES.length,22);
});
test('five stable world samples calibrate yaw; duplicate, bent and image-only samples do not',()=>{
 const h=setup();h.retarget.beginCalibration();for(const t of [0,150,300,450,600])h.retarget.accept(worldSample(t,{yaw:.5}),t);
 assert.equal(h.retarget.diagnostics.calibration.status,'calibrated');assert.ok(Math.abs(h.retarget.diagnostics.calibration.yaw+.5)<1e-6);
 h.retarget.reset();h.retarget.beginCalibration();for(const t of [0,150,300,450,600])h.retarget.accept(poseSample(0,{capturedAt:t}),t);
 assert.equal(h.retarget.diagnostics.calibration.status,'collecting');assert.equal(h.retarget.diagnostics.calibration.reason,'world-landmarks-required');
 h.retarget.reset();h.retarget.beginCalibration();for(const t of [0,150,300,450,600])h.retarget.accept(worldSample(t,{lean:.7}),t);
 assert.equal(h.retarget.diagnostics.calibration.status,'collecting');assert.equal(h.retarget.diagnostics.calibration.samples,0);
 h.retarget.reset();h.retarget.beginCalibration();for(let n=0;n<10;n++)h.retarget.accept(worldSample(100),100+n*100);
 assert.equal(h.retarget.diagnostics.calibration.samples,1);assert.equal(h.retarget.diagnostics.calibration.status,'collecting');
});
test('calibrated yaw yields the same body orientation as the original front reference',()=>{
 const a=setup(),b=setup();b.retarget.beginCalibration();for(const t of [0,150,300,450,600])b.retarget.accept(worldSample(t,{yaw:.5}),t);
 settle(a,worldSample(1000));settle(b,worldSample(1000,{yaw:.5}));
 for(const name of ['Hips','Spine','Spine1','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','LeftFoot'])assert.ok(a.model.getObjectByName(name).quaternion.angleTo(b.model.getObjectByName(name).quaternion)<1e-5,name);
});
test('full world references drive pelvis, spine, head, hands and feet while root/scale/positions remain fixed',()=>{
 const h=setup(),transforms=[];h.model.traverse(o=>{if(o.isBone)transforms.push([o,o.position.clone(),o.scale.clone()]);});const root=h.model.position.clone();
 settle(h,worldSample(0,{lean:.25}));
 for(const name of ['Hips','Spine','Spine1','Spine2','Neck','Head','LeftHand','RightHand','LeftFoot','RightFoot'])assert.ok(h.retarget.diagnostics.observedBones.includes(name),name);
 assert.ok(h.model.getObjectByName('Spine2').quaternion.angleTo(new THREE.Quaternion())>.05);
 for(const [bone,pos,scale] of transforms){assert.deepEqual(bone.position,pos);assert.deepEqual(bone.scale,scale);}assert.deepEqual(h.model.position,root);
});
test('no head/palm/foot depth from 2D or occluded reference points; degeneracy never creates NaN',()=>{
 const h=setup();h.retarget.accept(poseSample(8),0);for(const name of ['Hips','Head','LeftHand','LeftFoot'])assert.equal(h.retarget.diagnostics.observedBones.includes(name),false);
 const data=worldSample(100);for(const i of [0,7,8,17,19,29,31])data.landmarks[0][i].visibility=0;h.retarget.accept(data,100);
 for(const name of ['Head','LeftHand','LeftFoot'])assert.equal(h.retarget.diagnostics.observedBones.includes(name),false);
 const degenerate=worldSample(200);degenerate.worldLandmarks[0].forEach(p=>Object.assign(p,{x:0,y:0,z:0}));h.retarget.accept(degenerate,200);h.retarget.update(210);h.model.traverse(o=>{if(o.isBone)assert.ok(o.quaternion.toArray().every(Number.isFinite));});
});
test('source size and root translation do not change solved bone orientation',()=>{
 const a=setup(),b=setup();settle(a,worldSample());settle(b,worldSample(0,{scale:3,offset:10}));
 for(const name of HUMANOID_BONES)assert.ok(a.model.getObjectByName(name).quaternion.angleTo(b.model.getObjectByName(name).quaternion)<1e-5,name);
});
test('visual local rotation bounds and angular speed hold on extreme input',()=>{
 const h=setup(),before=h.model.getObjectByName('Head').quaternion.clone();const data=worldSample(0);Object.assign(data.worldLandmarks[0][0],{x:.6,y:-.4,z:-.02});h.retarget.accept(data,0);h.retarget.update(0);
 assert.ok(before.angleTo(h.model.getObjectByName('Head').quaternion)<=8/30+.001);for(let t=10;t<1200;t+=10)h.retarget.update(t);
 assert.ok(before.angleTo(h.model.getObjectByName('Head').quaternion)<=.851);
 assert.ok(h.retarget.diagnostics.constrained>0);
});

test('calibration times out without blocking tracking and a retry preserves the prior reference',()=>{
 const h=setup();h.retarget.beginCalibration(0);for(const t of [0,150,300,450,600])h.retarget.accept(worldSample(t,{yaw:.5}),t);
 h.retarget.beginCalibration(700);h.retarget.accept(poseSample(8,{capturedAt:800}),800);h.retarget.update(11000);
 assert.equal(h.retarget.diagnostics.calibration.status,'unavailable');assert.ok(Math.abs(h.retarget.diagnostics.calibration.yaw+.5)<1e-6);
 assert.equal(h.retarget.accept(worldSample(11100,{yaw:.5}),11100),true);h.retarget.update(11110);assert.equal(h.retarget.diagnostics.tracking,'tracking');
});
test('side/turned body, bent knees and one lifted leg remain finite and confidence-aware',()=>{
 for(const mode of ['turn','squat','single-leg']){
  const h=setup(),data=worldSample(0,{yaw:mode==='turn'?1.2:0});
  if(mode==='squat')for(const i of [25,26]){data.worldLandmarks[0][i].y=.2;data.worldLandmarks[0][i].z=-.35;}
  if(mode==='single-leg'){Object.assign(data.worldLandmarks[0][25],{x:.1,y:.1,z:-.3});Object.assign(data.worldLandmarks[0][27],{x:.1,y:.3,z:-.35});}
  settle(h,data);assert.equal(h.retarget.diagnostics.tracking,'tracking');
  assert.ok(h.retarget.diagnostics.observedBones.includes('LeftUpLeg'));assert.ok(h.retarget.diagnostics.observedBones.includes('LeftLeg'));
  h.model.traverse(o=>{if(o.isBone)assert.ok(o.quaternion.toArray().every(Number.isFinite));});
 }
});
test('student panel falls back for incompatible skin and supports arbitrary explicitly mapped bone names',async()=>{
 const {setupStudentPanel}=await import('../src/student-panel.js');const nodes=new Map();const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'1',checked:true,disabled:true,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);}};
 const panel=setupStudentPanel({document}),scene=new THREE.Scene();panel.attach(scene,new THREE.Group());assert.ok(panel.diagnostics.assetFallback);assert.ok(scene.getObjectByName('Yoga2MaleStudent'));
 const asset=createStudentModel(),mapping={};let i=0;asset.traverse(o=>{if(o.isBone){mapping[o.name]='joint_'+i++;o.name=mapping[o.name];}});
 panel.attach(scene,asset,{boneMap:mapping});assert.equal(panel.diagnostics.assetFallback,null);assert.equal(panel.diagnostics.retarget.rig.compatible,true);
 panel.cameraState(true);assert.equal(nodes.get('human-calibrate').disabled,false);const old=panel.context;nodes.get('human-calibrate').listeners.click();assert.equal(panel.calibration.status,'collecting');assert.equal(panel.accept({...worldSample(100),context:old},100),false);
 assert.equal(panel.accept({...worldSample(150),context:panel.context},150),true);panel.update(null,160);
 panel.cameraState(false);assert.equal(nodes.get('human-calibrate').disabled,true);assert.equal(panel.calibration.status,'default');panel.dispose();assert.equal(scene.children.length,0);
});
