import * as THREE from 'three';
import { usableJoint, skeletonFresh } from './skeleton.js?v=0.9.25';

const PAIRS=[['LeftArm','LeftForeArm',11,13],['LeftForeArm','LeftHand',13,15],['RightArm','RightForeArm',12,14],['RightForeArm','RightHand',14,16],['LeftUpLeg','LeftLeg',23,25],['LeftLeg','LeftFoot',25,27],['RightUpLeg','RightLeg',24,26],['RightLeg','RightFoot',26,28]];
const MIRROR=new Map([[11,12],[12,11],[13,14],[14,13],[15,16],[16,15],[23,24],[24,23],[25,26],[26,25],[27,28],[28,27]]);
export function createStudentRetarget(model,{mirror=true}={}) {
  const all=[];model.traverse(o=>{if(o.isBone)all.push(o);});
  const find=name=>all.find(b=>b.name===name)||all.find(b=>b.name.endsWith(name));
  const neutral=new Map(all.map(b=>[b,b.quaternion.clone()])),targets=new Map(),lastSeen=new Map();
  let lastCapture=-Infinity,lastUpdate=null,tracking='waiting',space='none',accepted=0,rejected=0;
  const q=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),rotation=new THREE.Quaternion(),a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3();
  function aim(bone,child,target){
    bone.getWorldPosition(a);child.getWorldPosition(b);direction.subVectors(b,a);
    if(direction.lengthSq()<1e-8)return;
    bone.getWorldQuaternion(q);rotation.setFromUnitVectors(direction.normalize(),target);q.premultiply(rotation);
    bone.parent.getWorldQuaternion(parentQ).invert();bone.quaternion.copy(parentQ.multiply(q)).normalize();bone.updateWorldMatrix(false,true);
  }
  return {
    accept(data,now){
      if(!skeletonFresh(data?.capturedAt,now)||data.capturedAt<=lastCapture||data.landmarks?.length!==1||Number.isFinite(data.brightness)&&data.brightness<32){rejected++;return false;}
      const image=data.landmarks[0],world=data.worldLandmarks?.length===1?data.worldLandmarks[0]:null;
      const validWorld=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
      // Mirror includes anatomical side swapping, not just negating X.
      const index=i=>mirror?(MIRROR.get(i)??i):i;
      const point=i=>{i=index(i);if(!usableJoint(image[i]))return null;const p=world?.[i];return world?(validWorld(p)?new THREE.Vector3((mirror?-1:1)*p.x,-p.y,-p.z):null):new THREE.Vector3((mirror?-1:1)*image[i].x*(Number.isFinite(data.aspect)&&data.aspect>0?data.aspect:1),-image[i].y,0);};
      targets.clear();
      for(const [bone,child,i,j] of PAIRS){const from=point(i),to=point(j);if(!from||!to)continue;const v=to.sub(from);if(v.lengthSq()<1e-8)continue;targets.set(bone,{child,direction:v.normalize()});lastSeen.set(bone,now);}
      const lh=point(23),rh=point(24),ls=point(11),rs=point(12);
      if(lh&&rh&&ls&&rs){const v=ls.add(rs).sub(lh.add(rh)).normalize();if(v.lengthSq()>.5){targets.set('Spine',{child:'Spine1',direction:v});lastSeen.set('Spine',now);}}
      lastCapture=data.capturedAt;tracking=targets.size?'tracking':'unknown';space=world?'world':'image-2d';accepted++;return true;
    },
    update(now){
      const dt=lastUpdate===null?1/30:Math.max(0,Math.min(.1,(now-lastUpdate)/1000));lastUpdate=now;
      const alpha=1-Math.exp(-dt*14),fresh=skeletonFresh(lastCapture,now);
      model.updateWorldMatrix(true,true);const rootQ=model.getWorldQuaternion(new THREE.Quaternion());
      // Parent first. Hips/root and all local bone positions/scales stay fixed.
      for(const name of ['Spine',...PAIRS.map(p=>p[0])]){
        const bone=find(name);if(!bone)continue;
        const previous=bone.quaternion.clone(),target=fresh?targets.get(name):null;
        if(target){const child=find(target.child);if(child)aim(bone,child,target.direction.clone().applyQuaternion(rootQ));}
        else if(!fresh||now-(lastSeen.get(name)??-Infinity)>300)bone.quaternion.copy(neutral.get(bone));
        const next=bone.quaternion.clone();bone.quaternion.copy(previous).slerp(next,alpha);bone.updateWorldMatrix(false,true);
      }
      if(!fresh)tracking='stale';
    },
    reset(){targets.clear();lastSeen.clear();lastCapture=-Infinity;lastUpdate=null;tracking='waiting';for(const [bone,q] of neutral)bone.quaternion.copy(q);model.updateMatrixWorld(true);},
    get diagnostics(){return {tracking,space,mirror,lastCapture:Number.isFinite(lastCapture)?lastCapture:null,accepted,rejected,activeBones:targets.size,rootTranslation:'locked',evaluationSource:'original-mediapipe',skin:'rigid-segments'};},
  };
}
