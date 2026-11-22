import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareStandingCoach} from './rig.js?v=0.9.34';
import {motionAt} from './course.js?v=0.9.34';
import {inspectHumanoidRig} from './humanoid-rig.js?v=0.9.34';
import {AVATAR_VIEWS,BODY_WIDTH,BODY_HEIGHT,decodeAvatarPhoto,validateProfile} from './avatar-profile.js?v=0.9.34';
// UVs are baked once in the reference pose. Mesh geometry/bones are a template,
// not a photogrammetric reconstruction. One atlas keeps practice draw calls low.
export function projectThreeViews(model,{referenceArmDeg=30,texture}={}){
 const pose=prepareStandingCoach(model);let lo=0,hi=6;for(let i=0;i<24;i++){const t=(lo+hi)/2;if(motionAt('reach',t).armAngle<referenceArmDeg*Math.PI/180)lo=t;else hi=t;}pose((lo+hi)/2,'reach');model.updateMatrixWorld(true);
 const meshes=[],bounds=new THREE.Box3();model.traverse(mesh=>{if(!mesh.isMesh)return;const points=[];for(let i=0;i<mesh.geometry.attributes.position.count;i++){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);points.push(p);bounds.expandByPoint(p);}meshes.push({mesh,points});});
 const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),counts={front:0,side:0,back:0};if(size.y<=0||size.x<=0||size.z<=0)throw new Error('模型範圍無效。');
 const oldMaterials=new Set(),oldTextures=new Set();const material=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0,alphaTest:.4});
 for(const {mesh,points} of meshes){const original=mesh.geometry,index=original.index,attributes=Object.entries(original.attributes).filter(([key])=>key!=='uv'&&key!=='uv1'&&key!=='tangent'),values=Object.fromEntries(attributes.map(([k])=>[k,[]])),uv=[],indices=[],cache=new Map();
  const count=index?.count||points.length;
  for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),[a,b,c]=ids.map(k=>points[k]),normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize(),mid=a.clone().add(b).add(c).multiplyScalar(1/3),central=Math.abs(mid.x-center.x)<size.y*.145;
   // Side input has resting arms. Use front/back for extended limbs to avoid
   // projecting the side torso onto those arms. One observed side mirrors the other.
   const side=central&&Math.abs(normal.x)>.72,view=side?'side':normal.z<0?'back':'front',mirror=side&&normal.x<0,tile=AVATAR_VIEWS.indexOf(view);counts[view]++;
   for(const id of ids){const key=id+':'+view+':'+mirror;let next=cache.get(key);if(next===undefined){next=uv.length/2;cache.set(key,next);for(const [name,attr] of attributes)for(let j=0;j<attr.itemSize;j++)values[name].push(attr.getComponent(id,j));const p=points[id];let u=view==='front'?(p.x-bounds.min.x)/size.x:view==='back'?(bounds.max.x-p.x)/size.x:mirror?(p.z-bounds.min.z)/size.z:(bounds.max.z-p.z)/size.z;const v=(p.y-bounds.min.y)/size.y;u=THREE.MathUtils.clamp(u,.001,.999);uv.push((tile+u)/3,THREE.MathUtils.clamp(v,.001,.999));}indices.push(next);}
  }
  const geometry=new THREE.BufferGeometry();for(const [name,attr] of attributes)geometry.setAttribute(name,new THREE.BufferAttribute(new attr.array.constructor(values[name]),attr.itemSize,attr.normalized));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){oldMaterials.add(m);for(const x of Object.values(m))if(x?.isTexture)oldTextures.add(x);}mesh.geometry=geometry;mesh.material=material;original.dispose();
 }
 oldMaterials.forEach(m=>m.dispose());oldTextures.forEach(t=>{t.dispose();t.image?.close?.();});pose(0,'reach');
 model.userData={...model.userData,asset:'personal-three-view-v1',appearance:'user-photo',appearanceLicense:'User provided photos; no license grant',geometrySource:'Bundled Luna CC0 template; not reconstructed from photos',projection:{views:counts,referenceArmDeg,unobservedSide:'mirrored approximation'},skin:'source-weighted'};
 return model;
}
// Extend nearest visible color into border background before UV sampling.
// Template and photograph silhouettes differ; alpha cutouts would amputate skin.
export function extendPhotoColors(data,width,height,stride=width,offset=0){
 const queue=new Int32Array(width*height),seen=new Uint8Array(width*height);let read=0,end=0;
 const at=p=>((Math.floor(p/width)*stride)+offset+p%width)*4;
 for(let p=0;p<seen.length;p++)if(data[at(p)+3]){seen[p]=1;queue[end++]=p;}
 if(!end)throw new Error('視圖缺少可見人物，請重新選圖。');
 const visit=(p,from)=>{if(seen[p])return;seen[p]=1;const a=at(p),b=at(from);for(let k=0;k<3;k++)data[a+k]=data[b+k];data[a+3]=255;queue[end++]=p;};
 while(read<end){const p=queue[read++],x=p%width;if(x)visit(p-1,p);if(x<width-1)visit(p+1,p);if(p>=width)visit(p-width,p);if(p<width*(height-1))visit(p+width,p);}
}
export function makeThreeViewAtlas(canvases,{document=globalThis.document}={}){
 const atlas=document.createElement('canvas');atlas.width=BODY_WIDTH*3;atlas.height=BODY_HEIGHT;const ctx=atlas.getContext('2d');
 AVATAR_VIEWS.forEach((k,i)=>ctx.drawImage(canvases[k],i*BODY_WIDTH,0,BODY_WIDTH,BODY_HEIGHT));
 // Only remove a nearly uniform border-connected background. Nonuniform scenes
 // remain opaque and require better photos; no semantic segmentation claim.
 const image=ctx.getImageData(0,0,atlas.width,atlas.height),data=image.data;
 for(let tile=0;tile<3;tile++){
  const start=tile*BODY_WIDTH,w=BODY_WIDTH,h=BODY_HEIGHT,color=(x,y)=>Array.from(data.slice((y*atlas.width+start+x)*4,(y*atlas.width+start+x)*4+3)),cs=[color(2,2),color(w-3,2),color(2,h-3),color(w-3,h-3)],bg=[0,1,2].map(k=>cs.reduce((s,c)=>s+c[k],0)/4);
  if(cs.some(c=>Math.hypot(...c.map((v,k)=>v-bg[k]))>24))continue;
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let read=0,end=0;
  const add=(x,y)=>{if(x<0||x>=w||y<0||y>=h)return;const p=y*w+x;if(seen[p])return;seen[p]=1;const j=(y*atlas.width+start+x)*4;if(Math.hypot(data[j]-bg[0],data[j+1]-bg[1],data[j+2]-bg[2])<38){data[j+3]=0;queue[end++]=p;}};
  for(let x=0;x<w;x++){add(x,0);add(x,h-1);}for(let y=0;y<h;y++){add(0,y);add(w-1,y);}while(read<end){const p=queue[read++],x=p%w,y=Math.floor(p/w);add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
 }
 for(let tile=0;tile<3;tile++){let visible=0;for(let y=0;y<BODY_HEIGHT;y++)for(let x=0;x<BODY_WIDTH;x++)if(data[(y*atlas.width+tile*BODY_WIDTH+x)*4+3]>0)visible++;if(visible<BODY_WIDTH*BODY_HEIGHT*.02)throw new Error('視圖缺少可見人物，請重新選圖。');}
 for(let tile=0;tile<3;tile++)extendPhotoColors(data,BODY_WIDTH,BODY_HEIGHT,atlas.width,tile*BODY_WIDTH);
 ctx.putImageData(image,0,0);const texture=new THREE.CanvasTexture(atlas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
// GitHub Pages serves assets under public/ while a packaged dist serves them
// at its root. Follow the same deployment override as the main coach loader.
export function avatarTemplateURL({document=globalThis.document,baseURL=globalThis.location?.href||import.meta.url}={}){return new URL(document?.documentElement?.dataset?.modelUrl||'./models/luna-v1.glb',baseURL).href;}
export async function createThreeViewAvatar(profile,{decode=decodeAvatarPhoto,loadTemplate=async()=>{const url=avatarTemplateURL({document});try{return (await new GLTFLoader().loadAsync(url)).scene;}catch(error){throw Object.assign(new Error('Avatar template could not load'),{code:'AVATAR_TEMPLATE_LOAD',cause:error});}},document=globalThis.document}={}){
 const value=validateProfile(profile),canvases={};let model,texture;
 try{for(const k of AVATAR_VIEWS){const c=await decode(value.views[k]);canvases[k]=c;if(c.width!==BODY_WIDTH||c.height!==BODY_HEIGHT)throw new Error('三視圖貼圖尺寸不相容。');}texture=makeThreeViewAtlas(canvases,{document});model=await loadTemplate();if(!inspectHumanoidRig(model).diagnostics.compatible)throw new Error('基底骨架不相容。');projectThreeViews(model,{texture,referenceArmDeg:value.referenceArmDeg});return model;}
 catch(error){texture?.dispose();if(texture?.image)texture.image.width=texture.image.height=0;if(model){const {disposeAvatar}=await import('./personal-avatar.js?v=0.9.34');disposeAvatar(model);}throw error;}
 finally{for(const c of Object.values(canvases))c.width=c.height=0;}
}
