import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {inspectGLBBytes,validateGLBProfile} from './glb-file.js?v=0.9.40';
import {inspectHumanoidRig} from './humanoid-rig.js?v=0.9.40';
import {disposeAvatar} from './personal-avatar.js?v=0.9.40';
export async function loadUploadedAvatar(profile){
 const valid=validateGLBProfile(profile),bytes=await valid.glb.arrayBuffer();inspectGLBBytes(bytes);
 const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:')&&!url.startsWith('data:'))throw new Error('GLB 不可讀取外部檔案。');return url;});
 let model;try{
  model=(await new GLTFLoader(manager).parseAsync(bytes,'')).scene;
  const checked=inspectHumanoidRig(model,{boneMap:valid.boneMap}),d=checked.diagnostics;
  if(!d.compatible)throw new Error(`骨架不相容：${d.missing.length?'缺少 '+d.missing.join('、'):d.ambiguous.length?'骨骼名稱重複 '+d.ambiguous.join('、'):d.hierarchy.length?'關節階層錯誤 '+d.hierarchy.join('、'):'缺少有效蒙皮或骨架變換'}。請依 GLB 匯入規格修正或填寫骨架對照。`);
  let pixels=0;const textures=new Set(),remove=[];model.traverse(o=>{if(o.isLight||o.isCamera)remove.push(o);if(o.isMesh){const p=o.geometry?.attributes.position;if(!p||!Array.from(p.array).every(Number.isFinite))throw new Error('模型頂點資料無效。');for(const m of Array.isArray(o.material)?o.material:[o.material])for(const t of Object.values(m||{}))if(t?.isTexture&&!textures.has(t)){textures.add(t);const w=t.image?.width||0,h=t.image?.height||0;pixels+=w*h;if(w>4096||h>4096||pixels>32*1024*1024)throw new Error('貼圖過大：每張最多 4096，總計最多 3200 萬像素，請縮小後重試。');}}});remove.forEach(o=>o.removeFromParent());
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());if(box.isEmpty()||![size.x,size.y,size.z].every(Number.isFinite)||size.y<1e-5)throw new Error('模型邊界無效，請檢查尺寸與變換。');
  // Canonical names let all existing retargeting, framing and skeleton tools work.
  for(const [name,bone]of checked.bones)bone.name=name;
  if(!inspectHumanoidRig(model).diagnostics.compatible)throw new Error('骨架對照後名稱重複，請移除重複的標準骨骼名稱。');
  model.userData={...model.userData,appearance:'user-photo',asset:'uploaded-glb'};return model;
 }catch(error){if(model)disposeAvatar(model);throw error;}
}
