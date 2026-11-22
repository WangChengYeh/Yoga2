import * as THREE from 'three';

// AI joints are projected onto the same mirrored 3D plane as the live cutout.
// This is an image-aligned observation, not a precise 3D body reconstruction.
export const AI_EDGES=[[0,33],[11,33],[12,33],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
export const usableJoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&Number.isFinite(p.visibility)&&p.visibility>=.65&&(p.presence===undefined||Number.isFinite(p.presence)&&p.presence>=.6);
export function aiSkeleton(poses,{brightness=null}={}) {
  const points=Array(34).fill(null);
  if(poses?.length!==1||Number.isFinite(brightness)&&brightness<32)return {points,edges:[]};
  const used=new Set(AI_EDGES.flat());
  for(const i of used){const p=poses[0]?.[i];if(usableJoint(p))points[i]=[.5-p.x,.5-p.y,.012];}
  if(points[11]&&points[12])points[33]=points[11].map((v,i)=>(v+points[12][i])/2);
  const edges=AI_EDGES.filter(([a,b])=>points[a]&&points[b]);
  return {points,edges};
}
export function skeletonFresh(capturedAt,now){return Number.isFinite(capturedAt)&&Number.isFinite(now)&&now>=capturedAt&&now-capturedAt<=1500;}

// Two instanced draw calls per skeleton: thick bones plus joint markers.
// Cylinders remain readable on mobile GPUs whose native line width is 1px.
export function createSkeletonLayer({parent,color=0x087c71,radius=.008,worldRadius=false,name='Yoga2Skeleton'}) {
  const group=new THREE.Group();group.name=name;parent.add(group);
  const material=new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false,toneMapped:false,transparent:true,opacity:.95});
  const bones=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,6),material,128);
  const joints=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),material,128);
  bones.count=joints.count=0;bones.frustumCulled=joints.frustumCulled=false;
  bones.renderOrder=joints.renderOrder=20;group.add(bones,joints);
  bones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3(),mid=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
  const world=new THREE.Matrix4(),inverse=new THREE.Matrix4();
  let disposed=false;
  return {
    group,bones,joints,
    update({points,edges}) {
      if(disposed)return;
      if(worldRadius){group.updateWorldMatrix(true,false);world.copy(group.matrixWorld);inverse.copy(world).invert();}
      let count=0;const visible=new Set();
      for(const [i,j] of edges){
        if(count>=128||!points[i]||!points[j])continue;
        a.fromArray(points[i]);b.fromArray(points[j]);
        if(worldRadius){a.applyMatrix4(world);b.applyMatrix4(world);}
        direction.subVectors(b,a);
        const length=direction.length();if(!Number.isFinite(length)||length<1e-6)continue;
        rotation.setFromUnitVectors(up,direction.divideScalar(length));mid.addVectors(a,b).multiplyScalar(.5);scale.set(radius,length,radius);
        matrix.compose(mid,rotation,scale);if(worldRadius)matrix.premultiply(inverse);bones.setMatrixAt(count++,matrix);visible.add(i);visible.add(j);
      }
      bones.count=count;count=0;rotation.identity();scale.setScalar(radius*1.8);
      for(const i of visible){if(count>=128)break;a.fromArray(points[i]);if(worldRadius)a.applyMatrix4(world);matrix.compose(a,rotation,scale);if(worldRadius)matrix.premultiply(inverse);joints.setMatrixAt(count++,matrix);}
      joints.count=count;bones.instanceMatrix.needsUpdate=true;joints.instanceMatrix.needsUpdate=true;group.visible=bones.count>0;
    },
    clear(){bones.count=joints.count=0;group.visible=false;},
    dispose(){if(disposed)return;disposed=true;parent.remove(group);bones.geometry.dispose();joints.geometry.dispose();material.dispose();bones.dispose();joints.dispose();},
  };
}

export const COACH_JOINTS=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'];
export const COACH_EDGES=[[0,1],[1,2],[2,3],[3,4],[4,5],[3,6],[6,7],[7,8],[8,9],[3,10],[10,11],[11,12],[12,13],[0,14],[14,15],[15,16],[16,17],[0,18],[18,19],[19,20],[20,21]];
export function createCoachSkeletonSource(model,parent,{boneMap={}}={}) {
  const all=[];model.traverse(o=>{if(o.isBone)all.push(o);});
  const bones=COACH_JOINTS.map(name=>{const value=boneMap[name]??name;return typeof value==='string'?all.find(b=>b.name===value)||all.find(b=>b.name.endsWith(value)):all.includes(value)?value:null;});
  const point=new THREE.Vector3(),points=Array.from({length:bones.length},()=>[0,0,0]);
  return ()=>{
    for(let i=0;i<bones.length;i++){
      if(!bones[i]){points[i]=null;continue;}
      bones[i].getWorldPosition(point);parent.worldToLocal(point);points[i]=[point.x,point.y,point.z];
    }
    return {points,edges:COACH_EDGES.filter(([a,b])=>points[a]&&points[b])};
  };
}
