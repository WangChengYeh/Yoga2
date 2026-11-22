export const RENDER_FPS=[10,15,20,24,30,60],RESPONSE_SECONDS=[3,5,8,10,15,30];
export function performancePreferences(getStorage=()=>window.localStorage){
 let storage,value={renderFPS:30,responseSeconds:8,auto:true};
 const normalize=v=>({renderFPS:RENDER_FPS.includes(Number(v.renderFPS))?Number(v.renderFPS):30,responseSeconds:RESPONSE_SECONDS.includes(Number(v.responseSeconds))?Number(v.responseSeconds):8,auto:v.auto!==false});
 try{storage=getStorage();value=normalize(JSON.parse(storage.getItem('yoga2.workload.v1')||'{}'));}catch{/* Optional storage. */}
 return {get value(){return {...value};},set(patch){value=normalize({...value,...patch});try{storage?.setItem('yoga2.workload.v1',JSON.stringify(value));}catch{/* Session settings still work. */}return this.value;}};
}
// Duration/queue/presentation proxies; browsers do not expose hardware GPU utilization.
export class AdaptiveWorkload {
 constructor({now=()=>performance.now(),onChange=()=>{}}={}){Object.assign(this,{now,onChange});this.level=0;this.enabled=true;this.bad=0;this.good=0;this.changed=-Infinity;this.lastPressure=-Infinity;this.reason='initial';this.samples=0;}
 get caps(){return [{render:60,camera:60,analysis:15,maxSide:512},{render:20,camera:15,analysis:2,maxSide:384},{render:15,camera:10,analysis:1,maxSide:256}][this.level];}
 setEnabled(enabled){this.enabled=Boolean(enabled);if(!this.enabled)this.change(0,'automatic-disabled');this.bad=this.good=0;}
 change(level,reason){if(level===this.level)return;this.level=level;this.reason=reason;this.changed=this.now();this.bad=this.good=0;this.onChange(this.diagnostics);}
 observe({durationMs=0,waitMs=0,renderRatio=0,deadline=false}={}){
  this.lastObservation={atMs:this.now(),durationMs,waitMs,renderRatio,deadline:Boolean(deadline)};if(durationMs||waitMs)this.lastVision={...this.lastObservation};if(renderRatio)this.lastRender={...this.lastObservation};if(!this.enabled)return;this.samples++;const t=this.now(),busy=deadline||durationMs>1000||waitMs>1500||renderRatio>1.8;
  if(busy){if(t-this.lastPressure>10000)this.bad=0;this.lastPressure=t;this.bad++;this.good=0;if((deadline||this.bad>=3)&&t-this.changed>=10000)this.change(Math.min(2,this.level+1),deadline?'llm-deadline':durationMs>1000?'vision-duration':waitMs>1500?'queue-wait':'render-delay');}
  else {this.good++;if(this.good>=5&&t-this.lastPressure>=30000&&t-this.changed>=30000)this.change(Math.max(0,this.level-1),'recovered');}
 }
 get diagnostics(){return {enabled:this.enabled,level:this.level,reason:this.reason,caps:{...this.caps},samples:this.samples,lastVision:this.lastVision||null,lastRender:this.lastRender||null,lastObservation:this.lastObservation||null,pressureSamples:this.bad,healthySamples:this.good,measurement:'Task durations and presentation delays; not GPU utilization or physical RAM.'};}
}
