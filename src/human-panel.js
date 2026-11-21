import { CutoutSession } from './cutout-core.js?v=0.6.0';
import { createHumanLayer } from './human-scene.js?v=0.6.0';

export function setupHumanPanel({ document, onLayout=()=>{}, createLayer=createHumanLayer }) {
  const $=id=>document.getElementById(id);
  let layer, enabled=false;
  const session=new CutoutSession({
    onFrame:(frame,calibration)=>{
      try {layer?.apply(frame,calibration);}
      catch {session.setReady(false);}
    },
    onClear:()=>layer?.clear(),
    onState:state=>{
      $('human-toggle').disabled=!state.available;
      $('human-toggle').setAttribute('aria-pressed',String(state.enabled));
      $('human-toggle').textContent=state.enabled?'真人離場':'真人入場';
      if($('human-status').textContent!==state.message)$('human-status').textContent=state.message;
      for(const id of ['human-x','human-scale','human-align'])$(id).disabled=!state.enabled;
      if(enabled!==state.enabled){enabled=state.enabled;onLayout(enabled);}
    },
  });
  $('human-toggle').addEventListener('click',()=>session.toggle());
  $('human-align').addEventListener('click',()=>session.recalibrate());
  for(const id of ['human-x','human-scale'])$(id).addEventListener('input',()=>{
    layer?.setPlacement({x:Number($('human-x').value),scale:Number($('human-scale').value)});
    $('human-size').textContent=`${Math.round(Number($('human-scale').value)*100)}%`;
  });
  session.setReady(false);
  return {
    attach(scene){layer?.dispose();layer=createLayer({scene});session.setReady(true);},
    get context(){return session.context;},
    cameraState(active){session.setCamera(active);},
    accept(data,now){session.accept(data,now);},
    stale(){session.stale();},
    unavailable(){session.setReady(false);layer?.dispose();},
    update(camera){layer?.update(camera);},
    dispose(){session.setReady(false);layer?.dispose();},
  };
}
