// Completion-observation intervals include queueing and host notification delay.
export function trackWebGLCompletion(gl,{now=()=>performance.now(),onComplete=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,intervalMs=8,timeoutMs=10000,limit=4}={}){
 const supported=Boolean(gl?.fenceSync&&gl?.clientWaitSync&&gl?.deleteSync&&gl?.flush);let pending=[],timer=null,stopped=false,submitted=0,completed=0,skipped=0,failed=0,aborted=0,lastError=null,generation=0;
 const remove=p=>{try{gl.deleteSync(p.sync);}catch{/* Context may be lost. */}};
 const schedule=()=>{if(timer==null&&pending.length&&!stopped){const token=generation;timer=setTimer(()=>{if(token===generation)poll();},intervalMs);}};
 function poll(){timer=null;if(stopped)return;const current=pending;pending=[];for(const p of current){try{const end=now();if(gl.isContextLost?.()){failed++;lastError='context-lost';remove(p);continue;}const state=gl.clientWaitSync(p.sync,0,0);if(state===gl.ALREADY_SIGNALED||state===gl.CONDITION_SATISFIED){completed++;remove(p);try{onComplete({startMs:p.start,submittedMs:p.submitted,completedMs:end,source:'webgl-fence'});}catch{/* Optional telemetry. */}}else if(state===gl.WAIT_FAILED){failed++;lastError='wait-failed';remove(p);}else if(end-p.submitted>=timeoutMs){failed++;lastError='completion-timeout';remove(p);}else pending.push(p);}catch{failed++;lastError='query-error';remove(p);}}schedule();}
 const cancel=()=>{generation++;if(timer!=null)clearTimer(timer);timer=null;aborted+=pending.length;for(const p of pending)remove(p);pending=[];};
 return {capture(start,submitTime=now()){
  if(!supported||stopped)return false;if(pending.length>=limit){skipped++;return false;}let sync;
  try{sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync){failed++;lastError='fence-unavailable';return false;}gl.flush();pending.push({sync,start,submitted:submitTime});submitted++;schedule();return true;}catch{if(sync)remove({sync});failed++;lastError='submit-error';return false;}
 },suspend:cancel,stop(){cancel();stopped=true;},poll,
 get diagnostics(){return {supported,status:!supported?'unsupported':stopped?'stopped':lastError||'observing',submitted,completed,pending:pending.length,skipped,failed,aborted,pollIntervalMs:intervalMs,timeoutMs,limit,source:'webgl-fence',scope:'First observation of completion, not exact GPU execution time. Zero-timeout checks; no blocking finish.'};}};
}

export function trackWebGPUCompletion({Queue=globalThis.GPUQueue,now=()=>globalThis.performance?.timeOrigin!=null?globalThis.performance.timeOrigin+globalThis.performance.now():Date.now(),onEvent=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=10000,batchMs=250,maxQueues=4}={}){
 const states=new Set(),byQueue=new WeakMap();let disposed=false,supported=false,submitted=0,completed=0,failed=0,skipped=0,lastError=null,batch=[],flushTimer=null,mergedGaps=0;const patches=[],hooks={};
 const notify=e=>{try{onEvent(e);}catch{/* Observation cannot change SDK behavior. */}};
 const snapshot=()=>({supported,hooks:{...hooks},status:!supported?'unsupported':disposed?'stopped':lastError||'observing',submitted,completed,failed,skipped,pending:[...states].filter(s=>s.pending).length,queues:states.size,limit:maxQueues,mergedGaps,timeoutMs,source:'webgpu-queue',scope:'Queue checkpoints cover prior submissions; batching may overlap. Notification latency is not pure GPU time.'});
 const flush=()=>{if(flushTimer!=null)clearTimer(flushTimer);flushTimer=null;if(batch.length){const samples=batch;batch=[];notify({type:'completed',clock:'epoch-ms',samples,status:snapshot()});}};
 function append(sample){const prior=batch.at(-1);if(prior&&prior.completedMs>=sample.startMs&&sample.completedMs>=prior.startMs){prior.startMs=Math.min(prior.startMs,sample.startMs);prior.submittedMs=Math.max(prior.submittedMs,sample.submittedMs);prior.completedMs=Math.max(prior.completedMs,sample.completedMs);}else batch.push(sample);if(batch.length>64){const a=batch.shift(),b=batch[0];b.startMs=Math.min(a.startMs,b.startMs);b.completedMs=Math.max(a.completedMs,b.completedMs);b.submittedMs=Math.max(a.submittedMs,b.submittedMs);mergedGaps++;}if(flushTimer==null)flushTimer=setTimer(flush,batchMs);}
 function checkpoint(state,start,submittedAt){
  if(disposed||state.disabled)return;const p={start,submitted:submittedAt};state.pending=p;
  const fail=code=>{if(disposed||state.pending!==p)return;clearTimer(p.timer);state.pending=null;state.dirty=null;state.queue=null;states.delete(state);state.disabled=true;failed++;lastError=code;notify({type:'status',status:snapshot()});};
  p.timer=setTimer(()=>fail('completion-timeout'),timeoutMs);
  try{Promise.resolve(state.queue.onSubmittedWorkDone()).then(()=>{
   if(disposed||state.pending!==p)return;clearTimer(p.timer);state.pending=null;const end=now();completed++;if(end>=p.submitted&&p.submitted>=p.start)append({startMs:p.start,submittedMs:p.submitted,completedMs:end,source:'webgpu-queue'});else{failed++;lastError='invalid-clock';}
   const dirty=state.dirty;state.dirty=null;if(dirty)checkpoint(state,dirty.start,dirty.submitted);else{state.queue=null;states.delete(state);}
  },()=>fail('completion-rejected'));}catch{fail('completion-error');}
 }
 const proto=Queue?.prototype;
 if(proto&&typeof proto.onSubmittedWorkDone==='function')for(const name of ['submit','writeBuffer','writeTexture','copyExternalImageToTexture']){
  if(typeof proto[name]!=='function')continue;hooks[name]=false;
  const original=proto[name],wrapper=function(...args){const start=now(),result=Reflect.apply(original,this,args);if(disposed)return result;const at=now();submitted++;let state=byQueue.get(this);if(!state){state={queue:null,pending:null,dirty:null,disabled:false};byQueue.set(this,state);}if(state.disabled){skipped++;return result;}if(state.pending){state.dirty||={start,submitted:at};state.dirty.submitted=at;}else{if(states.size>=maxQueues){skipped++;return result;}state.queue=this;states.add(state);checkpoint(state,start,at);}return result;};
  try{proto[name]=wrapper;if(proto[name]===wrapper){hooks[name]=true;supported=true;patches.push({name,original,wrapper});}}catch{lastError='hook-unavailable';}
 }

 return {flush,get snapshot(){return snapshot();},dispose(){if(disposed)return;disposed=true;if(flushTimer!=null)clearTimer(flushTimer);flushTimer=null;batch=[];for(const s of states){if(s.pending)clearTimer(s.pending.timer);s.pending=null;s.dirty=null;s.queue=null;}states.clear();for(const p of patches)try{if(Queue.prototype[p.name]===p.wrapper)Queue.prototype[p.name]=p.original;}catch{/* Readonly prototype. */}}};
}
