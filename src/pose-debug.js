import { aiSkeleton, skeletonFresh } from './skeleton.js?v=0.9.40';

// Raw image observations, independent of full-body lesson validation/retarget.
// CSS mirrors both the video and canvas once; draw in original image coordinates.
export function drawPoseDebug(ctx,{width,height},data,now){
  ctx?.clearRect(0,0,width,height);
  if(!ctx||!width||!height||!skeletonFresh(data?.capturedAt,now))return {edges:0,joints:0};
  const pose=aiSkeleton(data.landmarks,{brightness:data.brightness});
  const points=pose.points.map(p=>p?[(.5-p[0])*width,(.5-p[1])*height]:null);
  const used=new Set(pose.edges.flat());
  // Also display isolated confident observations (e.g. nose or one shoulder).
  for(let i=0;i<points.length;i++)if(points[i]&&i!==33)used.add(i);
  const line=Math.max(4,Math.min(width,height)/90),radius=line*.85;
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const [a,b] of pose.edges){
    ctx.beginPath();ctx.moveTo(...points[a]);ctx.lineTo(...points[b]);
    ctx.strokeStyle='#153f38';ctx.lineWidth=line+3;ctx.stroke();
    ctx.strokeStyle='#77f0c6';ctx.lineWidth=line;ctx.stroke();
  }
  for(const i of used){ctx.beginPath();ctx.arc(...points[i],radius,0,Math.PI*2);ctx.fillStyle='#fff3b0';ctx.fill();ctx.strokeStyle='#153f38';ctx.lineWidth=Math.max(2,line*.35);ctx.stroke();}
  return {edges:pose.edges.length,joints:used.size};
}

export function createPoseDebugOverlay({canvas,enabled,now=()=>performance.now()}){
  const ctx=canvas.getContext('2d');let latest=null;
  const clear=()=>{latest=null;ctx?.clearRect(0,0,canvas.width,canvas.height);};
  return {
    update(data,time=now()){latest=data;return this.refresh(time);},
    refresh(time=now()){if(!enabled()){ctx?.clearRect(0,0,canvas.width,canvas.height);return {edges:0,joints:0};}return drawPoseDebug(ctx,canvas,latest,time);},
    clear,
  };
}
