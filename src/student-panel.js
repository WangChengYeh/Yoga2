import { createAvatarEnvelope } from './auto-framing.js?v=0.9.30';
import { inspectHumanoidRig } from './humanoid-rig.js?v=0.9.30';
import * as THREE from 'three';
import { createStudentModel } from './student-model.js?v=0.9.30';
import { createStudentRetarget } from './student-retarget.js?v=0.9.30';
import { prepareStandingCoach } from './rig.js?v=0.9.30';
import { createSkeletonLayer, createCoachSkeletonSource, skeletonFresh } from './skeleton.js?v=0.9.30';

export function setupStudentPanel({document,onLayout=()=>{}}){
  const $=id=>document.getElementById(id);
  let group,model,retarget,skeleton,source,active=false,token=0,capturedAt=-Infinity,scale=1,offset=0,assetFallback=null,envelope=null;
  const status=text=>{if($('human-status').textContent!==text)$('human-status').textContent=text;};
  const reset=()=>{token++;capturedAt=-Infinity;retarget?.reset();skeleton?.clear();};
  $('human-align').addEventListener('click',()=>{reset();calibrationStatus();});
  $('human-calibrate')?.addEventListener('click',()=>{if(!active||!retarget)return;token++;capturedAt=-Infinity;skeleton?.clear();retarget.beginCalibration();calibrationStatus();});
  function calibrationStatus(){
    const button=$('human-calibrate'),label=$('human-calibration-status');if(button)button.disabled=!active;
    const c=retarget?.diagnostics.calibration;if(!label)return;
    const text=!active?'開啟相機後可校正站姿。':c?.status==='calibrated'?'站姿方向已校正。':c?.status==='collecting'?(c.reason==='world-landmarks-required'?'目前沒有 3D 關節，可繼續練習或重試校正。':`請面向手機站穩，正在取得校正資料（${c.samples}/5）。`):c?.status==='unavailable'?'這次未取得穩定站姿，可繼續練習或重試校正。':'使用預設方向；需要時可校正站姿。';if(label.textContent!==text)label.textContent=text;
  }
  $('human-x').value='0';$('human-x').min='-.5';$('human-x').max='.5';
  for(const id of ['human-x','human-scale'])$(id).addEventListener('input',()=>{offset=Number($('human-x').value);scale=Number($('human-scale').value);$('human-size').textContent=`${Math.round(scale*100)}%`;});
  $('ai-skeleton-toggle').addEventListener('change',()=>skeleton?.clear());
  function release(root){if(!root)return;root.removeFromParent();const geometries=new Set(),materials=new Set(),skins=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}if(o.skeleton)skins.add(o.skeleton);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skins.forEach(s=>s.dispose());}
  function dispose(){reset();skeleton?.dispose();skeleton=null;release(group);group=null;retarget=null;model=null;envelope=null;calibrationStatus();onLayout(false);}
  return {
    attach(scene,asset,{boneMap={}}={}){dispose();assetFallback=null;
      if(asset){const checked=inspectHumanoidRig(asset,{boneMap});if(!checked.diagnostics.compatible){assetFallback=checked.diagnostics;release(asset);asset=null;boneMap={};}}
      group=new THREE.Group();group.name='Yoga2StudentStage';scene.add(group);model=asset||createStudentModel();group.add(model);prepareStandingCoach(model,{boneMap});retarget=createStudentRetarget(model,{boneMap});envelope=createAvatarEnvelope(model);source=createCoachSkeletonSource(model,group,{boneMap});skeleton=createSkeletonLayer({parent:group,color:0x087c71,radius:.009,name:'Yoga2RetargetedSkeleton'});for(const id of ['human-x','human-scale','human-align'])$(id).disabled=false;status(assetFallback?'模型骨架不相容，已使用預設男性學員。':'男性學員已就位；開啟相機以骨架驅動動作。');calibrationStatus();onLayout(true);},
    get context(){return {segment:false,humanToken:token};},
    get snapshot(){return null;},
    get memoryStatus(){return {mode:'student-avatar',segmentation:false,retainedRGBABytes:0,retainedFrames:0,scope:'No retained portrait RGBA; excludes camera decoder and pose input bitmap.'};},
    get diagnostics(){return {mode:'student-avatar',asset:'student-v1',cameraActive:active,segmentation:false,assetFallback,retarget:retarget?.diagnostics||null,transform:group?{position:group.position.toArray(),scale:group.scale.toArray()}:null};},
    get framingEnvelope(){return envelope?.update()||null;},
    get bounds(){return null;},get calibration(){return retarget?.diagnostics.calibration||null;},get cropMinY(){return 0;},
    setLayout({x=1,z=0,yaw=0}){if(!group)return;group.position.set(x+Math.cos(yaw)*offset,0,z-Math.sin(yaw)*offset);group.rotation.y=yaw;group.scale.setScalar(scale);},
    cameraState(value){if(active===value)return;active=value;reset();status(active?'等待清楚的身體關節；學員站位與比例固定。':'相機已關閉；男性學員保持站立。');calibrationStatus();},
    accept(data,now){if(!active||data.context?.humanToken!==token)return false;const ok=retarget?.accept(data,now)||false;if(ok)capturedAt=data.capturedAt;return ok;},
    stale(){reset();status('關節追蹤中斷；學員回到站姿。');calibrationStatus();},
    unavailable:dispose,
    update(camera,now=performance.now()){if(!retarget)return;retarget.update(now);calibrationStatus();const tracked=active&&skeletonFresh(capturedAt,now)&&retarget.diagnostics.tracking==='tracking';if(tracked&&$('ai-skeleton-toggle').checked)skeleton.update(source());else skeleton.clear();$('skeleton-status').textContent=tracked?'學員骨架 · 相機動作映射':'等待清楚的 AI 關節';},
    dispose,
  };
}
