import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareStandingCoach} from './rig.js?v=0.9.38';
import {motionAt} from './course.js?v=0.9.38';
import {inspectHumanoidRig} from './humanoid-rig.js?v=0.9.38';
import {AVATAR_VIEWS,BODY_WIDTH,BODY_HEIGHT,decodeAvatarPhoto,validateProfile,normalizeViewRect} from './avatar-profile.js?v=0.9.38';
// Scanline silhouette correspondence matches each leg/arm interval separately,
// rather than projecting the empty gap between photo legs onto model skin.
export function mergeIntervals(ranges,gap=.005){const out=[];for(const r of ranges.sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&r[0]<=last[1]+gap)last[1]=Math.max(last[1],r[1]);else out.push([...r]);}return out;}
export function matchPhotoInterval(u,modelRanges,photoRanges){
 if(!modelRanges?.length||!photoRanges?.length)return null;
 let index=0,distance=Infinity;modelRanges.forEach((r,i)=>{const d=Math.max(r[0]-u,0,u-r[1]);if(d<distance){distance=d;index=i;}});
 const m=modelRanges[index];let p;if(modelRanges.length===photoRanges.length)p=photoRanges[index];else{const center=(m[0]+m[1])/2;p=photoRanges.reduce((a,b)=>Math.abs((a[0]+a[1])/2-center)<=Math.abs((b[0]+b[1])/2-center)?a:b);}
 const t=THREE.MathUtils.clamp((u-m[0])/Math.max(1e-6,m[1]-m[0]),.04,.96);return p[0]+(p[1]-p[0])*t;
}
function silhouetteRows(meshes,bounds,size,view){const rows=Array.from({length:256},()=>[]),axis=view==='side'?'z':'x';
 for(const {mesh,points} of meshes){const idx=mesh.geometry.index,n=idx?.count||points.length;for(let i=0;i<n;i+=3){const ps=[0,1,2].map(k=>points[idx?idx.getX(i+k):i+k]),ys=ps.map(p=>(bounds.max.y-p.y)/size.y*255),us=ps.map(p=>view==='back'?(bounds.max.x-p.x)/size.x:view==='side'?(bounds.max.z-p.z)/size.z:(p.x-bounds.min.x)/size.x);for(let y=Math.max(0,Math.ceil(Math.min(...ys)));y<=Math.min(255,Math.floor(Math.max(...ys)));y++){const hits=[];for(let e=0;e<3;e++){const f=(e+1)%3;if(Math.abs(ys[e]-ys[f])<1e-8)continue;const t=(y-ys[e])/(ys[f]-ys[e]);if(t>=0&&t<=1)hits.push(us[e]+(us[f]-us[e])*t);}if(hits.length>1)rows[y].push([Math.min(...hits),Math.max(...hits)]);}}}
 return rows.map(r=>mergeIntervals(r));
}
function nearestRow(rows,y){for(let d=0;d<8;d++)for(const k of [y-d,y+d])if(rows[k]?.length)return rows[k];return [];}
// Skin uses one robust photo-derived tone instead of projecting clothing,
// hair and cast shadows onto arms/neck. Detailed photo mapping stays on face/clothes.
export function isWarmSkin([r,g,b]){return r>45&&r>g*1.02&&g>b*1.03&&r-b>14;}
export function skinToneFromPhoto(data,width,height,stride=width,offset=0){const channels=[[],[],[]];for(let y=Math.floor(height*.25);y<height*.67;y+=3)for(let x=0;x<width;x+=3){const i=(y*stride+offset+x)*4,rgb=[data[i],data[i+1],data[i+2]];if(isWarmSkin(rgb)&&Math.max(...rgb)<248)rgb.forEach((v,k)=>channels[k].push(v));}return channels[0].length>40?channels.map(c=>c.sort((a,b)=>a-b)[Math.floor(c.length/2)]):[195,155,125];}
function baseSampler(material,document){const image=material?.map?.image;if(!image||!document)return null;try{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const {data}=ctx.getImageData(0,0,c.width,c.height),w=c.width,h=c.height,flip=material.map.flipY;c.width=c.height=0;return (u,v)=>{const i=(Math.min(h-1,Math.max(0,Math.floor((flip?1-v:v)*h)))*w+Math.min(w-1,Math.max(0,Math.floor(u*w))))*4;return [data[i],data[i+1],data[i+2]];};}catch{return null;}}
function medianPhotoColor(data,width,height,stride,kind,offset=0){const cs=[[],[],[]];for(let y=Math.floor(height*(kind==='shirt'?.25:.55));y<height*(kind==='shirt'?.46:.9);y+=3)for(let x=0;x<width;x+=3){const i=(y*stride+offset+x)*4,r=data[i],g=data[i+1],b=data[i+2],ok=!isWarmSkin([r,g,b])&&Math.max(r,g,b)<225&&Math.min(r,g,b)>20;if(ok)[r,g,b].forEach((v,k)=>cs[k].push(v));}return cs[0].length>30?cs.map(c=>c.sort((a,b)=>a-b)[Math.floor(c.length/2)]):kind==='shirt'?[170,110,135]:[48,50,58];}
function solidSurface(rgb){return new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...rgb.map(v=>v/255)).convertSRGBToLinear(),roughness:1,metalness:0});}
function bodySurface(base,skin,shirt,document){const image=base?.map?.image;if(!image||!document)return solidSurface(shirt);const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,512,512);const pixels=ctx.getImageData(0,0,512,512);for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2],isSkin=r>g*1.06&&g>b*1.05&&r-b>30;const color=isSkin?skin:shirt;for(let k=0;k<3;k++)pixels.data[i+k]=color[k];}ctx.putImageData(pixels,0,0);const map=new THREE.CanvasTexture(c);map.flipY=base.map.flipY;map.channel=1;map.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map,roughness:1,metalness:0});}
function leggingsSurface(pants,skin,document){if(!document)return solidSurface(pants);const c=document.createElement('canvas');c.width=2;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle=`rgb(${pants.join(',')})`;ctx.fillRect(0,0,2,512);ctx.fillStyle=`rgb(${skin.join(',')})`;ctx.fillRect(0,Math.round(512*(1-.055)),2,512);ctx.fillRect(0,0,2,Math.round(512*(1-.575)));const map=new THREE.CanvasTexture(c);map.channel=2;map.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map,roughness:1,metalness:0});}
// UVs are baked once in the reference pose. Mesh geometry/bones are a template,
// not a photogrammetric reconstruction. One atlas keeps practice draw calls low.
export function projectThreeViews(model,{referenceArmDeg=30,texture,viewRects={},photoRows=texture?.avatarPhotoRows,document=globalThis.document}={}){
 const pose=prepareStandingCoach(model);let lo=0,hi=6;for(let i=0;i<24;i++){const t=(lo+hi)/2;if(motionAt('reach',t).armAngle<referenceArmDeg*Math.PI/180)lo=t;else hi=t;}pose((lo+hi)/2,'reach');model.updateMatrixWorld(true);
 const meshes=[],bounds=new THREE.Box3();model.traverse(mesh=>{if(!mesh.isMesh)return;const points=[];for(let i=0;i<mesh.geometry.attributes.position.count;i++){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);points.push(p);bounds.expandByPoint(p);}meshes.push({mesh,points});});
 const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),counts={front:0,side:0,back:0};if(size.y<=0||size.x<=0||size.z<=0)throw new Error('模型範圍無效。');
 const modelRows=photoRows?Object.fromEntries(AVATAR_VIEWS.map(v=>[v,silhouetteRows(meshes,bounds,size,v)])):null;
 const oldMaterials=new Set(),oldTextures=new Set();const tone=texture?.avatarSkinTone||[195,155,125],skinMaterial=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...tone.map(v=>v/255)).convertSRGBToLinear(),roughness:1,metalness:0});const material=new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0,alphaTest:.4});
 for(const {mesh,points} of meshes){const original=mesh.geometry,index=original.index,attributes=[...Object.entries(original.attributes),...(original.attributes.uv?[['sourceUV',original.attributes.uv]]:[])].filter(([key])=>key!=='uv'&&key!=='uv1'&&key!=='tangent'),values=Object.fromEntries(attributes.map(([k])=>[k,[]])),uv=[],surfaceUV=[],indices=[],buckets=[[],[],[],[],[]],cache=new Map(),base=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,sampleBase=baseSampler(base,document),templateMaterial=solidSurface([65,38,24]),torsoMaterial=bodySurface(base,tone,texture?.avatarShirtTone||[170,110,135],document),pantsMaterial=leggingsSurface(texture?.avatarPantsTone||[48,50,58],tone,document);
  const count=index?.count||points.length;
  for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),[a,b,c]=ids.map(k=>points[k]),normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize(),mid=a.clone().add(b).add(c).multiplyScalar(1/3),central=Math.abs(mid.x-center.x)<size.y*.145;
   // Side input has resting arms. Use front/back for extended limbs to avoid
   // projecting the side torso onto those arms. One observed side mirrors the other.
   const side=central&&(mid.y-bounds.min.y)/size.y>.52&&Math.abs(normal.x)>.82,view=side?'side':normal.z<0?'back':'front',mirror=side&&normal.x<0,tile=AVATAR_VIEWS.indexOf(view);counts[view]++;
   const weights={};for(const id of ids)for(let k=0;k<4;k++){const bone=mesh.skeleton?.bones[original.attributes.skinIndex?.getComponent(id,k)],name=bone?.name?.split(':').at(-1)||'';weights[name]=(weights[name]||0)+(original.attributes.skinWeight?.getComponent(id,k)||0);}
   const part=Object.entries(weights).sort((a,b)=>b[1]-a[1])[0]?.[0]||'',uv0=original.attributes.uv,bu=uv0?ids.reduce((s,id)=>s+uv0.getX(id),0)/3:0,bv=uv0?ids.reduce((s,id)=>s+uv0.getY(id),0)/3:0,color=sampleBase?.(bu,bv),head=/Head$/.test(part),arm=/(?:Shoulder|Arm|ForeArm|Hand|Hand\w*)$/.test(part),neck=/Neck$/.test(part),torso=/Spine[12]?$/.test(part),foot=/(?:Foot|ToeBase)$/.test(part),vMid=(mid.y-bounds.min.y)/size.y;
   const face=head&&normal.z>.65&&vMid>.865&&vMid<.96&&Math.abs(mid.x-center.x)<size.y*.04;
   const region=head?(face?0:color&&isWarmSkin(color)&&color[0]>165&&color[1]>120&&color[2]>90&&vMid<.955?1:2):(arm||neck)?1:torso?3:4;
   for(const id of ids){const key=id+':'+view+':'+mirror;let next=cache.get(key);if(next===undefined){next=uv.length/2;cache.set(key,next);for(const [name,attr] of attributes)for(let j=0;j<attr.itemSize;j++)values[name].push(attr.getComponent(id,j));const p=points[id];let u=view==='front'?(p.x-bounds.min.x)/size.x:view==='back'?(bounds.max.x-p.x)/size.x:mirror?(p.z-bounds.min.z)/size.z:(bounds.max.z-p.z)/size.z;const v=(p.y-bounds.min.y)/size.y;const rect=normalizeViewRect(viewRects[view]),photoY=rect.y+(1-THREE.MathUtils.clamp(v,.001,.999))*rect.height;
 if(modelRows&&photoRows?.[view]){let mr=nearestRow(modelRows[view],Math.round((1-v)*255));if(mirror)mr=mr.map(r=>[1-r[1],1-r[0]]).reverse();const pr=nearestRow(photoRows[view],Math.round(photoY*(BODY_HEIGHT-1)));u=matchPhotoInterval(u,mr,pr)??(rect.x+u*rect.width);}else u=rect.x+THREE.MathUtils.clamp(u,.001,.999)*rect.width;
 uv.push((tile+THREE.MathUtils.clamp(u,.001,.999))/3,1-photoY);surfaceUV.push(.5,THREE.MathUtils.clamp(v,0,1));}buckets[region].push(next);}
  }
  const geometry=new THREE.BufferGeometry();for(const [name,attr] of attributes)geometry.setAttribute(name==='sourceUV'?'uv1':name,new THREE.BufferAttribute(new attr.array.constructor(values[name]),attr.itemSize,attr.normalized));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('uv2',new THREE.Float32BufferAttribute(surfaceUV,2));for(let group=0;group<5;group++){if(buckets[group].length)geometry.addGroup(indices.length,buckets[group].length,group);indices.push(...buckets[group]);}geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){oldMaterials.add(m);for(const x of Object.values(m))if(x?.isTexture)oldTextures.add(x);}mesh.geometry=geometry;mesh.material=[material,skinMaterial,templateMaterial,torsoMaterial,pantsMaterial];original.dispose();
 }
 oldMaterials.forEach(m=>m.dispose());oldTextures.forEach(t=>{t.dispose();t.image?.close?.();});pose(0,'reach');
 model.userData={...model.userData,asset:'personal-three-view-v1',appearance:'user-photo',appearanceLicense:'User provided photos; no license grant',geometrySource:'Bundled Luna CC0 template; not reconstructed from photos',projection:{views:counts,referenceArmDeg,unobservedSide:'mirrored approximation'},skin:'source-weighted',surface:'photo face; sampled skin and outfit colors; template outfit boundaries and hair geometry'};
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
 const image=ctx.getImageData(0,0,atlas.width,atlas.height),data=image.data,photoRows={},combine=colors=>[0,1,2].map(k=>colors.map(c=>c[k]).sort((a,b)=>a-b)[1]),skinTone=combine([0,1,2].map(i=>skinToneFromPhoto(data,BODY_WIDTH,BODY_HEIGHT,atlas.width,i*BODY_WIDTH))),shirtTone=combine([0,1,2].map(i=>medianPhotoColor(data,BODY_WIDTH,BODY_HEIGHT,atlas.width,'shirt',i*BODY_WIDTH))),pantsTone=combine([0,1,2].map(i=>medianPhotoColor(data,BODY_WIDTH,BODY_HEIGHT,atlas.width,'pants',i*BODY_WIDTH)));
 for(let tile=0;tile<3;tile++){
  const start=tile*BODY_WIDTH,w=BODY_WIDTH,h=BODY_HEIGHT,color=(x,y)=>Array.from(data.slice((y*atlas.width+start+x)*4,(y*atlas.width+start+x)*4+3)),cs=[color(2,2),color(w-3,2),color(2,h-3),color(w-3,h-3)],bg=[0,1,2].map(k=>cs.reduce((s,c)=>s+c[k],0)/4);
  if(cs.some(c=>Math.hypot(...c.map((v,k)=>v-bg[k]))>24))continue;
  photoRows[AVATAR_VIEWS[tile]]=Array.from({length:h},(_,y)=>{const ranges=[];let begin=-1;for(let x=0;x<=w;x++){const j=(y*atlas.width+start+x)*4,fg=x<w&&Math.hypot(data[j]-bg[0],data[j+1]-bg[1],data[j+2]-bg[2])>50;if(fg&&begin<0)begin=x;if(!fg&&begin>=0){if(x-begin>=3)ranges.push([begin/w,(x-1)/w]);begin=-1;}}return mergeIntervals(ranges,.008);});
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let read=0,end=0;
  const add=(x,y)=>{if(x<0||x>=w||y<0||y>=h)return;const p=y*w+x;if(seen[p])return;seen[p]=1;const j=(y*atlas.width+start+x)*4;if(Math.hypot(data[j]-bg[0],data[j+1]-bg[1],data[j+2]-bg[2])<38){data[j+3]=0;queue[end++]=p;}};
  for(let x=0;x<w;x++){add(x,0);add(x,h-1);}for(let y=0;y<h;y++){add(0,y);add(w-1,y);}while(read<end){const p=queue[read++],x=p%w,y=Math.floor(p/w);add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
 }
 for(let tile=0;tile<3;tile++){let visible=0;for(let y=0;y<BODY_HEIGHT;y++)for(let x=0;x<BODY_WIDTH;x++)if(data[(y*atlas.width+tile*BODY_WIDTH+x)*4+3]>0)visible++;if(visible<BODY_WIDTH*BODY_HEIGHT*.02)throw new Error('視圖缺少可見人物，請重新選圖。');}
 for(let tile=0;tile<3;tile++)extendPhotoColors(data,BODY_WIDTH,BODY_HEIGHT,atlas.width,tile*BODY_WIDTH);
 ctx.putImageData(image,0,0);const texture=new THREE.CanvasTexture(atlas);texture.colorSpace=THREE.SRGBColorSpace;texture.avatarPhotoRows=photoRows;texture.avatarSkinTone=skinTone;texture.avatarShirtTone=shirtTone;texture.avatarPantsTone=pantsTone;return texture;
}
// GitHub Pages serves assets under public/ while a packaged dist serves them
// at its root. Follow the same deployment override as the main coach loader.
export function avatarTemplateURL({document=globalThis.document,baseURL=globalThis.location?.href||import.meta.url}={}){return new URL(document?.documentElement?.dataset?.modelUrl||'./models/luna-v1.glb',baseURL).href;}
export async function createThreeViewAvatar(profile,{decode=decodeAvatarPhoto,loadTemplate=async()=>{const url=avatarTemplateURL({document});try{return (await new GLTFLoader().loadAsync(url)).scene;}catch(error){throw Object.assign(new Error('Avatar template could not load'),{code:'AVATAR_TEMPLATE_LOAD',cause:error});}},document=globalThis.document}={}){
 const value=validateProfile(profile),canvases={};let model,texture;
 try{for(const k of AVATAR_VIEWS){const c=await decode(value.views[k]);canvases[k]=c;if(c.width!==BODY_WIDTH||c.height!==BODY_HEIGHT)throw new Error('三視圖貼圖尺寸不相容。');}texture=makeThreeViewAtlas(canvases,{document});model=await loadTemplate();if(!inspectHumanoidRig(model).diagnostics.compatible)throw new Error('基底骨架不相容。');projectThreeViews(model,{texture,referenceArmDeg:value.referenceArmDeg,viewRects:value.viewRects,document});return model;}
 catch(error){texture?.dispose();if(texture?.image)texture.image.width=texture.image.height=0;if(model){const {disposeAvatar}=await import('./personal-avatar.js?v=0.9.38');disposeAvatar(model);}throw error;}
 finally{for(const c of Object.values(canvases))c.width=c.height=0;}
}
