import * as THREE from 'three';
import { usableJoint, skeletonFresh } from './skeleton.js?v=0.9.31';
import { inspectHumanoidRig } from './humanoid-rig.js?v=0.9.31';
const PAIRS=[['LeftArm','LeftForeArm',11,13],['LeftForeArm','LeftHand',13,15],['RightArm','RightForeArm',12,14],['RightForeArm','RightHand',14,16],['LeftUpLeg','LeftLeg',23,25],['LeftLeg','LeftFoot',25,27],['RightUpLeg','RightLeg',24,26],['RightLeg','RightFoot',26,28]];
const ORDER=['Hips','Spine','Spine1','Spine2','Neck','Head',...PAIRS.map(p=>p[0]),'LeftHand','RightHand','LeftFoot','RightFoot'];
const MIRROR=new Map([[1,4],[2,5],[3,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24],[25,26],[27,28],[29,30],[31,32]].flatMap(([a,b])=>[[a,b],[b,a]]));
const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
const unit=v=>v&&v.lengthSq()>1e-8?v.clone().normalize():null;
const middle=(a,b)=>a&&b?a.clone().add(b).multiplyScalar(.5):null;
function frame(lateral,up){
 const y=unit(up);if(!y)return null;const x=unit(lateral.clone().addScaledVector(y,-lateral.dot(y)));if(!x)return null;
 const z=new THREE.Vector3().crossVectors(x,y);return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
function perpendicular(v,axis){return unit(v.clone().addScaledVector(axis,-v.dot(axis)));}
function bounded(q,limit){const a=2*Math.acos(Math.min(1,Math.abs(q.w)));return a>limit?new THREE.Quaternion().slerp(q,limit/a):q;}
// Bounds are visual robustness limits, not validated anatomical ranges.
const limit=name=>/Hand|Foot/.test(name)?1.4:/Neck|Head/.test(name)?.85:/Hips/.test(name)?.9:/Spine/.test(name)?1.2:Math.PI;
export function createStudentRetarget(model,{mirror=true,boneMap={}}={}) {
 const rig=inspectHumanoidRig(model,{boneMap}),find=name=>rig.bones.get(name),all=[...rig.bones.values()];
 const neutral=new Map(all.map(b=>[b,b.quaternion.clone()])),bindings=new Map(),targets=new Map(),lastSeen=new Map();
 let lastCapture=-Infinity,lastUpdate=null,tracking='waiting',space='none',accepted=0,rejected=0,constrained=0;
 let referenceYaw=0,calibrationDeadline=Infinity,calibration={status:'default',samples:0,yaw:0},calibrationSamples=[];
 model.updateWorldMatrix(true,true);
 const modelInverse=model.getWorldQuaternion(new THREE.Quaternion()).invert();
 const position=name=>find(name)?.getWorldPosition(new THREE.Vector3()).applyMatrix4(model.matrixWorld.clone().invert());
 const rootFrame=frame(position('LeftUpLeg')?.sub(position('RightUpLeg')||new THREE.Vector3())||X,position('Spine')?.sub(position('Hips')||new THREE.Vector3())||Y)||new THREE.Quaternion();
 for(const name of ORDER){
  const bone=find(name);if(!bone)continue;
  const childName=PAIRS.find(p=>p[0]===name)?.[1]||({Hips:'Spine',Spine:'Spine1',Spine1:'Spine2',Spine2:'Neck',Neck:'Head',LeftFoot:'LeftToeBase',RightFoot:'RightToeBase'})[name];
  const child=find(childName),origin=bone.getWorldPosition(new THREE.Vector3());
  const direction=child?child.getWorldPosition(new THREE.Vector3()).sub(origin):/Hand|Head/.test(name)?origin.clone().sub(bone.parent.getWorldPosition(new THREE.Vector3())):null;
  if(!unit(direction))continue;direction.applyQuaternion(modelInverse).normalize();
  const secondary=perpendicular(/Foot/.test(name)?Y:Z,direction)||perpendicular(X,direction);
  bindings.set(name,{bone,direction,secondary,orientation:bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(modelInverse)});
 }
 const set=(name,target,now)=>{if(bindings.has(name)&&target){targets.set(name,target);lastSeen.set(name,now);}};
 const orient=(q)=>({orientation:q.clone().multiply(rootFrame.clone().invert())});
 function collectCalibration(point,world,now){
  if(calibration.status!=='collecting')return;
  if(!world){calibration.reason='world-landmarks-required';calibration.samples=0;calibrationSamples=[];return;}
  const l=point(23),r=point(24),s=middle(point(11),point(12)),h=middle(l,r),shoulders=point(11)?.sub(point(12)||new THREE.Vector3());
  if(!l||!r||!s||!h||!shoulders){calibrationSamples=[];calibration.samples=0;calibration.reason='visible-torso-required';return;}
  const up=unit(s.sub(h)),lateral=unit(l.sub(r));
  if(!up||!lateral||up.dot(Y)<.94||Math.abs(lateral.y)>.2||shoulders.length()<.05){calibrationSamples=[];calibration.samples=0;calibration.reason='stand-upright';return;}
  const yaw=Math.atan2(lateral.z,lateral.x);
  if(calibrationSamples.length&&(now-calibrationSamples.at(-1).at>800||Math.abs(Math.atan2(Math.sin(yaw-calibrationSamples[0].yaw),Math.cos(yaw-calibrationSamples[0].yaw)))>.14))calibrationSamples=[];
  calibrationSamples.push({yaw,at:now});if(calibrationSamples.length>12)calibrationSamples.shift();calibration.samples=calibrationSamples.length;calibration.reason='hold-still';
  if(calibrationSamples.length>=5&&now-calibrationSamples[0].at>=600){calibration={status:'calibrated',samples:calibrationSamples.length,yaw:Math.atan2(calibrationSamples.reduce((s,p)=>s+Math.sin(p.yaw),0),calibrationSamples.reduce((s,p)=>s+Math.cos(p.yaw),0)),calibratedAt:now};referenceYaw=calibration.yaw;}
 }
 return {
  beginCalibration(now=performance.now()){calibrationDeadline=now+10000;calibration={status:'collecting',samples:0,yaw:referenceYaw,reason:'stand-upright'};calibrationSamples=[];targets.clear();lastSeen.clear();},
  accept(data,now){
   if(!skeletonFresh(data?.capturedAt,now)||data.capturedAt<=lastCapture||data.landmarks?.length!==1||Number.isFinite(data.brightness)&&data.brightness<32){rejected++;return false;}
   const image=data.landmarks[0],world=data.worldLandmarks?.length===1?data.worldLandmarks[0]:null;
   const point=i=>{i=mirror?(MIRROR.get(i)??i):i;if(!usableJoint(image[i]))return null;const p=world?.[i];return world?(p&&[p.x,p.y,p.z].every(Number.isFinite)?new THREE.Vector3((mirror?-1:1)*p.x,-p.y,-p.z):null):new THREE.Vector3((mirror?-1:1)*image[i].x*(Number.isFinite(data.aspect)&&data.aspect>0?data.aspect:1),-image[i].y,0);};
   collectCalibration(point,world,data.capturedAt);
   const correction=new THREE.Quaternion().setFromAxisAngle(Y,referenceYaw);
   const p=i=>point(i)?.applyQuaternion(correction);
   targets.clear();
   for(const [name,child,i,j] of PAIRS){const from=p(i),to=p(j);if(!from||!to)continue;const direction=unit(to.sub(from));if(direction)set(name,{direction},now);}
   const lh=p(23),rh=p(24),ls=p(11),rs=p(12),hip=middle(lh,rh),shoulder=middle(ls,rs),knee=middle(p(25),p(26));
   const pelvis=world&&lh&&rh&&hip&&knee?frame(lh.clone().sub(rh),hip.clone().sub(knee)):null;
   const torso=world&&ls&&rs&&shoulder&&hip?frame(ls.clone().sub(rs),shoulder.clone().sub(hip)):null;
   if(pelvis)set('Hips',orient(pelvis),now);
   if(torso){for(const [name,t] of [['Spine',1/3],['Spine1',2/3],['Spine2',1]])set(name,orient((pelvis||rootFrame).clone().slerp(torso,t)),now);}
   else if(shoulder&&hip){const direction=unit(shoulder.sub(hip));if(direction)set('Spine',{direction},now);}
   // Head up/side references are estimates; missing/degenerate facial data do
   // not create head orientation. No neck/head depth is invented from 2D input.
   const nose=p(0),earL=p(7),earR=p(8);
   const head=world&&nose&&earL&&earR&&shoulder?frame(earL.sub(earR),nose.sub(shoulder)):null;
   if(head){set('Head',orient(head),now);if(torso)set('Neck',orient(torso.clone().slerp(head,.5)),now);}
   if(world)for(const [side,s,e,w,pinky,index,ankle,heel,toe] of [['Left',11,13,15,17,19,27,29,31],['Right',12,14,16,18,20,28,30,32]]){
    const aShoulder=p(s),aElbow=p(e),aWrist=p(w);
    const upper=aShoulder&&aElbow?aElbow.clone().sub(aShoulder):null,lower=aElbow&&aWrist?aWrist.clone().sub(aElbow):null;
    if(upper&&lower&&unit(upper)&&unit(lower)){
     const plane=new THREE.Vector3().crossVectors(upper.clone().normalize(),lower.clone().normalize());
     if(plane.length()>.2){const target=targets.get(side+'Arm');if(target)target.secondary=plane.normalize();}
    }
    const wrist=p(w),tip=middle(p(pinky),p(index)),a=p(ankle),h=p(heel),t=p(toe);
    if(wrist&&tip){const direction=unit(tip.sub(wrist)),spread=p(index)?.sub(p(pinky)||new THREE.Vector3());
     const normal=direction&&spread?unit(new THREE.Vector3().crossVectors(spread,direction)):null;
     if(direction&&normal){set(side+'Hand',{direction,secondary:normal},now);const fore=targets.get(side+'ForeArm');if(fore)fore.secondary=normal;}}
    if(a&&h&&t){const direction=unit(t.sub(h)),up=a.sub(h);if(direction&&perpendicular(up,direction))set(side+'Foot',{direction,secondary:up},now);}
   }
   lastCapture=data.capturedAt;tracking=targets.size?'tracking':'unknown';space=world?'world':'image-2d';accepted++;return true;
  },
  update(now){
   if(calibration.status==='collecting'&&now>=calibrationDeadline){calibration={...calibration,status:'unavailable',reason:'timeout'};calibrationSamples=[];}
   const dt=lastUpdate===null?1/30:Math.max(0,Math.min(.1,(now-lastUpdate)/1000));lastUpdate=now;
   const alpha=1-Math.exp(-dt*14),fresh=skeletonFresh(lastCapture,now);
   model.updateWorldMatrix(true,true);const rootQ=model.getWorldQuaternion(new THREE.Quaternion());
   for(const name of ORDER){
    const binding=bindings.get(name),bone=binding?.bone;if(!bone)continue;
    const previous=bone.quaternion.clone(),target=fresh?targets.get(name):null;
    if(target){
     let rotation;
     if(target.orientation)rotation=target.orientation.clone();
     else {
      rotation=new THREE.Quaternion().setFromUnitVectors(binding.direction,target.direction);
      if(target.secondary){
       const reference=perpendicular(binding.secondary.clone().applyQuaternion(rotation),target.direction),observed=perpendicular(target.secondary,target.direction);
       if(reference&&observed){if(observed.dot(reference)<0)observed.negate();let twist=Math.atan2(target.direction.dot(new THREE.Vector3().crossVectors(reference,observed)),reference.dot(observed));twist=THREE.MathUtils.clamp(twist,-Math.PI/3,Math.PI/3);rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(target.direction,twist));}
      }
     }
     const worldQ=rootQ.clone().multiply(rotation).multiply(binding.orientation),inverseParent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
     bone.quaternion.copy(inverseParent.multiply(worldQ)).normalize();
     const delta=neutral.get(bone).clone().invert().multiply(bone.quaternion),angle=2*Math.acos(Math.min(1,Math.abs(delta.w)));
     if(angle>limit(name)){bone.quaternion.copy(neutral.get(bone)).multiply(bounded(delta,limit(name)));constrained++;}
    }else if(!fresh||now-(lastSeen.get(name)??-Infinity)>300)bone.quaternion.copy(neutral.get(bone));
    const next=bone.quaternion.clone(),angle=previous.angleTo(next);bone.quaternion.copy(previous).slerp(next,Math.min(alpha,angle>1e-8?dt*8/angle:1));bone.updateWorldMatrix(false,true);
   }
   if(!fresh)tracking='stale';
  },
  reset(){targets.clear();lastSeen.clear();lastCapture=-Infinity;lastUpdate=null;tracking='waiting';referenceYaw=0;calibrationDeadline=Infinity;calibration={status:'default',samples:0,yaw:0};calibrationSamples=[];for(const [bone,q] of neutral)bone.quaternion.copy(q);model.updateMatrixWorld(true);},
  get diagnostics(){return {tracking,space,mirror,calibration:{...calibration},rig:rig.diagnostics,lastCapture:Number.isFinite(lastCapture)?lastCapture:null,accepted,rejected,activeBones:targets.size,observedBones:[...targets.keys()],rootTranslation:'locked',evaluationSource:'original-mediapipe',skin:'rigid-segments',orientationSolver:'neutral-reference-swing',twist:'reference-plane-when-observed',constrained,boundBones:bindings.size,missingBones:ORDER.filter(name=>!bindings.has(name))};},
 };
}
