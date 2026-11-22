// Application workload proxies, never device/core hardware utilization.
export const FACTORS=[.25,.5,.75,1];
const factor=v=>FACTORS.includes(Number(v))?Number(v):1;
const lane=()=>({scale:1,bad:0,good:0,changed:-Infinity,pressure:-Infinity,reason:'initial'});
export class DualWorkload {
 constructor({now=()=>performance.now(),onChange=()=>{}}={}){Object.assign(this,{now,onChange});this.cpu=lane();this.gpu=lane();this.auto=true;this.limits={cpu:1,gpu:1};this.hidden=false;this.last=now();this.cpuMs=0;this.gpuLatency=null;this.lastGPU=null;this.history=[];this.windows=0;}
 configure({auto=this.auto,cpuFactor=this.limits.cpu,gpuFactor=this.limits.gpu}={}){this.auto=Boolean(auto);this.limits={cpu:factor(cpuFactor),gpu:factor(gpuFactor)};if(!this.auto){this.cpu=lane();this.gpu=lane();}this.resetWindow();this.onChange(this.diagnostics);}
 resetWindow(){this.last=this.now();this.cpuMs=0;this.gpuLatency=null;}
 setHidden(value){this.hidden=Boolean(value);this.resetWindow();for(const l of [this.cpu,this.gpu])l.bad=l.good=0;}
 recordCPU(ms){if(!this.hidden&&Number.isFinite(ms)&&ms>=0)this.cpuMs+=ms;}
 recordGPU({submittedMs,completedMs}){if(this.hidden||!Number.isFinite(submittedMs)||!Number.isFinite(completedMs)||completedMs<submittedMs)return;this.gpuLatency=Math.max(this.gpuLatency||0,completedMs-submittedMs);this.lastGPU=this.now();}
 pressure(kind,reason){if(!this.auto||this.hidden)return;const l=this[kind];l.pressure=this.now();l.good=0;l.bad=3;this.adjust(kind,true,reason);}
 adjust(kind,busy,reason){const l=this[kind],now=this.now();if(!this.auto)return;if(busy){l.good=0;if(now-l.pressure>5000)l.bad=0;l.pressure=now;l.bad++;if(l.bad>=3&&now-l.changed>=5000)this.change(kind,Math.max(.25,l.scale-.25),reason);}else{l.good++;l.bad=0;if(l.good>=10&&now-l.pressure>=30000&&now-l.changed>=30000)this.change(kind,Math.min(1,l.scale+.25),'recovered');}}
 change(kind,scale,reason){const l=this[kind];if(l.scale===scale)return;Object.assign(l,{scale,reason,changed:this.now(),bad:0,good:0});this.history.push({atMs:this.now(),kind,scale,reason});this.history=this.history.slice(-32);this.onChange(this.diagnostics);}
 sample({loopDelayMs=0,renderRatio=null,renderBudgetMs=33,completion={},memoryRatio=null}={}){
  const now=this.now(),elapsed=now-this.last;if(this.hidden||elapsed<500)return false;
  if(elapsed>5000){this.resetWindow();return false;} // Background/suspension is not a healthy sample.
  const cpuRatio=this.cpuMs/elapsed,latency=this.gpuLatency,gpuKnown=completion.supported===true||this.lastGPU!==null&&now-this.lastGPU<5000;
  const pending=gpuKnown&&(completion.oldestPendingMs||0)>Math.max(250,renderBudgetMs*3);
  const gpuBusy=(latency!==null&&latency>Math.max(100,renderBudgetMs*2))||pending;
  const cpuBusy=cpuRatio>.7||loopDelayMs>150||Number.isFinite(memoryRatio)&&memoryRatio>.85;
  // Presentation delay is diagnostic only: it cannot identify which resource is busy.
  this.lastSample={atMs:now,elapsedMs:elapsed,cpuTaskRatio:cpuRatio,loopDelayMs,renderRatio,memoryRatio,gpuLatencyMs:latency,gpuKnown,gpuPending:completion.pending??null,oldestPendingMs:completion.oldestPendingMs??null};this.windows++;
  this.adjust('cpu',cpuBusy,cpuRatio>.7?'cpu-task-time':memoryRatio>.85?'js-heap-pressure':'event-loop-delay');
  // Missing completion evidence is unknown; do not infer a healthy GPU from it.
  if(gpuBusy||gpuKnown&&completion.pending===0&&this.lastGPU!==null&&now-this.lastGPU<5000)this.adjust('gpu',gpuBusy,pending?'gpu-pending':'gpu-completion-delay');
  this.resetWindow();return true;
 }
 get cpuFactor(){return Math.min(this.limits.cpu,this.cpu.scale);}
 get gpuFactor(){return Math.min(this.limits.gpu,this.gpu.scale);}
 get caps(){const cpu=this.cpuFactor,gpu=this.gpuFactor;return {cpuFactor:cpu,gpuFactor:gpu,render:60,camera:60,analysis:15,maxSide:cpu<=.25?256:cpu<=.75?384:512,hintMs:250/cpu,optionalLLM:cpu>=.5&&gpu>=.5,cooldownScale:1/gpu,pixelScale:Math.sqrt(gpu)};}
 get diagnostics(){return {enabled:this.auto,cpuFactor:this.cpuFactor,gpuFactor:this.gpuFactor,limits:{...this.limits},cpu:{...this.cpu},gpu:{...this.gpu},caps:this.caps,windows:this.windows,lastSample:this.lastSample||null,history:this.history.map(e=>({...e})),measurement:'CPU task elapsed sums, event-loop delay, JS heap ratio and GPU completion notification proxies; not hardware utilization, physical RAM or thermal measurement.'};}
}
