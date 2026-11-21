import { aiSkeleton, skeletonFresh, createSkeletonLayer } from './skeleton.js?v=0.9.7';
import { CutoutSession } from './cutout-core.js?v=0.9.7';
import { createHumanLayer } from './human-scene.js?v=0.9.7';

export function setupHumanPanel({ document, onLayout=()=>{}, createLayer=createHumanLayer, createSkeleton=createSkeletonLayer }) {
  const $=id=>document.getElementById(id);
  let layer, enabled=false,userBones,lastSkeleton,reportFrame=null,latestSource=null,frameId=0;
  const skeletonStatus=message=>{if($('skeleton-status').textContent!==message)$('skeleton-status').textContent=message;};
  const clearBones=()=>{userBones?.dispose();userBones=null;lastSkeleton=null;skeletonStatus($('ai-skeleton-toggle').checked?'等待 AI 關節':'AI 骨架已隱藏');};
  function renderBones(now){
    if(!$('ai-skeleton-toggle').checked){clearBones();skeletonStatus('AI 骨架已隱藏');return;}
    if(!layer?.mesh||!lastSkeleton||!skeletonFresh(lastSkeleton.capturedAt,now)){
      userBones?.clear();skeletonStatus('等待 AI 關節');return;
    }
    userBones ||= createSkeleton({parent:layer.mesh,color:0x087c71,radius:.008,worldRadius:true,name:'Yoga2AISkeleton'});
    userBones.update(lastSkeleton.pose);
    const message=lastSkeleton.pose.edges.length?'AI 骨架 · 只顯示清楚的關節':'尚未辨識到清楚的關節';
    skeletonStatus(message);
  }
  const session=new CutoutSession({
    onFrame:(frame,calibration)=>{
      try {layer?.apply(frame,calibration);}
      catch {session.setReady(false);}
    },
    onClear:()=>{reportFrame=null;clearBones();layer?.clear();},
    onState:state=>{
      if($('human-status').textContent!==state.message)$('human-status').textContent=state.message;
      for(const id of ['human-x','human-scale','human-align'])$(id).disabled=!state.enabled;
      if(enabled!==state.enabled){enabled=state.enabled;onLayout(enabled);}
    },
  });
  const enterIfReady=()=>{if(session.ready&&session.cameraActive&&!session.enabled)session.toggle();};
  $('ai-skeleton-toggle').addEventListener('change',()=>{clearBones();skeletonStatus($('ai-skeleton-toggle').checked?'等待下一個 AI 辨識畫面':'AI 骨架已隱藏');});
  $('human-align').addEventListener('click',()=>session.recalibrate());
  for(const id of ['human-x','human-scale'])$(id).addEventListener('input',()=>{
    layer?.setPlacement({x:Number($('human-x').value),scale:Number($('human-scale').value)});
    $('human-size').textContent=`${Math.round(Number($('human-scale').value)*100)}%`;
  });
  session.setReady(false);
  return {
    attach(scene){clearBones();layer?.dispose();layer=createLayer({scene});session.setReady(true);enterIfReady();},
    get context(){return session.context;},
    get snapshot(){return reportFrame||latestSource;},
    get diagnostics(){const m=layer?.mesh;return {calibration:layer?.calibration||null,bounds:layer?.bounds||null,cropMinY:layer?.cropMinY||0,transform:m?{position:m.position.toArray(),scale:m.scale.toArray(),rotation:m.rotation.toArray()}:null};},
    get bounds(){return layer?.bounds;},
    get calibration(){return layer?.calibration;},
    get cropMinY(){return layer?.cropMinY||0;},
    setLayout(value){layer?.setLayout(value);},
    cameraState(active){if(!active){reportFrame=null;latestSource=null;}session.setCamera(active);if(active)enterIfReady();},
    accept(data,now){
      if(session.cameraActive&&data.context?.humanToken===session.context.humanToken&&data.segmentation?.frame)latestSource={id:++frameId,capturedAt:data.capturedAt,completedAt:now,frame:data.segmentation.frame,inScene:false};
      if(session.accept(data,now)){
        reportFrame={...latestSource,inScene:true};
        lastSkeleton={pose:aiSkeleton(data.landmarks,{brightness:data.brightness}),capturedAt:data.capturedAt};renderBones(now);
      }else {clearBones();}
    },
    stale(){reportFrame=null;clearBones();session.stale();},
    unavailable(){session.setReady(false);layer?.dispose();},
    update(camera,now=performance.now()){layer?.update(camera);if(lastSkeleton&&!skeletonFresh(lastSkeleton.capturedAt,now)){clearBones();skeletonStatus('畫面已過期，AI 骨架暫時隱藏');}},
    dispose(){session.setReady(false);layer?.dispose();},
  };
}
