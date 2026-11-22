import * as THREE from 'three';
import { createStudentModel } from './student-model.js';
import { inspectHumanoidRig } from './humanoid-rig.js';
import { decodeAvatarPhoto, validateProfile, FACE_SIZE } from './avatar-profile.js';
export async function createPersonalAvatar(profile,{decode=decodeAvatarPhoto}={}){
 const valid=validateProfile(profile),canvas=await decode(valid.face);if(canvas.width!==FACE_SIZE||canvas.height!==FACE_SIZE){canvas.width=canvas.height=0;throw new Error('臉部貼圖尺寸不相容，請重新建立。');}
 const texture=new THREE.CanvasTexture(canvas);let model;
 try{model=createStudentModel({appearance:valid.appearance,faceTexture:texture});if(!inspectHumanoidRig(model).diagnostics.compatible)throw new Error('個人骨架驗證失敗。');return model;}
 catch(error){if(model)disposeAvatar(model);else{texture.dispose();canvas.width=canvas.height=0;}throw error;}
}
export function disposeAvatar(root){
 if(!root)return;root.removeFromParent();const geometries=new Set(),materials=new Set(),skins=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}if(o.skeleton)skins.add(o.skeleton);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.dispose();if(t.image?.getContext)t.image.width=t.image.height=0;});skins.forEach(s=>s.dispose());
}
export async function exportAvatarGLB(profile){const model=await createPersonalAvatar(profile);try{const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');return new Blob([await new GLTFExporter().parseAsync(model,{binary:true,maxTextureSize:FACE_SIZE})],{type:'model/gltf-binary'});}finally{disposeAvatar(model);}}
