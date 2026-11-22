import * as THREE from 'three';
const corners=box=>{const out=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])out.push(new THREE.Vector3(x,y,z));return out;};
// A linear blend of non-negative normalized skin influences is inside the
// union's convex envelope. Cache influence-local boxes once, then transform
// only their corners per frame instead of re-skinning every mesh vertex.
export function createAvatarEnvelope(root){
 const entries=[],point=new THREE.Vector3(),delta=new THREE.Vector3();let vertices=0,fallbackMeshes=0;
 root.updateMatrixWorld(true);
 root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
  const g=mesh.geometry,pos=g.attributes.position,weights=g.attributes.skinWeight,indices=g.attributes.skinIndex,boxes=new Map();vertices+=pos.count;
  let valid=Boolean(mesh.isSkinnedMesh&&weights&&indices&&weights.itemSize===4&&indices.itemSize===4);
  if(valid)for(let i=0;i<pos.count;i++){
   let total=0;for(let j=0;j<4;j++){const w=weights.getComponent(i,j),bone=indices.getComponent(i,j);if(!Number.isFinite(w)||w<0||!mesh.skeleton.bones[bone]){valid=false;break;}total+=w;}if(!valid||Math.abs(total-1)>.00001){valid=false;break;}
  }
  if(!valid){fallbackMeshes++;entries.push({mesh,fallback:true,world:corners(new THREE.Box3(new THREE.Vector3(),new THREE.Vector3()))});return;}
  for(let i=0;i<pos.count;i++){
   point.fromBufferAttribute(pos,i);delta.set(0,0,0);
   // Covers all morph weights in [-1,1]; fall back to exact bounds outside it.
   for(const attr of g.morphAttributes.position||[]){const d=new THREE.Vector3().fromBufferAttribute(attr,i);if(!g.morphTargetsRelative)d.sub(point);delta.add(new THREE.Vector3(Math.abs(d.x),Math.abs(d.y),Math.abs(d.z)));}
   const lo=point.clone().sub(delta),hi=point.clone().add(delta);
   for(let j=0;j<4;j++)if(weights.getComponent(i,j)>0){const index=indices.getComponent(i,j);let box=boxes.get(index);if(!box){box=new THREE.Box3();boxes.set(index,box);}const transform=mesh.skeleton.boneInverses[index].clone().multiply(mesh.bindMatrix);for(const v of corners(new THREE.Box3(lo,hi)))box.expandByPoint(v.applyMatrix4(transform));}
  }
  for(const [index,box] of boxes)entries.push({mesh,bone:mesh.skeleton.bones[index],local:corners(box),world:corners(box),matrix:new THREE.Matrix4()});
 });
 const points=[],box=new THREE.Box3();
 return {update(){
  points.length=0;box.makeEmpty();root.updateWorldMatrix(true,true);
  const updated=new Set(),fallback=new Set();
  for(const e of entries){if(!e.mesh.visible||!root.visible)continue;if(!updated.has(e.mesh)){e.mesh.updateMatrixWorld(true);updated.add(e.mesh);}
   if(e.fallback||(e.mesh.morphTargetInfluences||[]).some(w=>!Number.isFinite(w)||Math.abs(w)>1)){
    if(fallback.has(e.mesh))continue;fallback.add(e.mesh);const exact=new THREE.Box3().setFromObject(e.mesh,true);if(exact.isEmpty())continue;const c=corners(exact);for(let i=0;i<8;i++){e.world[i].copy(c[i]);points.push(e.world[i]);box.expandByPoint(e.world[i]);}continue;
   }
   e.matrix.multiplyMatrices(e.mesh.matrixWorld,e.mesh.bindMatrixInverse).multiply(e.bone.matrixWorld);
   for(let i=0;i<8;i++){e.world[i].copy(e.local[i]).applyMatrix4(e.matrix);points.push(e.world[i]);box.expandByPoint(e.world[i]);}
  }
  return {points,box};
 },get diagnostics(){return {vertices,cachedBoxes:entries.length,fallbackMeshes,method:'skin-influence-envelope'};}};
}

export function safeStageInsets(viewport,overlays,padding=8){
 const result={left:0,right:0,top:0,bottom:0};
 for(const rect of overlays){
  const x0=Math.max(viewport.left,rect.left),x1=Math.min(viewport.right,rect.right),y0=Math.max(viewport.top,rect.top),y1=Math.min(viewport.bottom,rect.bottom);
  if(x1<=x0||y1<=y0)continue;
  const options=[['left',x1-viewport.left,viewport.width],['right',viewport.right-x0,viewport.width],['top',y1-viewport.top,viewport.height],['bottom',viewport.bottom-y0,viewport.height]];
  options.sort((a,b)=>a[1]/a[2]-b[1]/b[2]);const [side,size]=options[0];result[side]=Math.max(result[side],size+padding);
 }
 return result;
}
export function observeStageInsets({document,viewport,Observer=globalThis.ResizeObserver}){
 const overlays=[...document.querySelectorAll('.studio-actions,.studio-top > .pill,.stage-playback,.stage-hint,.view-tools,.skeleton-controls,.coach-hello')];let current={left:0,right:0,top:0,bottom:0},size={width:0,height:0};
 function refresh(){const v=viewport.getBoundingClientRect();if(v.width<=0||v.height<=0)return;size={width:v.width,height:v.height};current=safeStageInsets(v,overlays.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect()));}
 const observer=Observer?new Observer(refresh):null;observer?.observe(viewport);overlays.forEach(e=>observer?.observe(e));refresh();
 return {refresh,get value(){return {...current};},get size(){return {...size};},dispose(){observer?.disconnect();}};
}
export function createAutoFraming({camera,controls,getPoints,getSize,getInsets=()=>({left:0,right:0,top:0,bottom:0}),fill=.92}){
 let initialized=false,last=null,frames=0,lastDistance=null,lastRequired=null,lastCount=0;
 const box=new THREE.Box3(),back=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(),offset=new THREE.Vector3();
 return {reset(){initialized=false;last=null;},update(now){
  const points=getPoints().filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)),size=getSize();if(!points.length||!(size.width>0&&size.height>0))return false;
  if(camera.aspect!==size.width/size.height){camera.aspect=size.width/size.height;camera.updateProjectionMatrix();}
  box.makeEmpty();points.forEach(p=>box.expandByPoint(p));const desired=box.getCenter(new THREE.Vector3()),dt=last===null?0:Math.max(0,Math.min(.1,(now-last)/1000));last=now;
  const target=initialized?controls.target.clone().lerp(desired,1-Math.exp(-dt*4)):desired;
  back.subVectors(camera.position,controls.target);if(back.lengthSq()<1e-8)back.set(0,0,1);back.normalize();right.crossVectors(camera.up,back).normalize();up.crossVectors(back,right).normalize();
  const insets=getInsets(),fov=camera.getEffectiveFOV?.()||camera.fov,tanY=Math.tan(fov*Math.PI/360),tanX=tanY*camera.aspect;
  // Conservative symmetric safe area also excludes UI overlapping one edge.
  const fx=Math.max(.08,fill-2*Math.max(insets.left||0,insets.right||0)/size.width),fy=Math.max(.08,fill-2*Math.max(insets.top||0,insets.bottom||0)/size.height);
  let required=camera.near*2;
  for(const p of points){offset.subVectors(p,target);const z=offset.dot(back);required=Math.max(required,z+Math.abs(offset.dot(right))/(tanX*fx),z+Math.abs(offset.dot(up))/(tanY*fy),z+camera.near*2);}
  const current=camera.position.distanceTo(controls.target),distance=!initialized||required>current?required:current+(required-current)*(1-Math.exp(-dt*3));
  controls.target.copy(target);camera.position.copy(target).addScaledVector(back,distance);camera.lookAt(target);const far=distance+box.getSize(new THREE.Vector3()).length()+2;if(far>camera.far){camera.far=far;camera.updateProjectionMatrix();}camera.updateMatrixWorld(true);initialized=true;frames++;lastDistance=distance;lastRequired=required;lastCount=points.length;
  return true;
 },get diagnostics(){return {enabled:true,frames,distance:lastDistance,requiredDistance:lastRequired,points:lastCount,fill,expansion:'immediate',contraction:'exponential',bounds:'current-avatar-skin-envelope'};}};
}
