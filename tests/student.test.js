import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudentModel } from '../src/student-model.js';
import { createStudentRetarget } from '../src/student-retarget.js';
import { prepareStandingCoach } from '../src/rig.js';
import { loadCharacter,position,skinCenter } from './helpers/character.js';
import { createFrameProcessor } from '../src/pose-frame.js';

function setup(){const model=createStudentModel();prepareStandingCoach(model);return {model,retarget:createStudentRetarget(model)};}
function observation(shape='up',capturedAt=100){
 const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1,presence:1}));
 const put=(i,x,y)=>Object.assign(p[i],{x,y});
 put(11,.65,.4);put(12,.35,.4);put(23,.57,.65);put(24,.43,.65);
 put(25,.57,.8);put(26,.43,.8);put(27,.57,.98);put(28,.43,.98);
 for(const [shoulder,elbow,wrist] of [[11,13,15],[12,14,16]]){const x=p[shoulder].x;put(elbow,shape==='open'?(x>.5?.8:.2):x,shape==='open'?.4:.25);put(wrist,shape==='open'?(x>.5?.98:.02):x,shape==='open'?.4:.1);}
 if(shape==='side')for(const i of [11,12,13,14,15,16])p[i].x+=.12;
 return {landmarks:[p],capturedAt};
}
function settle(retarget,now=100){for(let i=0;i<30;i++)retarget.update(now+i*16);}
test('committed male GLB has weighted skin, complete rig and front-facing standing feet',async()=>{
 const model=await loadCharacter('public/models/student-v1.glb');prepareStandingCoach(model);let skinned=0;model.traverse(o=>{if(o.isSkinnedMesh){skinned++;assert.equal(o.skeleton.bones.length,22);}});assert.ok(skinned<=6&&skinned>=4);
 assert.ok(position(model,'Head').y>position(model,'Hips').y);
 assert.ok(position(model,'LeftHand').y<position(model,'LeftArm').y);
 assert.ok(position(model,'LeftToeBase').z>position(model,'LeftFoot').z);
 assert.ok(new THREE.Box3().setFromObject(model,true).min.y>=.019);
});
for(const pose of ['up','open','side'])test(`retarget ${pose}: real skin moves, root/positions/scales remain locked`,()=>{
 const {model,retarget}=setup(),before=skinCenter(model,'LeftForeArm'),root=model.position.clone(),transforms=[];model.traverse(o=>{if(o.isBone)transforms.push([o,o.position.clone(),o.scale.clone()]);});
 assert.ok(retarget.accept(observation(pose),100));settle(retarget);
 assert.ok(skinCenter(model,'LeftForeArm').distanceTo(before)>.1);assert.deepEqual(model.position,root);
 for(const [b,p,s] of transforms){assert.deepEqual(b.position,p);assert.deepEqual(b.scale,s);}
 const hand=position(model,'LeftHand'),shoulder=position(model,'LeftArm');
 if(pose==='up')assert.ok(hand.y>shoulder.y+.3);
 if(pose==='open')assert.ok(Math.abs(hand.y-shoulder.y)<.05);
 if(pose==='side')assert.ok(position(model,'Spine1').x<position(model,'Spine').x);
});
test('mirroring swaps anatomical sides and maps world coordinates',()=>{
 const {model,retarget}=setup(),data=observation();data.landmarks[0][13].visibility=0;data.landmarks[0][15].visibility=0;
 data.worldLandmarks=[data.landmarks[0].map(p=>({...p,x:p.x-.5,y:p.y-.65}))];retarget.accept(data,100);settle(retarget);
 assert.ok(position(model,'LeftHand').y>position(model,'LeftArm').y);assert.ok(position(model,'RightHand').y<position(model,'RightArm').y);assert.equal(retarget.diagnostics.space,'world');
});
test('occlusion holds briefly, stale returns neutral, duplicate and dark/multiple poses rejected',()=>{
 const {model,retarget}=setup(),neutral=position(model,'LeftHand');retarget.accept(observation(),100);settle(retarget);const high=position(model,'LeftHand');retarget.accept(observation('up',580),580);
 assert.equal(retarget.accept(observation(),600),false);
 const occluded=observation('up',600);occluded.landmarks[0].forEach(p=>p.visibility=0);retarget.accept(occluded,600);retarget.update(610);assert.ok(position(model,'LeftHand').distanceTo(high)<.1);
 for(let t=1700;t<3000;t+=30)retarget.update(t);assert.ok(position(model,'LeftHand').distanceTo(neutral)<.01);
 assert.equal(retarget.accept({...observation('up',3000),brightness:10},3000),false);
 assert.equal(retarget.accept({...observation('up',3001),landmarks:[[],[]]},3001),false);
 assert.equal(retarget.accept(observation('up',1),3002),false);
});
test('default pose-only path forwards world landmarks without creating segmentation or RGBA',async()=>{
 let segmenter=0,canvas=0;const world=[[{x:0,y:0,z:0}]];
 const processor=createFrameProcessor({detector:{detectForVideo:()=>({landmarks:[],worldLandmarks:world,close(){}}),close(){}},createCanvas:()=>{canvas++;},createSegmenter:()=>{segmenter++;}});
 const result=await processor.detect({},100,{segment:false});assert.deepEqual(result.worldLandmarks,world);assert.equal(result.segmentation,null);assert.equal(segmenter,0);assert.equal(canvas,0);processor.close();
});

test('student panel keeps male visible without camera, rejects old session and retains no camera pixels',async()=>{
 const {setupStudentPanel}=await import('../src/student-panel.js');const ids=new Map();
 const document={getElementById(id){if(!ids.has(id))ids.set(id,{value:'1',checked:true,disabled:true,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return ids.get(id);}};
 let paired=false;const panel=setupStudentPanel({document,onLayout:v=>paired=v}),scene=new THREE.Scene();panel.attach(scene);assert.equal(paired,true);assert.ok(scene.getObjectByName('Yoga2MaleStudent'));
 assert.equal(panel.context.segment,false);panel.cameraState(true);const old=panel.context;assert.ok(panel.accept({...observation(),context:old},100));panel.update(null,120);
 panel.cameraState(false);panel.cameraState(true);assert.equal(panel.accept({...observation('up',130),context:old},130),false);
 assert.equal(panel.snapshot,null);assert.equal(panel.memoryStatus.retainedRGBABytes,0);assert.equal(panel.diagnostics.mode,'student-avatar');
 panel.cameraState(false);assert.ok(scene.getObjectByName('Yoga2MaleStudent'));panel.dispose();assert.equal(scene.children.length,0);assert.equal(paired,false);
});
