import { courseFrame } from './course.js?v=0.9.0';
import { GUIDANCE_TIPS } from './guidance.js?v=0.9.0';

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
  constructor({gpu=globalThis.navigator?.gpu,createWorker=()=>new Worker(new URL('./local-ai-worker.js?v=0.9.0',import.meta.url),{type:'module'}),onState=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}) {
    Object.assign(this,{gpu,createWorker,onState,setTimer,clearTimer});
    this.phase='off';this.generation=0;this.serial=0;this.pending=null;this.worker=null;
  }
  get ready(){return this.phase==='ready';}
  get enabled(){return this.phase!=='off'&&this.phase!=='error';}
  emit(phase,message){this.phase=phase;this.onState({phase,message});}
  clearPending(){if(this.timer)this.clearTimer(this.timer);this.timer=null;}
  disable(message='AI 對話已關閉；基本指令仍可使用。'){
    ++this.generation;this.clearPending();this.pending?.resolve(null);this.pending=null;
    if(this.worker){this.worker.onmessage=this.worker.onerror=null;this.worker.terminate();this.worker=null;}
    this.emit('off',message);
  }
  fail(message){this.disable();this.emit('error',message);}
  async enable(){
    this.disable();const generation=this.generation;
    if(!this.gpu){this.emit('error','此瀏覽器不支援本機 AI（WebGPU）；基本指令仍可使用。');return;}
    this.emit('loading','正在檢查手機 AI 支援；首次需下載約 300–500 MB。');
    try{
      const adapter=await this.gpu.requestAdapter();
      if(generation!==this.generation)return;
      if(!adapter)throw Error('No GPU');
      const worker=this.createWorker();this.worker=worker;
      const current=()=>generation===this.generation&&this.worker===worker;
      worker.onerror=()=>{if(current())this.fail('本機 AI 載入或執行失敗；已關閉，可稍後重試。');};
      worker.onmessage=({data})=>{
        if(!current())return;
        if(data.type==='progress'&&this.phase==='loading')this.emit('loading',`正在下載／載入本機 AI：${Math.round(Math.max(0,Math.min(1,Number(data.progress)||0))*100)}%`);
        if(data.type==='ready'){this.clearPending();this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');}
        if(data.type==='error'){this.fail('本機 AI 暫時無法使用；已釋放模型，可重新開啟。');return;}
        if(data.type==='reply'&&this.pending?.id===data.id){
          const pending=this.pending;this.pending=null;this.clearPending();
          const text=String(data.text||'').trim().slice(0,240);
          this.emit('ready','AI 對話已開啟 · 手機本機 0.5B');pending.resolve(text||null);
        }
      };
      this.timer=this.setTimer(()=>{if(current())this.fail('AI 載入逾時；已關閉，請確認網路後重試。');},180000);
      worker.postMessage({type:'load',half:adapter.features.has('shader-f16')});
    }catch{if(generation===this.generation)this.fail('此手機暫時無法啟動本機 AI；基本指令仍可使用。');}
  }
  ask(text,state){
    if(!this.ready||this.pending)return Promise.resolve(null);
    const id=++this.serial;
    this.emit('thinking','AI 正在想，基本控制仍可使用。');
    return new Promise(resolve=>{
      this.pending={id,resolve};
      this.timer=this.setTimer(()=>this.fail('AI 回覆逾時；已關閉並釋放模型。'),45000);
      try{this.worker.postMessage({type:'ask',id,messages:localAIMessages(text,state)});}catch{this.fail('AI 回覆失敗；已關閉，基本指令仍可使用。');}
    });
  }
}
