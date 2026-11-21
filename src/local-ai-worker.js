import { aiErrorDetail, aiErrorCode, cleanAIText } from './ai-diagnostics.js?v=0.9.3';
let engine,stage='worker',resource=null,redactions=[];
const enter=value=>{stage=value;self.postMessage({type:'stage',stage});};
// Record only failed resource locations/status, never request bodies or URL queries.
if(globalThis.fetch){
 const nativeFetch=globalThis.fetch.bind(globalThis);
 globalThis.fetch=async(input,options)=>{
  let url;try{const u=new URL(typeof input==='string'?input:input.url);url=u.origin+u.pathname;}catch{url='unavailable';}
  try{const response=await nativeFetch(input,options);if(!response.ok){resource={url,status:response.status};self.postMessage({type:'resource-error',resource});}return response;}
  catch(error){resource={url,status:null,error:aiErrorDetail(error)};self.postMessage({type:'resource-error',resource});throw error;}
 };
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='load'){
   resource=null;enter('workerGpu');
   if(!globalThis.navigator?.gpu){self.postMessage({type:'error',stage,code:'WORKER_GPU_UNAVAILABLE',error:aiErrorDetail(new Error('Worker navigator.gpu is unavailable'))});return;}
   let timer,adapter;
   try{adapter=await Promise.race([navigator.gpu.requestAdapter(),new Promise((_,reject)=>{timer=globalThis.setTimeout(()=>reject(Object.assign(new Error('Worker requestAdapter() did not settle within 10000 ms'),{code:'GPU_CHECK_TIMEOUT'})),10000);})]);}
   finally{globalThis.clearTimeout(timer);}
   if(!adapter){self.postMessage({type:'error',stage,code:'WORKER_GPU_ADAPTER_NULL',error:aiErrorDetail(new Error('Worker requestAdapter() returned null'))});return;}
   enter('sdk');
   const {MLCEngine}=await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm');
   engine=new MLCEngine({initProgressCallback:report=>self.postMessage({type:'progress',progress:report.progress,detail:cleanAIText(report.text||'')})});
   enter('model');
   await engine.reload(`Qwen2.5-0.5B-Instruct-${adapter.features.has('shader-f16')?'q4f16_1':'q4f32_1'}-MLC`,{context_window_size:1024});
   self.postMessage({type:'ready'});
  }else if(data.type==='ask'&&engine){
   resource=null;redactions=(data.messages||[]).flatMap(m=>[m.content,String(m.content||'').split('使用者問題：')[1]]).filter(Boolean);enter('inference');
   const result=await engine.chat.completions.create({messages:data.messages,max_tokens:160,temperature:.3,stream:false});
   self.postMessage({type:'reply',id:data.id,text:result.choices[0]?.message?.content||''});
  }
 }catch(error){self.postMessage({type:'error',stage,code:aiErrorCode(error,stage,resource),error:aiErrorDetail(error,redactions),resource});}
 finally{redactions=[];}
};
