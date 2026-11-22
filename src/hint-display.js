// 4 Hz display state, independent of rendering, pose inference and speech.
export function setupHintDisplay({document,getHint,getFrame,isPlaying,isCameraActive,now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),onEvent=()=>{}}){
 const box=document.getElementById('stage-hint'),text=document.getElementById('stage-hint-message'),values=document.getElementById('stage-hint-values');
 let timer=null,stopped=false,lastPaint=-Infinity,identity=null,lastMessage='',lastValues='',lastKind='',started=now();
 const counts={updates:0,textUpdates:0,valueUpdates:0,expired:0,lastLatencyMs:null,maxLatencyMs:0,lastCameraLatencyMs:null};
 function refresh(){
  if(!box||document.hidden||stopped)return;
  const hint=getHint(),frame=getFrame(),playing=isPlaying();
  const fallback=frame.complete?'今天的練習完成了，可以休息或再練一次。':!playing?'準備好時按開始／繼續，跟著 Luna 練習。':!isCameraActive()?`${frame.cue} 開啟相機後可觀察你的動作。`:frame.cue;
  const message=hint?.message||fallback,kind=hint?.kind||'info',id=hint?`${hint.context?.scope}:${hint.context?.generation}:${hint.id}:${kind}`:`course:${frame.lesson.id}:${frame.label}:${playing}`;
  if(id===identity&&now()-lastPaint<250)return;
  const numeric=hint?.values,metric=numeric&&Number.isFinite(numeric.measured)?`影像角度 ${Math.round(numeric.measured)}° · 參考 ${Math.round(numeric.target)}°`:'';
  const detail=[metric,hint?.supplement?.message?`AI：${hint.supplement.message}`:''].filter(Boolean).join(' · ');
  if(message!==lastMessage){text.textContent=message;lastMessage=message;counts.textUpdates++;onEvent('hint_displayed',{code:hint?.code||'course',kind});}
  if(detail!==lastValues){values.textContent=detail;values.title=detail;lastValues=detail;counts.valueUpdates++;}
  if(kind!==lastKind){box.dataset.kind=kind;lastKind=kind;}
  if(identity&&identity!==id&&!hint)counts.expired++;
  box.hidden=false;identity=id;lastPaint=now();counts.updates++;
  const latency=hint?Math.max(0,now()-hint.timestamp):null;counts.lastCameraLatencyMs=Number.isFinite(hint?.capturedAt)?Math.max(0,now()-hint.capturedAt):null;counts.lastLatencyMs=latency;if(latency!==null)counts.maxLatencyMs=Math.max(counts.maxLatencyMs,latency);
 }
 function schedule(){if(stopped||document.hidden||timer!==null)return;timer=setTimer(()=>{timer=null;refresh();schedule();},250);timer?.unref?.();}
 function visibility(){clearTimer(timer);timer=null;identity=null;if(document.hidden){if(box)box.hidden=true;}else{refresh();schedule();}}
 document.addEventListener('visibilitychange',visibility);refresh();schedule();
 return {refresh,get diagnostics(){return {...counts,rateHz:counts.updates*1000/Math.max(1,now()-started),cadenceMs:250,queueSize:0};},dispose(){stopped=true;clearTimer(timer);document.removeEventListener?.('visibilitychange',visibility);if(box)box.hidden=true;}};
}
