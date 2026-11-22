import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createStudentModel} from '../src/student-model.js';
import {inspectGLBBytes,validateGLBProfile,MAX_GLB_BYTES} from '../src/glb-file.js';
import {validateProfile,createAvatarStore} from '../src/avatar-profile.js';
import {loadUploadedAvatar} from '../src/glb-avatar.js';
import {createPersonalAvatar,disposeAvatar,exportAvatarGLB} from '../src/personal-avatar.js';
import {prepareStandingCoach} from '../src/rig.js';
import {createStudentRetarget} from '../src/student-retarget.js';
import {worldSample} from './helpers/world-pose-samples.js';
import {inspectHumanoidRig} from '../src/humanoid-rig.js';
import * as THREE from 'three';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
function bytes(json){const text=new TextEncoder().encode(JSON.stringify(json)),n=Math.ceil(text.length/4)*4,buffer=new ArrayBuffer(20+n),v=new DataView(buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,buffer.byteLength,true);v.setUint32(12,n,true);v.setUint32(16,0x4e4f534a,true);new Uint8Array(buffer,20).fill(32);new Uint8Array(buffer,20,text.length).set(text);return buffer;}
const basic=()=>({asset:{version:'2.0'},accessors:[{count:3}],meshes:[{primitives:[{attributes:{POSITION:0}}]}]});
test('GLB rejects corrupt, external, compressed and over-budget models before loading',()=>{
 assert.throws(()=>inspectGLBBytes(new ArrayBuffer(30)),/GLB/);
 const j=basic();assert.equal(inspectGLBBytes(bytes(j)).triangles,1);j.buffers=[{uri:'https://example.com/private.bin'}];assert.throws(()=>inspectGLBBytes(bytes(j)),/內嵌/);j.buffers=[{uri:'data:application/octet-stream;base64,AA=='}];assert.throws(()=>inspectGLBBytes(bytes(j)),/內嵌/);delete j.buffers;
 j.extensionsUsed=['KHR_draco_mesh_compression'];assert.throws(()=>inspectGLBBytes(bytes(j)),/Draco/);delete j.extensionsUsed;j.accessors[0].count=200001;assert.throws(()=>inspectGLBBytes(bytes(j)),/減面/);
 assert.throws(()=>validateGLBProfile({schema:3,glb:new Blob([new Uint8Array(MAX_GLB_BYTES+1)])}),/30 MB/);
 assert.throws(()=>validateGLBProfile({schema:3,glb:new Blob([new Uint8Array(40)]),boneMap:{Hips:3}}),/對照/);
});
test('GLB model imports without replacing geometry; aliases, retarget, framing and original download work',async()=>{
 const source=createStudentModel(),map={};source.traverse(o=>{if(o.isBone){map[o.name]='custom_'+o.name;o.name=map[o.name];}});
 const data=await new GLTFExporter().parseAsync(source,{binary:true}),profile={schema:3,glb:new Blob([data],{type:'model/gltf-binary'}),name:'paid-avatar.glb',boneMap:map};
 assert.equal(validateProfile(profile).name,profile.name);const loaded=await createPersonalAvatar(profile);assert.equal(inspectHumanoidRig(loaded).diagnostics.compatible,true);assert.equal(loaded.userData.asset,'uploaded-glb');
 let originalVertices=0,loadedVertices=0;source.traverse(o=>{if(o.isMesh)originalVertices+=o.geometry.attributes.position.count;});loaded.traverse(o=>{if(o.isMesh)loadedVertices+=o.geometry.attributes.position.count;});assert.equal(loadedVertices,originalVertices);
 prepareStandingCoach(loaded);const bounds=new THREE.Box3().setFromObject(loaded,true);assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).y-1.72)<.03);
 const retarget=createStudentRetarget(loaded);const sample=worldSample(100);assert.equal(retarget.accept(sample,100),true);retarget.update(200);loaded.traverse(o=>{if(o.isBone)assert.ok(o.quaternion.toArray().every(Number.isFinite));});
 assert.equal(await exportAvatarGLB(profile),profile.glb);disposeAvatar(source);disposeAvatar(loaded);
 const invalid=createStudentModel();invalid.getObjectByName('Head').name='missing_head';const bad=await new GLTFExporter().parseAsync(invalid,{binary:true});await assert.rejects(loadUploadedAvatar({...profile,glb:new Blob([bad]),boneMap:{}}),/Head/);disposeAvatar(invalid);
});
test('invalid skin weights are rejected rather than silently displaying a broken avatar',()=>{
 const model=createStudentModel();let skin;model.traverse(o=>{if(o.isSkinnedMesh)skin=o;});skin.geometry.attributes.skinWeight.setX(0,NaN);assert.equal(inspectHumanoidRig(model).diagnostics.invalidSkin,true);disposeAvatar(model);
});

test('bundled textured GLB passes embedded image and mesh budgets',()=>{const data=readFileSync('public/models/luna-v1.glb');const info=inspectGLBBytes(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));assert.ok(info.vertices>0);});
