import {loadLocalModel,checkedShardResponse} from '../src/local-ai-model.js';
import { aiErrorDetail, aiErrorCode, cleanAIText, aiFailureMessage } from '../src/ai-diagnostics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalCoachAI,localAIMessages} from '../src/local-ai.js';
function harness({supported=true,adapter=true}={}){
  const workers=[],states=[],timers=new Map();let gpuCalls=0;
  const ai=new LocalCoachAI({gpu:supported?{async requestAdapter(){gpuCalls++;return adapter?{features:new Set(['shader-f16'])}:null;}}:null,
    createWorker:()=>{const w={messages:[],postMessage(m){this.messages.push(m);},terminate(){this.terminated=true;}};workers.push(w);return w;},
    onState:s=>states.push(s),setTimer:(fn,ms)=>{timers.set(ms,fn);return ms;},clearTimer:id=>timers.delete(id)});
  return {ai,workers,states,timers,get gpuCalls(){return gpuCalls;},ready(){workers.at(-1).onmessage({data:{type:'ready'}});}};
}
test('AI defaults off and allocates/downloads nothing before explicit enable',()=>{
  const h=harness();assert.equal(h.ai.enabled,false);assert.equal(h.gpuCalls,0);assert.equal(h.workers.length,0);assert.equal(h.timers.size,0);
});
test('unsupported GPU and missing adapter fall back without creating a worker',async()=>{
  for(const options of [{supported:false},{adapter:false}]){const h=harness(options);await h.ai.enable();assert.equal(h.ai.phase,'error');assert.equal(h.workers.length,0);assert.equal(h.ai.enabled,false);}
});
test('enable loads only 0.5B worker, reports progress, and accepts course-only messages',async()=>{
 const h=harness();await h.ai.enable();const w=h.workers[0];assert.deepEqual(w.messages,[{type:'load',half:true}]);
 w.onmessage({data:{type:'progress',progress:.5}});assert.match(h.states.at(-1).message,/50%/);h.ready();assert.equal(h.ai.ready,true);
 const promise=h.ai.ask('手臂應該放哪裡？',{time:20});const ask=w.messages.at(-1);assert.equal(h.ai.phase,'thinking');assert.equal(ask.messages.length,2);
 assert.match(ask.messages[1].content,/左右側伸展/);assert.doesNotMatch(JSON.stringify(ask),/rgba|landmarks|data:image/);
 w.onmessage({data:{type:'reply',id:ask.id+1,text:'stale'}});assert.equal(h.ai.phase,'thinking');
 w.onmessage({data:{type:'reply',id:ask.id,text:'肩膀放鬆。'}});assert.equal(await promise,'肩膀放鬆。');assert.equal(h.ai.ready,true);h.ai.disable();
});
test('disable while loading aborts worker; old ready/progress messages cannot reactivate AI',async()=>{
 const h=harness();await h.ai.enable();const w=h.workers[0],old=w.onmessage;h.ai.disable();assert.equal(w.terminated,true);
 old({data:{type:'ready'}});assert.equal(h.ai.enabled,false);assert.equal(h.timers.size,0);
 await h.ai.enable();assert.equal(h.workers.length,2);old({data:{type:'ready'}});assert.equal(h.ai.phase,'loading');h.ai.disable();
});
test('disable during GPU check cannot create a late worker',async()=>{
 let resolve;const h=harness();h.ai.gpu={requestAdapter:()=>new Promise(r=>resolve=r)};
 const enabling=h.ai.enable();h.ai.disable();resolve({features:new Set()});await enabling;assert.equal(h.workers.length,0);assert.equal(h.ai.enabled,false);
});
test('inference, error and timeout all release resources and settle pending questions',async()=>{
 for(const outcome of ['disable','error','timeout']){
  const h=harness();await h.ai.enable();h.ready();const w=h.workers[0],reply=h.ai.ask('怎麼伸展？',{time:0});
  assert.equal(await h.ai.ask('重複提問',{time:0}),null);
  if(outcome==='disable')h.ai.disable();else if(outcome==='error')w.onmessage({data:{type:'error'}});else h.timers.get(45000)();
  assert.equal(await reply,null);assert.equal(w.terminated,true);assert.equal(h.ai.enabled,false);assert.equal(h.timers.size,0);
 }
 const h=harness();await h.ai.enable();h.timers.get(180000)();assert.equal(h.workers[0].terminated,true);assert.equal(h.ai.phase,'error');
});
test('AI receives bounded text and no invented visual observation or executable action',()=>{
 const messages=localAIMessages('a'.repeat(1000),{time:0});assert.equal(messages.length,2);
 assert.match(messages[0].content,/沒有影像或骨架/);assert.match(messages[0].content,/不輸出程式/);
 assert.equal(messages[1].content.split('使用者問題：')[1].length,300);
});

test('production worker initializes supported SDK/model then returns bounded text replies and errors',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../src/local-ai-worker.js',import.meta.url),'utf8');
 for(const half of [true,false]){
  const messages=[],reloads=[],requests=[];let fail=false;
  class Engine{constructor(options){this.options=options;this.chat={completions:{create:async request=>{requests.push(request);if(fail)throw Error('GPU lost');return {choices:[{message:{content:'自然呼吸。'}}]};}}};}async reload(...args){reloads.push(args);this.options.initProgressCallback({progress:1});}}
  const self={postMessage:m=>messages.push(m)};
  runInNewContext(source.replace(/^import .*;\n/gm,'').replace("import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm')",'loadSDK()'),{self,setTimeout,clearTimeout,navigator:{gpu:{requestAdapter:async()=>({features:new Set(half?['shader-f16']:[])})}},aiErrorDetail,aiErrorCode,cleanAIText,loadLocalModel,checkedShardResponse,loadSDK:async()=>({MLCEngine:Engine})});
  await self.onmessage({data:{type:'load',half}});assert.match(reloads[0][0],half?/q4f16_1/:/q4f32_1/);assert.equal(reloads[0][1].context_window_size,1024);assert.equal(messages.at(-1).type,'ready');
  await self.onmessage({data:{type:'ask',id:8,messages:localAIMessages('肩膀怎麼放？',{time:0})}});
  assert.equal(messages.at(-1).id,8);assert.equal(messages.at(-1).text,'自然呼吸。');assert.equal(requests[0].max_tokens,160);assert.equal(requests[0].stream,false);
  fail=true;await self.onmessage({data:{type:'ask',id:9,messages:[]}});assert.equal(messages.at(-1).type,'error');
 }
});


test('diagnostics distinguish absent API, null GPU adapter, thrown GPU error and worker startup',async()=>{
 for(const [options,code] of [[{supported:false},'WEBGPU_UNAVAILABLE'],[{adapter:false},'GPU_ADAPTER_NULL']]){
  const h=harness(options);await h.ai.enable();assert.equal(h.ai.diagnostics.failure.code,code);assert.match(h.states.at(-1).message,new RegExp(code));assert.equal(h.ai.diagnostics.environment.version,'0.9.6');
 }
 const gpu=harness();gpu.ai.gpu.requestAdapter=async()=>{throw new DOMException('GPU process unavailable','OperationError');};await gpu.ai.enable();
 assert.equal(gpu.ai.diagnostics.failure.code,'GPU_ADAPTER_ERROR');assert.equal(gpu.ai.diagnostics.failure.error.name,'OperationError');assert.match(gpu.states.at(-1).message,/GPU process unavailable/);
 const worker=harness();worker.ai.createWorker=()=>{throw new DOMException('Worker blocked by policy','SecurityError');};await worker.ai.enable();assert.equal(worker.ai.diagnostics.failure.code,'WORKER_START_ERROR');assert.equal(worker.ai.diagnostics.failure.stage,'worker');assert.match(worker.states.at(-1).message,/Worker blocked/);
});
test('worker stage and original SDK/model error survive termination and manual close',async()=>{
 const h=harness();await h.ai.enable();const w=h.workers[0];w.onmessage({data:{type:'stage',stage:'model'}});
 w.onmessage({data:{type:'resource-error',resource:{url:'https://example.com/model.bin',status:403}}});
 w.onmessage({data:{type:'error',stage:'model',code:'RESOURCE_LOAD_ERROR',error:{name:'Error',message:'Download failed HTTP 403'}}});
 const d=h.ai.diagnostics;assert.equal(d.failure.stage,'model');assert.equal(d.failure.resource.status,403);assert.match(h.states.at(-1).message,/HTTP 403/);assert.equal(w.terminated,true);h.ai.disable();assert.equal(h.ai.diagnostics,d);
});
test('GPU null does not claim memory exhaustion; only explicit allocation errors get memory code',()=>{
 assert.equal(aiErrorCode(new Error('unknown failure'),'model'),'MODEL_LOAD_ERROR');assert.equal(aiErrorCode(new Error('out of memory'),'model'),'GPU_MEMORY_ERROR');
 assert.equal(aiErrorCode(new Error('device was lost'),'inference'),'GPU_DEVICE_LOST');
 const m=aiFailureMessage({code:'GPU_ADAPTER_NULL',stage:'adapter',error:{name:'Error',message:'returned null'}});assert.match(m,/不能據此判定記憶體不足/);assert.match(m,/瀏覽器沒有回傳更詳細原因/);
});
test('diagnostic sanitizer removes URL query credentials, fragments and question text',()=>{
 const d=aiErrorDetail({name:'Error',message:'Failed https://host.test/file.bin?token=secret#private Bearer abc123: 肩膀疼痛',cause:new Error('https://host.test/cause?key=hidden')},['肩膀疼痛']);
 const text=JSON.stringify(d);assert.doesNotMatch(text,/secret|private|abc123|hidden|肩膀疼痛/);assert.match(text,/host.test\/file.bin/);assert.ok(text.includes('已省略問答文字'));
});
test('load timeout covers GPU check itself, preserves last stage and prevents late workers',async()=>{
 const h=harness();let resolve;h.ai.gpu.requestAdapter=()=>new Promise(r=>resolve=r);const enabling=h.ai.enable();
 h.timers.get(180000)();assert.equal(h.ai.diagnostics.failure.code,'LOAD_TIMEOUT');assert.equal(h.ai.diagnostics.failure.stage,'adapter');resolve({features:new Set()});await enabling;assert.equal(h.workers.length,0);
});

test('worker separately diagnoses GPU availability, SDK import failure and model allocation failure',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=(await readFile(new URL('../src/local-ai-worker.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace("import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm')",'loadSDK()');
 for(const scenario of ['no-api','null-adapter','sdk','memory','download']){
  const sent=[],self={postMessage:m=>sent.push(m)};
  const navigator=scenario==='no-api'?{}:{gpu:{requestAdapter:async()=>scenario==='null-adapter'?null:{features:new Set(['shader-f16'])}}};
  class Engine{constructor(){ }async reload(){if(scenario==='download'){await globalFetch('https://models.test/weights.bin?token=secret');throw Error('Failed download HTTP 403');}throw Object.assign(new Error('Failed to allocate GPU buffer'),{name:'GPUOutOfMemoryError'});}}
  let globalFetch;const context={self,navigator,URL,setTimeout,clearTimeout,aiErrorDetail,aiErrorCode,cleanAIText,loadLocalModel,checkedShardResponse,loadSDK:async()=>{if(scenario==='sdk')throw new TypeError('Failed to fetch dynamically imported module');return {MLCEngine:Engine};},fetch:async()=>({ok:false,status:403})};
  runInNewContext(source,context);globalFetch=context.fetch;
  await self.onmessage({data:{type:'load',half:true}});const error=sent.at(-1);
  assert.equal(error.type,'error');assert.equal(error.code,({'no-api':'WORKER_GPU_UNAVAILABLE','null-adapter':'WORKER_GPU_ADAPTER_NULL',sdk:'SDK_LOAD_ERROR',memory:'GPU_MEMORY_ERROR',download:'RESOURCE_LOAD_ERROR'})[scenario]);
  if(scenario==='download'){assert.equal(error.resource.status,403);assert.equal(error.resource.url,'https://models.test/weights.bin');assert.doesNotMatch(JSON.stringify(error),/token=secret/);}
 }
});


test('default timers preserve browser host receiver instead of invoking Window functions as AI methods',async()=>{
 const timer=globalThis.setTimeout,clear=globalThis.clearTimeout;let installed=0,cancelled=0;
 globalThis.setTimeout=function(fn,ms){assert.equal(this,globalThis,'Window.setTimeout requires its own receiver');installed++;return 73;};
 globalThis.clearTimeout=function(id){assert.equal(this,globalThis,'Window.clearTimeout requires its own receiver');assert.equal(id,73);cancelled++;};
 try{
  const ai=new LocalCoachAI({gpu:{requestAdapter:async()=>null}});await ai.enable();
  assert.equal(ai.diagnostics.failure.code,'GPU_ADAPTER_NULL');assert.equal(installed,2);assert.equal(cancelled,2);
 }finally{globalThis.setTimeout=timer;globalThis.clearTimeout=clear;}
});


test('GPU checking is bounded to ten seconds and cannot create late workers after timeout',async()=>{
 const h=harness();let resolve;h.ai.gpu.requestAdapter=()=>new Promise(r=>resolve=r);const enabling=h.ai.enable();
 assert.match(h.states.at(-1).message,/10 秒/);assert.match(h.states.at(-1).message,/尚未下載模型/);
 h.timers.get(10000)();await enabling;assert.equal(h.ai.phase,'error');assert.equal(h.ai.diagnostics.failure.code,'GPU_CHECK_TIMEOUT');assert.equal(h.ai.diagnostics.failure.stage,'adapter');assert.equal(h.timers.size,0);
 resolve({features:new Set()});await Promise.resolve();assert.equal(h.workers.length,0);
 h.ai.gpu.requestAdapter=async()=>({features:new Set()});await h.ai.enable();assert.equal(h.workers.length,1);h.ai.disable();
});

test('user question preempts AI guidance, stale completion/error cannot steal the newer reply',async()=>{
 const {guidanceAt}=await import('../src/guidance.js');const h=harness();await h.ai.enable();h.ready();const w=h.workers[0];
 const guidance=h.ai.guide(guidanceAt(0),{time:0});const first=w.messages.at(-1);assert.equal(first.kind,'guidance');
 const reply=h.ai.ask('手要怎麼放？',{time:0});const second=w.messages.at(-1);assert.equal(await guidance,null);assert.equal(w.messages.at(-2).type,'cancel-guidance');assert.equal(second.kind,'reply');
 w.onmessage({data:{type:'error',id:first.id,stage:'inference',error:{message:'cancelled'}}});assert.equal(h.ai.phase,'thinking');
 w.onmessage({data:{type:'reply',id:first.id,text:'舊口令'}});assert.equal(h.ai.phase,'thinking');
 w.onmessage({data:{type:'reply',id:second.id,text:'保持自然呼吸。'}});assert.equal(await reply,'保持自然呼吸。');h.ai.disable();
});
