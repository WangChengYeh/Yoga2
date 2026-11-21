import { aiSkeleton, skeletonFresh, createSkeletonLayer } from './skeleton.js?v=0.7.0';
import { CutoutSession } from './cutout-core.js?v=0.7.0';
import { createHumanLayer } from './human-scene.js?v=0.7.0';

export function setupHumanPanel({ document, onLayout=()=>{}, createLayer=createHumanLayer, createSkeleton=createSkeletonLayer }) {
  const $=id=>document.getElementById(id);
  let layer, enabled=false,userBones,lastSkeleton;
  const skeletonStatus=message=>{if($('skeleton-status').textContent!==message)$('skeleton-status').textContent=message;};
  const clearBones=()=>{userBones?.dispose();userBones=null;lastSkeleton=null;skeletonStatus($('ai-skeleton-toggle').checked?'等待新的 AI 關節畫面':'AI 骨架已隱藏');};
  function renderBones(now){
    if(!$('ai-skeleton-toggle').checked){clearBones();skeletonStatus('AI 骨架已隱藏');return;}
    if(!layer?.mesh||!lastSkeleton||!skeletonFresh(lastSkeleton.capturedAt,now)){
      userBones?.clear();skeletonStatus('等待 AI 辨識可見的身體關節');return;
    }
    userBones ||= createSkeleton({parent:layer.mesh,color:0x087c71,radius:.0035,name:'Yoga2AISkeleton'});
    userBones.update(lastSkeleton.pose);
    const message=lastSkeleton.pose.edges.length?'AI 骨架 · 只顯示清楚的關節':'AI 尚未看清身體關節；去背仍可使用';
    skeletonStatus(message);
  }
  const session=new CutoutSession({
    onFrame:(frame,calibration)=>{
      try {layer?.apply(frame,calibration);}
      catch {session.setReady(false);}
    },
    onClear:()=>{clearBones();layer?.clear();},
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
    get bounds(){return layer?.bounds;},
    setLayout(value){layer?.setLayout(value);},
    cameraState(active){session.setCamera(active);if(active)enterIfReady();},
    accept(data,now){
      if(session.accept(data,now)){
        lastSkeleton={pose:aiSkeleton(data.landmarks,{brightness:data.brightness}),capturedAt:data.capturedAt};renderBones(now);
      }else {clearBones();}
    },
    stale(){clearBones();session.stale();},
    unavailable(){session.setReady(false);layer?.dispose();},
    update(camera,now=performance.now()){layer?.update(camera);if(lastSkeleton&&!skeletonFresh(lastSkeleton.capturedAt,now)){clearBones();skeletonStatus('畫面已過期，AI 骨架暫時隱藏');}},
    dispose(){session.setReady(false);layer?.dispose();},
  };
}
