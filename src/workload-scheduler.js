// Cooperative app-level admission control, not an OS/GPU driver scheduler.
const KINDS=['scene-load','ai-load','ai-inference','ai-guidance','vision-load','vision-frame'];
const abort=(code='WORK_CANCELLED')=>Object.assign(new Error('Scheduled task cancelled'),{name:'AbortError',code});
export class WorkloadScheduler {
 constructor({now=()=>performance.now(),onEvent=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){Object.assign(this,{now,onEvent,setTimer,clearTimer});this.queue=[];this.active=null;this.serial=0;this.hidden=false;this.blocked=null;this.history=[];this.completed=0;this.cancelled=0;this.dropped=0;}
 event(phase,job){const e={atMs:this.now(),phase,kind:job?.kind||'policy',id:job?.id||null,...(job?{queuedAt:job.queuedAt,startedAt:job.startedAt??null}: {})};this.history.push(e);this.history=this.history.slice(-64);try{this.onEvent(e);}catch{/* Telemetry cannot block work. */}}
 acquire(kind,{signal,key=null,ttlMs=Infinity}={}){
  if(!KINDS.includes(kind))return Promise.reject(new TypeError('Unknown workload'));
  if(this.hidden||this.blocked||signal?.aborted)return Promise.reject(abort());
  if(key)for(const old of [...this.queue])if(old.key===key)old.cancel('WORK_REPLACED');
  return new Promise((resolve,reject)=>{const job={id:++this.serial,kind,key,expiresAt:this.now()+Math.max(0,ttlMs),queuedAt:this.now(),resolve,reject,signal};job.cancel=(code)=>{const i=this.queue.indexOf(job);if(i<0)return;this.queue.splice(i,1);signal?.removeEventListener('abort',job.cancel);this.clearTimer(job.timer);this.cancelled++;if(typeof code==='string')this.dropped++;this.event(typeof code==='string'?'drop':'cancel',job);reject(abort(typeof code==='string'?code:undefined));};signal?.addEventListener('abort',job.cancel,{once:true});this.queue.push(job);if(Number.isFinite(ttlMs)){job.timer=this.setTimer(()=>job.cancel('WORK_EXPIRED'),Math.max(0,ttlMs));job.timer?.unref?.();}this.drain();});
 }
 drain(){
  if(this.active||this.hidden||this.blocked||!this.queue.length)return;
  const rank=j=>j.kind==='scene-load'?3:j.kind==='ai-guidance'?0:j.kind.startsWith('ai-')?2:1;
  this.queue.sort((a,b)=>rank(b)-rank(a)||a.id-b.id);const job=this.queue[0];if(job.expiresAt<=this.now()){job.cancel('WORK_EXPIRED');this.drain();return;}this.queue.shift();this.clearTimer(job.timer);job.signal?.removeEventListener('abort',job.cancel);if(job.signal?.aborted){job.reject(abort());this.drain();return;}
  this.active=job;job.startedAt=this.now();this.event('start',job);let done=false;
  job.resolve(()=>{if(done)return;done=true;if(this.active!==job)return;this.completed++;this.event('finish',job);this.active=null;this.drain();});
 }
 async run(kind,fn,options){const release=await this.acquire(kind,options);try{if(options?.signal?.aborted)throw abort();return await fn();}finally{release();}}
 cancelQueue(){for(const j of [...this.queue])j.cancel();}
 setHidden(hidden){this.hidden=Boolean(hidden);if(hidden)this.cancelQueue();this.event(hidden?'background':'foreground');this.drain();}
 block(reason='scene-error'){this.blocked=reason;this.cancelQueue();this.event('blocked');}
 profile(options){if(options)this.displayConfig=options;const {renderFPS=30,renderCap=60,powerSaving=false}=this.displayConfig||{};const ai=[this.active,...this.queue.filter(j=>j.kind!=='ai-guidance')].find(j=>j?.kind.startsWith('ai-'));return {mode:this.blocked?'blocked':this.hidden?'background':ai?.kind==='ai-load'?'ai-loading':ai?'ai-inference':this.active?.kind?.startsWith('vision')?'vision':'practice',renderFPS:this.hidden||this.blocked?0:Math.min(renderFPS,renderCap,ai?15:powerSaving?24:60),visionPaused:Boolean(this.hidden||this.blocked||ai)};}
 get diagnostics(){return {scope:'Application tasks serialized; rendering capped separately. Does not preempt native GPU commands or prove lower memory usage.',...this.profile(),active:this.active?{id:this.active.id,kind:this.active.kind,waitMs:this.active.startedAt-this.active.queuedAt,runningMs:this.now()-this.active.startedAt}:null,queued:this.queue.map(j=>({id:j.id,kind:j.kind,waitMs:this.now()-j.queuedAt})),completed:this.completed,cancelled:this.cancelled,dropped:this.dropped,blockedReason:this.blocked,history:this.history.map(e=>({...e}))};}
}
