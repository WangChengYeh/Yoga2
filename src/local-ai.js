import { DEFAULT_CONTEXT_WINDOW, normalizeContextWindow } from './ai-context-settings.js?v=0.9.18';
import { sensorText, sensorContext } from './coach-context.js?v=0.9.18';
import { guidanceMessages } from './ai-guidance.js?v=0.9.18';
import { aiEnvironment, aiErrorDetail, aiErrorCode, aiFailureMessage, AI_STAGE_NAMES } from './ai-diagnostics.js?v=0.9.18';
import { courseFrame } from './course.js?v=0.9.18';
import { GUIDANCE_TIPS } from './guidance.js?v=0.9.18';

export function localAIMessages(text,state,history=[],context=null,contextWindow=DEFAULT_CONTEXT_WINDOW) {
  const frame=courseFrame(state.time);
  return [
    {role:'system',content:'你是瑜伽教練 Luna。用繁體中文，兩句內自然對話，像面對面陪練；先回應對方，再視需要問一個簡短問題。未開始時先聊天或確認準備，不催促、不自行開始；不要每次重複介紹自己。只提供溫和動作提示；不診斷、不承諾姿勢正確；依提供的相機判斷與真人、教練骨架回答；只有 fresh=true 才能描述當下真人觀察。資料缺失、過期、多人或關節不明時坦白說明，不猜測；stable.valid 不成立時不可宣稱動作已確認。骨架是有限量測，非影像；真人與教練座標不同，不能直接比較數值。使用者不舒服時請停止動作。不輸出程式、指令或工具呼叫。'},
    ...history.slice(contextWindow===16384?-12:-2).filter(m=>['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:String(m.content).slice(0,contextWindow===16384?512:96)})),
    {role:'user',content:`狀態：${frame.complete?'已完成':state.playing?'帶練中':state.time===0?'尚未開始':'暫停中'}。目前課程：${frame.lesson.name}；階段：${frame.complete?'已完成':frame.label}；要領：${GUIDANCE_TIPS[frame.lesson.id]}。速度：${state.speed||1}；進度秒：${Number(state.time)||0}。\n${sensorText(context)}\n使用者問題：${String(text).slice(0,300)}`},
  ];
}

// No worker, library, weights, GPU request or storage access before enable().
// Terminating the dedicated worker cancels downloads/inference and releases its GPU resources.
export class LocalCoachAI {
  constructor({gpu=globalThis.navigator?.gpu,createWorker=()=>{if(typeof Worker!=='function')throw Object.assign(new Error('Worker API is unavailable'),{code:'WORKER_UNAVAILABLE'});return new Worker(new URL('./local-ai-worker.js?v=0.9.18',import.meta.url),{type:'module'});},onState=()=>{},setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id)}={}) {
    Object.assign(this,{gpu,createWorker,onState,setTimer,clearTimer});
    this.diagnostics={environment:aiEnvironment(),stage:'idle',events:[],context:{selected:DEFAULT_CONTEXT_WINDOW,loading:null,active:null,status:'off'}};this.phase='off';this.generation=0;this.serial=0;this.pending=null;this.worker=null;this.history=[];this.contextWindow=DEFAULT_CONTEXT_WINDOW;
  }
  selectContextWindow(value){this.contextWindow=normalizeContextWindow(value);this.diagnostics.context.selected=this.contextWindow;}
  get ready(){return this.phase==='ready';}
  get enabled(){return this.phase!=='off'&&this.phase!=='error';}
  emit(phase,message){this.phase=phase;this.onState({phase,message});}
  clearPending(){if(this.timer)this.clearTimer(this.timer);this.timer=null;}
  disable(message='AI 對話已關閉；基本指令仍可使用。'){
    ++this.generation;this.history=[];this.cancelGPU?.();this.cancelGPU=null;this.clearPending();this.pending?.resolve(null);this.pending=null;
    if(this.worker){this.worker.onmessage=this.worker.onerror=this.worker.onmessageerror=null;this.worker.terminate();this.worker=null;}
    if(this.diagnostics.context)this.diagnostics.context={...this.diagnostics.context,loading:null,active:null,status:'off'};
    this.emit('off',message);
  }
  record(stage,extra={}){this.diagnostics.stage=stage;Object.assign(this.diagnostics,extra);this.diagnostics.events.push({stage,at:new Date().toISOString()});this.diagnostics.events=this.diagnostics.events.slice(-16);}
  fail(code,error,stage=this.diagnostics.stage){
    const failure={code,stage,error:aiErrorDetail(error),resource:this.diagnostics.failedResource||null};
    this.diagnostics.failure=failure;this.record(stage);this.disable();this.diagnostics.context.status='error';this.emit('error',aiFailureMessage(failure));
  }
  async checkAdapter(){
    let timer,cancel;
    const checked=new Promise((resolve,reject)=>{
      cancel=()=>resolve(null);this.cancelGPU=cancel;
      timer=this.setTimer(()=>reject(Object.assign(new Error('WebGPU requestAdapter() did not settle within 10000 ms'),{code:'GPU_CHECK_TIMEOUT'})),10000);
      try{Promise.resolve(this.gpu.requestAdapter()).then(resolve,reject);}catch(error){reject(error);}
    });
    try{return await checked;}finally{this.clearTimer(timer);if(this.cancelGPU===cancel)this.cancelGPU=null;}
  }
  async enable({reset=false,contextWindow=this.contextWindow}={}){
    this.disable();this.contextWindow=normalizeContextWindow(contextWindow);const generation=this.generation;
    this.diagnostics={environment:aiEnvironment(),stage:'environment',events:[],context:{selected:this.contextWindow,loading:this.contextWindow,active:null,status:'loading'}};this.record('environment');
    if(!this.gpu){this.fail(globalThis.isSecureContext===false?'INSECURE_CONTEXT':'WEBGPU_UNAVAILABLE',new Error('navigator.gpu is unavailable'),'environment');return;}
    this.emit('loading','正在檢查 WebGPU（最多 10 秒，尚未下載模型）。');
    this.timer=this.setTimer(()=>{if(generation===this.generation)this.fail('LOAD_TIMEOUT',new Error('Initialization exceeded 180000 ms'));},180000);
    try{
      this.record('adapter');
      const adapter=await this.checkAdapter();
      if(generation!==this.generation)return;
      if(!adapter){this.fail('GPU_ADAPTER_NULL',new Error('navigator.gpu.requestAdapter() returned null'),'adapter');return;}
      this.diagnostics.gpu={features:Array.from(adapter.features||[]),limits:{maxBufferSize:adapter.limits?.maxBufferSize??null,maxStorageBufferBindingSize:adapter.limits?.maxStorageBufferBindingSize??null}};
      this.record('worker');this.emit('loading','GPU 檢查通過，正在啟動 AI 背景執行緒。');
      const worker=this.createWorker();this.worker=worker;
      const current=()=>generation===this.generation&&this.worker===worker;
      worker.onerror=event=>{if(current())this.fail('WORKER_RUNTIME_ERROR',{name:event?.error?.name||'WorkerError',message:event?.message||event?.error?.message||'瀏覽器未提供背景執行緒錯誤細節。',filename:event?.filename,lineno:event?.lineno,colno:event?.colno});};
      worker.onmessageerror=()=>{if(current())this.fail('WORKER_MESSAGE_ERROR',new Error('Worker message could not be decoded'));};
      worker.onmessage=({data})=>{
        if(!current())return;
        if(data.type==='stage'){this.record(data.stage);if(this.phase==='loading')this.emit('loading',`正在${AI_STAGE_NAMES[data.stage]||data.stage}…`);}
        if(data.type==='model-info')this.diagnostics.model={id:data.modelId,cacheBackend:data.cacheBackend,contextWindow:data.contextWindow};
        if(data.type==='shard-check'){this.diagnostics.shardsChecked=(this.diagnostics.shardsChecked||0)+1;this.diagnostics.lastShard=data.result;}
        if(data.type==='recovery'){this.diagnostics.recovery=data.info;this.diagnostics.failedResource=null;}
        if(data.type==='resource-error')this.diagnostics.failedResource=data.resource;
        if(data.type==='progress'&&data.detail)this.diagnostics.lastProgress=data.detail;
        if(data.type==='progress'&&this.phase==='loading')this.emit('loading',`正在下載／載入本機 AI：${Math.round(Math.max(0,Math.min(1,Number(data.progress)||0))*100)}%`);
        if(data.type==='ready'){this.diagnostics.context={selected:this.contextWindow,loading:null,active:this.diagnostics.model?.contextWindow||null,status:'ready'};this.record('ready');this.clearPending();this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');}
        if(data.type==='error'){if(data.id&&data.id!==this.pending?.id)return;if(data.resource)this.diagnostics.failedResource=data.resource;this.fail(data.code||aiErrorCode(data.error,data.stage),data.error,data.stage||this.diagnostics.stage);return;}
        if(data.type==='reply'&&this.pending?.id===data.id){
          const pending=this.pending;this.pending=null;this.clearPending();
          const text=String(data.text||'').trim().slice(0,240);
          this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');pending.resolve(text||null);
        }
      };
      worker.postMessage({type:'load',half:adapter.features.has('shader-f16'),contextWindow:this.contextWindow,...(reset?{reset:true}:{})});
    }catch(error){if(generation===this.generation)this.fail(aiErrorCode(error,this.diagnostics.stage),error);}
  }
  cancelReply(){
    if(this.pending?.kind!=='reply')return;
    const pending=this.pending;this.pending=null;this.clearPending();pending.resolve(null);
    try{this.worker?.postMessage({type:'cancel-reply',id:pending.id});}catch{/* stale worker */}
    this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');
  }
  cancelGuidance(){
    if(this.pending?.kind!=='guidance')return;
    const pending=this.pending;this.pending=null;this.clearPending();pending.resolve(null);
    try{this.worker?.postMessage({type:'cancel-guidance',id:pending.id});}catch{/* stale worker */}
    this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');
  }
  greet(state,context=null){
    this.cancelGuidance();
    return this.request(localAIMessages('請主動向剛進來的使用者打招呼：簡短自我介紹是 Luna，問想先聊聊還是伸展，等待回答，不要指示開始動作。',state,[],context,this.contextWindow),'reply',context);
  }
  ask(text,state,context=null){
    this.cancelGuidance();const generation=this.generation;
    return this.request(localAIMessages(text,state,this.history,context,this.contextWindow),'reply',context).then(reply=>{
      if(reply&&generation===this.generation)this.history=this.history.concat([{role:'user',content:String(text).slice(0,300)},{role:'assistant',content:reply.slice(0,512)}]).slice(-12);
      return reply;
    });
  }
  guide(cue,state,context=null){return this.request(guidanceMessages(cue,state,context),'guidance',context);}
  request(messages,kind,context=null){
    if(!this.ready||this.pending)return Promise.resolve(null);
    this.diagnostics.sensors=sensorContext(context);
    const id=++this.serial;this.diagnostics.sensorsRequest={id,kind,at:new Date().toISOString()};this.record('inference');this.diagnostics.failedResource=null;
    this.emit('thinking',kind==='guidance'?'AI 正在準備帶練口令。':'AI 正在想，基本控制仍可使用。');
    return new Promise(resolve=>{
      this.pending={id,resolve,kind};
      this.timer=this.setTimer(()=>this.fail('INFERENCE_TIMEOUT',new Error('Generation exceeded 45000 ms')),45000);
      try{this.worker.postMessage({type:'ask',id,kind,messages});}catch(error){this.fail('WORKER_MESSAGE_ERROR',error);}
    });
  }
}
