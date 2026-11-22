import { trackWebGPUCompletion } from './gpu-completion.js?v=0.9.25';
import { trackWebGPU } from './gpu-memory-tracker.js?v=0.9.25';
import { normalizeContextWindow } from './ai-context-settings.js?v=0.9.25';
import { loadLocalModel, checkedShardResponse, LOCAL_AI_CONTEXT_WINDOW } from './local-ai-model.js?v=0.9.25';
import { aiErrorDetail, aiErrorCode, cleanAIText } from './ai-diagnostics.js?v=0.9.25';
const gpuCompletion=trackWebGPUCompletion({onEvent:event=>self.postMessage({type:'gpu-completion',event})});
const gpuMemory=trackWebGPU({onEvent:event=>{sendMemory();self.postMessage({type:'gpu-event',event});}});
function sendMemory(){gpuCompletion.flush();self.postMessage({type:'gpu-memory',snapshot:{at:new Date().toISOString(),stage,completion:gpuCompletion.snapshot,buffers:gpuMemory.snapshot,workerHeap:globalThis.performance?.memory?{usedBytes:performance.memory.usedJSHeapSize,totalBytes:performance.memory.totalJSHeapSize}:null}});}
let engine,stage='worker',resource=null;const shardSizes=new Map();
// WebLLM has one engine: serialize generations so an interrupted old turn cannot overlap a new one.
let inferenceQueue=Promise.resolve(),activeInference=null;
const cancelledInference=new Set();
const enter=value=>{stage=value;self.postMessage({type:'stage',stage});};
// Record only failed resource locations/status, never request bodies or URL queries.
if(globalThis.fetch){
 const nativeFetch=globalThis.fetch.bind(globalThis);
 globalThis.fetch=async(input,options)=>{
  let url;try{const u=new URL(typeof input==='string'?input:input.url||input.href);url=u.origin+u.pathname;}catch{url='unavailable';}
  try{
   const response=await nativeFetch(input,options);
   if(!response.ok){resource={url,status:response.status};self.postMessage({type:'resource-error',resource});return response;}
   if(url.endsWith('/tensor-cache.json')){
    const manifest=await response.clone().json();
    for(const shard of manifest.records||[])if(typeof shard.dataPath==='string'&&Number.isSafeInteger(shard.nbytes)&&shard.nbytes>0)shardSizes.set(new URL(shard.dataPath,url).href,shard.nbytes);
   }
   if(/\/params_shard_\d+\.bin$/.test(url))return checkedShardResponse(response,{url,expected:shardSizes.get(url),onResult:result=>{
    self.postMessage({type:'shard-check',result});if(!result.valid){resource={...result};self.postMessage({type:'resource-error',resource});}
   }});
   return response;
  }
  catch(error){resource={url,status:null,error:aiErrorDetail(error)};self.postMessage({type:'resource-error',resource});throw error;}
 };
}
self.onmessage=async({data})=>{
 let redactions=[];
 if(data.type==='memory-snapshot'){sendMemory();return;}
 if(data.type==='cancel-guidance'||data.type==='cancel-reply'){
  if(Number.isInteger(data.id))cancelledInference.add(data.id);
  if(activeInference===data.id)try{engine?.interruptGenerate?.();}catch{/* Already finished */}
  return;
 }
 try{
  if(data.type==='load'){
   resource=null;enter('workerGpu');
   if(!globalThis.navigator?.gpu){self.postMessage({type:'error',stage,code:'WORKER_GPU_UNAVAILABLE',error:aiErrorDetail(new Error('Worker navigator.gpu is unavailable'))});return;}
   let timer,adapter;
   try{adapter=await Promise.race([navigator.gpu.requestAdapter(),new Promise((_,reject)=>{timer=globalThis.setTimeout(()=>reject(Object.assign(new Error('Worker requestAdapter() did not settle within 10000 ms'),{code:'GPU_CHECK_TIMEOUT'})),10000);})]);}
   finally{globalThis.clearTimeout(timer);}
   if(!adapter){self.postMessage({type:'error',stage,code:'WORKER_GPU_ADAPTER_NULL',error:aiErrorDetail(new Error('Worker requestAdapter() returned null'))});return;}
   enter('sdk');
   const sdk=await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm');
   const contextWindow=normalizeContextWindow(data.contextWindow);
   const modelId=`Qwen2.5-0.5B-Instruct-${adapter.features.has('shader-f16')?'q4f16_1':'q4f32_1'}-MLC`;
   self.postMessage({type:'model-info',modelId,cacheBackend:'indexeddb',contextWindow});enter('model');
   sendMemory();engine=await loadLocalModel(sdk,{modelId,contextWindow,reset:Boolean(data.reset),progress:report=>self.postMessage({type:'progress',progress:report.progress,detail:cleanAIText(report.text||'')}),recovery:info=>{
    resource=null;enter('repair');self.postMessage({type:'recovery',info:{...info,reason:cleanAIText(info.reason)}});
   }});
   sendMemory();self.postMessage({type:'ready'});
  }else if(data.type==='ask'&&engine){
   resource=null;redactions=(data.messages||[]).flatMap(m=>[m.content,String(m.content||'').split('使用者問題：')[1]]).filter(Boolean);enter('inference');
   const run=async()=>{
    if(cancelledInference.delete(data.id)){self.postMessage({type:'inference-done',id:data.id});return;}
    activeInference=data.id;let finished=false;sendMemory();
    try{
     const result=await engine.chat.completions.create({messages:data.messages,max_tokens:data.kind==='guidance'?64:160,temperature:.3,stream:false});
     sendMemory();self.postMessage({type:'inference-done',id:data.id});finished=true;if(!cancelledInference.has(data.id))self.postMessage({type:'reply',id:data.id,text:result.choices[0]?.message?.content||'',usage:result.usage?{promptTokens:result.usage.prompt_tokens??null,completionTokens:result.usage.completion_tokens??null,totalTokens:result.usage.total_tokens??null}:null});
    }catch(error){
     if(!cancelledInference.has(data.id))throw error;
    }finally{if(!finished)self.postMessage({type:'inference-done',id:data.id});activeInference=null;cancelledInference.delete(data.id);}
   };
   const next=inferenceQueue.then(run);
   inferenceQueue=next.catch(()=>{});
   await next;
  }
 }catch(error){self.postMessage({type:'error',...(data.type==='ask'?{id:data.id}:{}),stage,code:aiErrorCode(error,stage,resource),error:aiErrorDetail(error,redactions),resource});}
 finally{redactions=[];}
};
