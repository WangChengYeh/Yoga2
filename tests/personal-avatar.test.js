import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStudentModel} from '../src/student-model.js';
import {createStudentRetarget} from '../src/student-retarget.js';
import {prepareStandingCoach} from '../src/rig.js';
import {inspectHumanoidRig,HUMANOID_BONES} from '../src/humanoid-rig.js';
import {createAvatarEnvelope} from '../src/auto-framing.js';
import {normalizeAppearance,cropRect,validatePhoto,validateProfile,createAvatarStore} from '../src/avatar-profile.js';
import {createPersonalAvatar,disposeAvatar} from '../src/personal-avatar.js';
import {worldSample} from './helpers/world-pose-samples.js';
const profile=()=>({schema:1,face:new Blob(['derived-jpeg'],{type:'image/jpeg'}),appearance:normalizeAppearance({})});
test('photo validation, bounded crop and appearance normalization cannot persist source data or unbounded shapes',()=>{
 assert.deepEqual(cropRect(800,1200,{zoom:2,x:1,y:0}),{x:400,y:0,size:400});
 for(const file of [new Blob(['bad'],{type:'image/svg+xml'}),{type:'image/jpeg',size:13*1024*1024}])assert.throws(()=>validatePhoto(file));validatePhoto(profile().face);
 const a=normalizeAppearance({headWidth:99,headHeight:-1,skin:'url(secret)',hairStyle:'injection'});assert.equal(a.headWidth,1.2);assert.equal(a.headHeight,.85);assert.equal(a.skin,'#c99775');assert.equal(a.hairStyle,'short');
 const p=validateProfile({...profile(),sourcePhoto:'original',name:'private'});assert.deepEqual(Object.keys(p),['schema','appearance','face']);assert.throws(()=>validateProfile({...p,schema:99}));
});
test('photo-textured non-flat face has unchanged full humanoid rig, bounded geometry and working head skinning',()=>{
 const canvas={width:512,height:512,getContext(){}},texture=new THREE.CanvasTexture(canvas),model=createStudentModel({faceTexture:texture,appearance:{headWidth:1.2,headHeight:1.15,hairStyle:'bald'}});
 assert.equal(inspectHumanoidRig(model).diagnostics.compatible,true);const face=model.getObjectByName('PersonalFace'),z=new Set(Array.from(face.geometry.attributes.position.array).filter((_,i)=>i%3===2).map(v=>v.toFixed(3)));assert.ok(z.size>10);assert.ok(face.geometry.attributes.position.count<1000);assert.equal(face.material.map,texture);
 const p=new THREE.Vector3();face.getVertexPosition(300,p);const before=p.clone();const head=face.skeleton.bones.find(b=>b.name==='Head');head.rotation.y=.6;model.updateMatrixWorld(true);face.getVertexPosition(300,p);assert.ok(p.distanceTo(before)>.01);
 const bones=[];model.traverse(o=>{if(o.isBone)bones.push(o.name);});assert.equal(bones.length,22);assert.ok(HUMANOID_BONES.every(b=>bones.includes(b)));disposeAvatar(model);assert.equal(canvas.width,0);
});
test('personal appearance preserves retarget calibration, root/scale and automatic framing across motions',()=>{
 const model=createStudentModel({faceTexture:new THREE.Texture(),appearance:{headWidth:.8,headHeight:.85}});prepareStandingCoach(model);const r=createStudentRetarget(model),env=createAvatarEnvelope(model),position=model.position.clone(),scale=model.scale.clone();
 for(const t of [0,250,500,750]){r.accept(worldSample(t,{yaw:.3}),t);r.update(t);const {box}=env.update();assert.equal(box.isEmpty(),false);model.traverse(m=>{if(!m.isSkinnedMesh)return;for(let i=0;i<m.geometry.attributes.position.count;i+=7){const p=m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld);assert.ok(box.containsPoint(p));}});}
 assert.deepEqual(model.position,position);assert.deepEqual(model.scale,scale);disposeAvatar(model);
});
test('personal build validates derived texture size and releases invalid decode before model creation',async()=>{
 const p=profile(),bad={width:1536,height:512};await assert.rejects(createPersonalAvatar(p,{decode:async()=>bad}));assert.equal(bad.width,0);
 const model=await createPersonalAvatar(p,{decode:async()=>({width:512,height:512,getContext(){}})});assert.ok(model.getObjectByName('PersonalFace'));disposeAvatar(model);
});
function fakeIDB(){const rows=new Map();let abort=false;return {rows,setAbort(v){abort=v;},indexedDB:{open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={objectStore:()=>({get:k=>op(()=>rows.get(k)),put:(v,k)=>op(()=>{if(!abort)rows.set(k,v);}),delete:k=>op(()=>{if(!abort)rows.delete(k);})})};function op(fn){const r={};queueMicrotask(()=>{r.result=fn();r.onsuccess?.();queueMicrotask(()=>abort?tx.onabort?.():tx.oncomplete?.());});return r;}return tx;}};request.onsuccess();});return request;}}};}
test('IndexedDB profile transaction completes before save success; deletion and unsupported storage are explicit',async()=>{
 const f=fakeIDB(),s=createAvatarStore({indexedDB:f.indexedDB});assert.equal(await s.load(),null);await s.save({...profile(),sourcePhoto:'never-store'});const loaded=await s.load();assert.equal(loaded.face.size,12);assert.equal('sourcePhoto' in f.rows.get('current'),false);f.setAbort(true);await assert.rejects(s.save(profile()));f.setAbort(false);await s.remove();assert.equal(await s.load(),null);await s.close();await assert.rejects(createAvatarStore({indexedDB:null}).load());
});
