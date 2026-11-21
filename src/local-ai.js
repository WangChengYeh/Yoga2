import { aiEnvironment, aiErrorDetail, aiErrorCode, aiFailureMessage } from './ai-diagnostics.js?v=0.9.2';
import { courseFrame } from './course.js?v=0.9.2';
import { GUIDANCE_TIPS } from './guidance.js?v=0.9.2';

export function localAIMessages(text,state) {
  const frame=courseFrame(state.time);
  return [
    {role:'system',content:'你是瑜伽教練 Luna。用繁體中文，兩句內簡短回答課程問題。只提供溫和動作提示；不診斷、不承諾姿勢正確、不宣稱看見使用者。你沒有影像或骨架資料。使用者不舒服時請停止動作。不輸出程式、指令或工具呼叫。'},
    {role:'user',content:`目前課程：${frame.lesson.name}；階段：${frame.complete?'已完成':frame.label}；要領：${GUIDANCE_TIPS[frame.lesson.id]}。\n使用者問題：${String(text).slice(0,300)}`},
  ];
}

// No worker, library, weights, GPU request or storage access before opt-in.
// Terminating the dedicated worker cancels downloads/inference and releases its GPU resources.
export class LocalCoachAI {
  constructor({gpu=globalThis.navigator?.gpu,createWorker=()=>{if(typeof Worker!=='function')throw Object.assign(new Error('Worker API is unavailable'),{code:'WORKER_UNAVAILABLE'});return new Worker(new URL('./local-ai-worker.js?v=0.9.2',import.meta.url),{type:'module'});},onState=()=>{},setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id)}={}) {
    Object.assign(this,{gpu,createWorker,onState,setTimer,clearTimer});
    this.diagnostics={environment:aiEnvironment(),stage:'idle',events:[]};this.phase='off';this.generation=0;this.serial=0;this.pending=null;this.worker=null;
  }
  get ready(){return this.phase==='ready';}
  get enabled(){return this.phase!=='off'&&this.phase!=='error';}
  emit(phase,message){this.phase=phase;this.onState({phase,message});}
  clearPending(){if(this.timer)this.clearTimer(this.timer);this.timer=null;}
  disable(message='AI 對話已關閉；基本指令仍可使用。'){
    ++this.generation;this.clearPending();this.pending?.resolve(null);this.pending=null;
    if(this.worker){this.worker.onmessage=this.worker.onerror=this.worker.onmessageerror=null;this.worker.terminate();this.worker=null;}
    this.emit('off',message);
  }
  record(stage,extra={}){this.diagnostics.stage=stage;Object.assign(this.diagnostics,extra);this.diagnostics.events.push({stage,at:new Date().toISOString()});this.diagnostics.events=this.diagnostics.events.slice(-16);}
  fail(code,error,stage=this.diagnostics.stage){
    const failure={code,stage,error:aiErrorDetail(error),resource:this.diagnostics.failedResource||null};
    this.diagnostics.failure=failure;this.record(stage);this.disable();this.emit('error',aiFailureMessage(failure));
  }
  async enable(){
    this.disable();const generation=this.generation;
    this.diagnostics={environment:aiEnvironment(),stage:'environment',events:[]};this.record('environment');
    if(!this.gpu){this.fail(globalThis.isSecureContext===false?'INSECURE_CONTEXT':'WEBGPU_UNAVAILABLE',new Error('navigator.gpu is unavailable'),'environment');return;}
    this.emit('loading','正在檢查手機 AI 支援；首次需下載約 300–500 MB。');
    this.timer=this.setTimer(()=>{if(generation===this.generation)this.fail('LOAD_TIMEOUT',new Error('Initialization exceeded 180000 ms'));},180000);
    try{
      this.record('adapter');
      const adapter=await this.gpu.requestAdapter();
      if(generation!==this.generation)return;
      if(!adapter){this.fail('GPU_ADAPTER_NULL',new Error('navigator.gpu.requestAdapter() returned null'),'adapter');return;}
      this.diagnostics.gpu={features:Array.from(adapter.features||[]),limits:{maxBufferSize:adapter.limits?.maxBufferSize??null,maxStorageBufferBindingSize:adapter.limits?.maxStorageBufferBindingSize??null}};
      this.record('worker');
      const worker=this.createWorker();this.worker=worker;
      const current=()=>generation===this.generation&&this.worker===worker;
      worker.onerror=event=>{if(current())this.fail('WORKER_RUNTIME_ERROR',{name:event?.error?.name||'WorkerError',message:event?.message||event?.error?.message||'瀏覽器未提供背景執行緒錯誤細節。',filename:event?.filename,lineno:event?.lineno,colno:event?.colno});};
      worker.onmessageerror=()=>{if(current())this.fail('WORKER_MESSAGE_ERROR',new Error('Worker message could not be decoded'));};
      worker.onmessage=({data})=>{
        if(!current())return;
        if(data.type==='stage')this.record(data.stage);
        if(data.type==='resource-error')this.diagnostics.failedResource=data.resource;
        if(data.type==='progress'&&data.detail)this.diagnostics.lastProgress=data.detail;
        if(data.type==='progress'&&this.phase==='loading')this.emit('loading',`正在下載／載入本機 AI：${Math.round(Math.max(0,Math.min(1,Number(data.progress)||0))*100)}%`);
        if(data.type==='ready'){this.record('ready');this.clearPending();this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');}
        if(data.type==='error'){if(data.resource)this.diagnostics.failedResource=data.resource;this.fail(data.code||aiErrorCode(data.error,data.stage),data.error,data.stage||this.diagnostics.stage);return;}
        if(data.type==='reply'&&this.pending?.id===data.id){
          const pending=this.pending;this.pending=null;this.clearPending();
          const text=String(data.text||'').trim().slice(0,240);
          this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');pending.resolve(text||null);
        }
      };
      worker.postMessage({type:'load',half:adapter.features.has('shader-f16')});
    }catch(error){if(generation===this.generation)this.fail(aiErrorCode(error,this.diagnostics.stage),error);}
  }
  ask(text,state){
    if(!this.ready||this.pending)return Promise.resolve(null);
    const id=++this.serial;this.record('inference');this.diagnostics.failedResource=null;
    this.emit('thinking','AI 正在想，基本控制仍可使用。');
    return new Promise(resolve=>{
      this.pending={id,resolve};
      this.timer=this.setTimer(()=>this.fail('INFERENCE_TIMEOUT',new Error('Generation exceeded 45000 ms')),45000);
      try{this.worker.postMessage({type:'ask',id,messages:localAIMessages(text,state)});}catch(error){this.fail('WORKER_MESSAGE_ERROR',error);}
    });
  }
}
