import { DEFAULT_CONTEXT_WINDOW, normalizeContextWindow } from './ai-context-settings.js?v=0.9.22';
export const LOCAL_AI_CONTEXT_WINDOW=DEFAULT_CONTEXT_WINDOW;
// Only tensor/shard data errors qualify for cache repair; never retry OOM/GPU errors.
export const invalidModelData=error=>/Tensor-cache record range .*exceeds shard size|AI_SHARD_SIZE_MISMATCH/i.test(String(error?.message||error));
export function validateShardBytes(received,expected,url){
 if(received===0||(Number.isSafeInteger(expected)&&received!==expected))throw Object.assign(new Error(`AI_SHARD_SIZE_MISMATCH: ${url}; expected=${expected??'nonzero'}, received=${received}`),{code:'MODEL_SHARD_INVALID'});
}
// Validate as bytes stream through; no second 68 MB buffer just for checking.
export function checkedShardResponse(response,{url,expected,onResult=()=>{}}){
 if(!response.body) {onResult({url,expected:expected??null,received:0,status:response.status,valid:false});validateShardBytes(0,expected,url);}
 let received=0;
 const body=response.body.pipeThrough(new TransformStream({
  transform(chunk,controller){received+=chunk.byteLength;controller.enqueue(chunk);},
  flush(){let valid=true;try{validateShardBytes(received,expected,url);}catch(error){valid=false;throw error;}finally{onResult({url,expected:expected??null,received,status:response.status,valid});}},
 }));
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
export async function loadLocalModel(sdk,{modelId,progress=()=>{},recovery=()=>{},reset=false,contextWindow=LOCAL_AI_CONTEXT_WINDOW}){
 const appConfig={...sdk.prebuiltAppConfig,cacheBackend:'indexeddb'};
 const options={appConfig,initProgressCallback:progress};
 const clear=async()=>{try{await sdk.deleteModelAllInfoInCache(modelId,appConfig);}catch(error){throw Object.assign(new Error(`無法清除此模型快取：${error.message}`),{code:'MODEL_CACHE_ERROR',cause:error});}};
 if(reset){
  recovery({attempt:0,reason:'使用者要求重新下載此模型',cacheBackend:'indexeddb'});
  // SDK scopes deletion to this registered model; no cookies or unrelated storage.
  await clear();
 }
 for(let attempt=0;attempt<2;attempt++){
  const engine=new sdk.MLCEngine(options);
  try{await engine.reload(modelId,{context_window_size:normalizeContextWindow(contextWindow)});return engine;}
  catch(error){
   try{await engine.unload?.();}catch{/* Worker teardown still releases failed GPU allocations. */}
   if(!invalidModelData(error))throw error;
   if(attempt===1)throw Object.assign(new Error(`模型資料重試後仍不完整：${error.message}`),{code:'MODEL_SHARD_INVALID',cause:error});
   recovery({attempt:1,reason:String(error.message).slice(0,400),cacheBackend:'indexeddb'});
   await clear();
  }
 }
}
