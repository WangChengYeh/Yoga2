import * as THREE from 'three';
import { createStudentModel } from './student-model.js?v=0.9.24';
import { createStudentRetarget } from './student-retarget.js?v=0.9.24';
import { prepareStandingCoach } from './rig.js?v=0.9.24';
import { createSkeletonLayer, createCoachSkeletonSource, skeletonFresh } from './skeleton.js?v=0.9.24';

export function setupStudentPanel({document,onLayout=()=>{}}){
  const $=id=>document.getElementById(id);
  let group,model,retarget,skeleton,source,active=false,token=0,capturedAt=-Infinity,scale=1,offset=0;
  const status=text=>{if($('human-status').textContent!==text)$('human-status').textContent=text;};
  const reset=()=>{token++;capturedAt=-Infinity;retarget?.reset();skeleton?.clear();};
  $('human-align').addEventListener('click',reset);
  $('human-x').value='0';$('human-x').min='-.5';$('human-x').max='.5';
  for(const id of ['human-x','human-scale'])$(id).addEventListener('input',()=>{offset=Number($('human-x').value);scale=Number($('human-scale').value);$('human-size').textContent=`${Math.round(scale*100)}%`;});
  $('ai-skeleton-toggle').addEventListener('change',()=>skeleton?.clear());
  function dispose(){reset();skeleton?.dispose();skeleton=null;if(group){group.removeFromParent();const geometries=new Set(),materials=new Set(),skins=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.skeleton)skins.add(o.skeleton);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());skins.forEach(s=>s.dispose());}group=null;retarget=null;model=null;onLayout(false);}
  return {
    attach(scene,asset){dispose();group=new THREE.Group();group.name='Yoga2StudentStage';scene.add(group);model=asset||createStudentModel();group.add(model);prepareStandingCoach(model);retarget=createStudentRetarget(model);source=createCoachSkeletonSource(model,group);skeleton=createSkeletonLayer({parent:group,color:0x087c71,radius:.009,name:'Yoga2RetargetedSkeleton'});for(const id of ['human-x','human-scale','human-align'])$(id).disabled=false;status('男性學員已就位；開啟相機以骨架驅動動作。');onLayout(true);},
    get context(){return {segment:false,humanToken:token};},
    get snapshot(){return null;},
    get memoryStatus(){return {mode:'student-avatar',segmentation:false,retainedRGBABytes:0,retainedFrames:0,scope:'No retained portrait RGBA; excludes camera decoder and pose input bitmap.'};},
    get diagnostics(){return {mode:'student-avatar',asset:'student-v1',cameraActive:active,segmentation:false,retarget:retarget?.diagnostics||null,transform:group?{position:group.position.toArray(),scale:group.scale.toArray()}:null};},
    get bounds(){return null;},get calibration(){return null;},get cropMinY(){return 0;},
    setLayout({x=1,z=0,yaw=0}){if(!group)return;group.position.set(x+Math.cos(yaw)*offset,0,z-Math.sin(yaw)*offset);group.rotation.y=yaw;group.scale.setScalar(scale);},
    cameraState(value){if(active===value)return;active=value;reset();status(active?'等待清楚的身體關節；學員站位與比例固定。':'相機已關閉；男性學員保持站立。');},
    accept(data,now){if(!active||data.context?.humanToken!==token)return false;const ok=retarget?.accept(data,now)||false;if(ok)capturedAt=data.capturedAt;return ok;},
    stale(){reset();status('關節追蹤中斷；學員回到站姿。');},
    unavailable:dispose,
    update(camera,now=performance.now()){if(!retarget)return;retarget.update(now);const tracked=active&&skeletonFresh(capturedAt,now)&&retarget.diagnostics.tracking==='tracking';if(tracked&&$('ai-skeleton-toggle').checked)skeleton.update(source());else skeleton.clear();$('skeleton-status').textContent=tracked?'學員骨架 · 相機動作映射':'等待清楚的 AI 關節';},
    dispose,
  };
}
