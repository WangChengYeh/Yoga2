import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedShardResponse,loadLocalModel} from '../src/local-ai-model.js';
import {aiErrorCode} from '../src/ai-diagnostics.js';
const modelId='Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const original='Tensor-cache record range [0, 68067328) exceeds shard size 0';
function sdkFixture(errors=[]){
 const instances=[],deletions=[],loads=[];
 class Engine{constructor(options){this.options=options;instances.push(this);}async reload(id,options){loads.push({id,options});const error=errors.shift();if(error)throw error;}async unload(){this.unloaded=true;}}
 return {sdk:{MLCEngine:Engine,prebuiltAppConfig:{model_list:[{model_id:modelId}]},deleteModelAllInfoInCache:async(...args)=>deletions.push(args)},instances,deletions,loads};
}
test('existing Cache API entries are bypassed with official IndexedDB backend',async()=>{
 const h=sdkFixture(),engine=await loadLocalModel(h.sdk,{modelId});
 assert.equal(engine.options.appConfig.cacheBackend,'indexeddb');assert.equal(h.deletions.length,0);assert.equal(h.loads.length,1);assert.equal(h.loads[0].options.context_window_size,1024);
});
test('reported 68 MB record versus empty shard clears only this model and retries once',async()=>{
 const h=sdkFixture([new Error(original)]),repairs=[];const engine=await loadLocalModel(h.sdk,{modelId,recovery:r=>repairs.push(r)});
 assert.equal(h.instances.length,2);assert.equal(h.instances[0].unloaded,true);assert.equal(engine,h.instances[1]);assert.equal(h.deletions.length,1);
 assert.equal(h.deletions[0][0],modelId);assert.equal(h.deletions[0][1].cacheBackend,'indexeddb');assert.equal(repairs[0].attempt,1);assert.match(repairs[0].reason,/68067328/);
});
test('persistent invalid data fails explicitly after one repair without infinite downloads',async()=>{
 const h=sdkFixture([new Error(original),new Error(original)]);await assert.rejects(loadLocalModel(h.sdk,{modelId}),error=>error.code==='MODEL_SHARD_INVALID'&&error.message.includes(original));
 assert.equal(h.loads.length,2);assert.equal(h.deletions.length,1);assert.equal(h.instances.every(e=>e.unloaded),true);assert.equal(aiErrorCode(new Error(original),'model'),'MODEL_SHARD_INVALID');
});
test('GPU memory and network errors are not treated as corruption; explicit reset is model scoped',async()=>{
 for(const error of [new Error('out of memory'),new TypeError('Failed to fetch')]){
  const h=sdkFixture([error]);await assert.rejects(loadLocalModel(h.sdk,{modelId}),e=>e===error);assert.equal(h.loads.length,1);assert.equal(h.deletions.length,0);
 }
 const h=sdkFixture();await loadLocalModel(h.sdk,{modelId,reset:true});assert.equal(h.deletions.length,1);assert.equal(h.deletions[0][0],modelId);
 const bad=sdkFixture([new Error(original)]);bad.sdk.deleteModelAllInfoInCache=async()=>{throw new DOMException('Storage blocked','SecurityError');};await assert.rejects(loadLocalModel(bad.sdk,{modelId}),e=>e.code==='MODEL_CACHE_ERROR');assert.equal(bad.loads.length,1);
});
test('empty and truncated shard streams are rejected before they can be cached as valid',async()=>{
 for(const [bytes,expected] of [[new Uint8Array(0),68067328],[new Uint8Array([1,2]),4]]){
  const results=[],response=checkedShardResponse(new Response(bytes),{url:'https://model.test/params_shard_0.bin',expected,onResult:r=>results.push(r)});
  await assert.rejects(response.arrayBuffer(),e=>e.code==='MODEL_SHARD_INVALID');assert.equal(results[0].received,bytes.length);assert.equal(results[0].valid,false);assert.equal(results[0].expected,expected);
 }
});
test('valid shards stream intact and remain cloneable for SDK caching',async()=>{
 const results=[],bytes=new Uint8Array([1,2,3,4]),response=checkedShardResponse(new Response(bytes),{url:'https://model.test/params_shard_1.bin',expected:4,onResult:r=>results.push(r)});
 const clone=response.clone();assert.deepEqual(new Uint8Array(await clone.arrayBuffer()),bytes);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(results.length,1);assert.equal(results[0].valid,true);
});
test('both context choices reach model reload and unsupported sizes normalize to 4K',async()=>{
 for(const [requested,expected] of [[1024,1024],[4096,4096],[16384,16384],[8192,1024]]){const h=sdkFixture();await loadLocalModel(h.sdk,{modelId,contextWindow:requested});assert.equal(h.loads[0].options.context_window_size,expected);}
});
