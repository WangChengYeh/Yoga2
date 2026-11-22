import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {layoutAvatarPair,createPairSpacing} from '../src/paired-stage.js';
test('both actors retain one direction and screen-space side-by-side separation through camera orbit',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5,.7]){const coachStage=new THREE.Group();coachStage.rotation.y=.5;let student;layoutAvatarPair({coachStage,studentPanel:{setLayout:v=>student=v},yaw,fit:{coachX:-1,humanX:1}});assert.equal(coachStage.rotation.y,student.yaw);const delta=new THREE.Vector3(student.x,0,student.z).sub(coachStage.position),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));assert.ok(delta.distanceTo(right.multiplyScalar(2))<1e-8);assert.equal(student.layoutYaw,yaw);}
});

test('standing lanes close, arm expansion separates immediately, and side-view mats retain clearance',()=>{
 const spacing=createPairSpacing(),o=new THREE.Vector3(),points=w=>[new THREE.Vector3(-w/2,0,0),new THREE.Vector3(w/2,1.7,0)],update=(width,yaw,now)=>spacing.update({coachPoints:points(width),studentPoints:points(width),coachOrigin:o,studentOrigin:o,yaw,now});const standing=update(.5,0,0);assert.equal(standing,.9);const open=update(1.7,0,33);assert.ok(open>=1.88);const closing=update(.5,0,66);assert.ok(closing<open&&closing>standing);spacing.reset();assert.ok(update(.4,Math.PI/2,100)>1.78);
});
