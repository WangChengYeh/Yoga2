import { WorkloadScheduler } from '../src/workload-scheduler.js';
import { trackWebGPU } from '../src/gpu-memory-tracker.js';
import { normalizeContextWindow } from '../src/ai-context-settings.js';
import {loadLocalModel,checkedShardResponse,LOCAL_AI_CONTEXT_WINDOW} from '../src/local-ai-model.js';
import { aiErrorDetail, aiErrorCode, cleanAIText, aiFailureMessage } from '../src/ai-diagnostics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalCoachAI,localAIMessages} from '../src/local-ai.js';
function harness({supported=true,adapter=true,scheduler=null,responseDeadlineMs=8000}={}){
  const workers=[],states=[],timers=new Map();let gpuCalls=0;
  const ai=new LocalCoachAI({scheduler,responseDeadlineMs,gpu:supported?{async requestAdapter(){gpuCalls++;return adapter?{features:new Set(['shader-f16'])}:null;}}:null,
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
 const h=harness();await h.ai.enable();const w=h.workers[0];assert.deepEqual(w.messages,[{type:'load',half:true,contextWindow:1024}]);
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
 const messages=localAIMessages('a'.repeat(1000),{time:0},[],null,4096);assert.equal(messages.length,2);
 assert.match(messages[0].content,/真人、教練骨架/);assert.match(messages[1].content,/"available":false/);assert.match(messages[0].content,/不輸出程式/);
 assert.equal(messages[1].content.split('使用者問題：')[1].length,300);
});

test('production worker initializes supported SDK/model then returns bounded text replies and errors',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../src/local-ai-worker.js',import.meta.url),'utf8');
 for(const [half,contextWindow] of [[true,1024],[true,4096],[true,16384],[false,1024],[false,4096],[false,16384]]){
  const messages=[],reloads=[],requests=[];let fail=false;
  class Engine{constructor(options){this.options=options;this.chat={completions:{create:async request=>{requests.push(request);if(fail)throw Error('GPU lost');return {choices:[{message:{content:'自然呼吸。'}}]};}}};}async reload(...args){reloads.push(args);this.options.initProgressCallback({progress:1});}}
  const self={postMessage:m=>messages.push(m)};
  runInNewContext(source.replace(/^import .*;\n/gm,'').replace("import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm')",'loadSDK()'),{self,setTimeout,clearTimeout,navigator:{gpu:{requestAdapter:async()=>({features:new Set(half?['shader-f16']:[])})}},aiErrorDetail,aiErrorCode,cleanAIText,loadLocalModel,checkedShardResponse,LOCAL_AI_CONTEXT_WINDOW,normalizeContextWindow,trackWebGPU,loadSDK:async()=>({MLCEngine:Engine})});
  await self.onmessage({data:{type:'load',half,contextWindow}});assert.match(reloads[0][0],half?/q4f16_1/:/q4f32_1/);assert.equal(reloads[0][1].context_window_size,contextWindow);assert.equal(messages.find(m=>m.type==='model-info').contextWindow,contextWindow);assert.equal(messages.at(-1).type,'ready');
  await self.onmessage({data:{type:'ask',id:8,messages:localAIMessages('肩膀怎麼放？',{time:0})}});
  assert.equal(messages.at(-1).id,8);assert.equal(messages.at(-1).text,'自然呼吸。');assert.equal(requests[0].max_tokens,160);assert.equal(requests[0].stream,false);
  fail=true;await self.onmessage({data:{type:'ask',id:9,messages:[]}});assert.equal(messages.at(-1).type,'error');
 }
});


test('diagnostics distinguish absent API, null GPU adapter, thrown GPU error and worker startup',async()=>{
 for(const [options,code] of [[{supported:false},'WEBGPU_UNAVAILABLE'],[{adapter:false},'GPU_ADAPTER_NULL']]){
  const h=harness(options);await h.ai.enable();assert.equal(h.ai.diagnostics.failure.code,code);assert.match(h.states.at(-1).message,new RegExp(code));assert.equal(h.ai.diagnostics.environment.version,'0.9.22');
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
  let globalFetch;const context={self,navigator,URL,setTimeout,clearTimeout,aiErrorDetail,aiErrorCode,cleanAIText,loadLocalModel,checkedShardResponse,LOCAL_AI_CONTEXT_WINDOW,normalizeContextWindow,trackWebGPU,loadSDK:async()=>{if(scenario==='sdk')throw new TypeError('Failed to fetch dynamically imported module');return {MLCEngine:Engine};},fetch:async()=>({ok:false,status:403})};
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

test('barge-in cancels pending AI reply without unloading; stale reply/error cannot affect a new question',async()=>{
 const h=harness();await h.ai.enable();h.ready();const w=h.workers[0];
 const old=h.ai.ask('第一個問題',{time:0}),first=w.messages.at(-1);h.ai.cancelReply();
 assert.equal(await old,null);assert.equal(h.ai.ready,true);assert.equal(w.messages.at(-1).type,'cancel-reply');
 const next=h.ai.ask('第二個問題',{time:0}),second=w.messages.at(-1);
 w.onmessage({data:{type:'reply',id:first.id,text:'過時'}});w.onmessage({data:{type:'error',id:first.id,stage:'inference',error:{message:'cancelled'}}});assert.equal(h.ai.phase,'thinking');
 w.onmessage({data:{type:'reply',id:second.id,text:'新答案'}});assert.equal(await next,'新答案');h.ai.disable();
});

test('AI retains only bounded previous exchange in memory, reports playback context, and clears it on disable',async()=>{
 const h=harness();await h.ai.enable();h.ready();const w=h.workers[0];
 const first=h.ai.ask('今天想放鬆肩膀',{time:0,playing:false}),a=w.messages.at(-1);assert.match(a.messages.at(-1).content,/尚未開始/);
 w.onmessage({data:{type:'reply',id:a.id,text:'先放鬆肩膀，我陪你慢慢練。'}});await first;
 const second=h.ai.ask('那第一個動作呢',{time:0,playing:false}),b=w.messages.at(-1);assert.equal(b.messages.length,4);assert.equal(b.messages[1].content,'今天想放鬆肩膀');assert.match(b.messages[2].content,/我陪你/);
 w.onmessage({data:{type:'reply',id:b.id,text:'雙手慢慢上舉。'}});await second;assert.equal(h.ai.history.length,4);
 assert.doesNotMatch(JSON.stringify(h.ai.diagnostics),/今天想放鬆肩膀|第一個動作呢/);h.ai.disable();assert.deepEqual(h.ai.history,[]);
});
test('cancelled AI answers never enter short-term conversation memory',async()=>{
 const h=harness();await h.ai.enable();h.ready();const w=h.workers[0],pending=h.ai.ask('舊問題',{time:0});const id=w.messages.at(-1).id;
 h.ai.cancelReply();assert.equal(await pending,null);w.onmessage({data:{type:'reply',id,text:'取消的回答'}});assert.deepEqual(h.ai.history,[]);h.ai.disable();
});

test('worker serializes overlapping inference and ignores cancelled replies',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {runInNewContext}=await import('node:vm');
 const source=(await readFile(new URL('../src/local-ai-worker.js',import.meta.url),'utf8'))
   .replace(/^import .*;\n/gm,'')
   .replace("import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm')",'loadSDK()');
 const sent=[],requests=[];let resolveFirst,active=0,peak=0,interrupts=0;
 class Engine{
  constructor(){this.chat={completions:{create:()=>{active++;peak=Math.max(peak,active);const index=requests.length;requests.push(index);if(index===0)return new Promise(resolve=>{resolveFirst=()=>{active--;resolve({choices:[{message:{content:'old'}}]});};});active--;return Promise.resolve({choices:[{message:{content:'new'}}]});}}};}
  async reload(){}
  interruptGenerate(){interrupts++;}
 }
 const self={postMessage:m=>sent.push(m)};
 runInNewContext(source,{self,URL,setTimeout,clearTimeout,navigator:{gpu:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}},aiErrorDetail,aiErrorCode,cleanAIText,loadLocalModel,checkedShardResponse,LOCAL_AI_CONTEXT_WINDOW,normalizeContextWindow,trackWebGPU,loadSDK:async()=>({MLCEngine:Engine})});
 await self.onmessage({data:{type:'load'}});
 const first=self.onmessage({data:{type:'ask',id:1,kind:'guidance',messages:[]}});
 await Promise.resolve();await Promise.resolve();
 await self.onmessage({data:{type:'cancel-guidance',id:1}});
 const second=self.onmessage({data:{type:'ask',id:2,kind:'reply',messages:[]}});
 assert.equal(interrupts,1);
 assert.equal(requests.length,1,'second request waits until first completes');
 resolveFirst();await Promise.all([first,second]);
 assert.equal(peak,1,'WebLLM never generates concurrently');
 assert.deepEqual(sent.filter(m=>m.type==='reply').map(m=>m.id),[2]);
});
test('worker skips a queued request cancelled before it starts',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {runInNewContext}=await import('node:vm');
 const source=(await readFile(new URL('../src/local-ai-worker.js',import.meta.url),'utf8'))
   .replace(/^import .*;\n/gm,'')
   .replace("import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm')",'loadSDK()');
 const sent=[];let release,calls=0;
 class Engine{
  constructor(){this.chat={completions:{create:()=>{calls++;return calls===1?new Promise(resolve=>{release=()=>resolve({choices:[{message:{content:'first'}}]});}):Promise.resolve({choices:[{message:{content:'unexpected'}}]});}}};}
  async reload(){}
  interruptGenerate(){}
 }
 const self={postMessage:m=>sent.push(m)};
 runInNewContext(source,{self,URL,setTimeout,clearTimeout,navigator:{gpu:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}},aiErrorDetail,aiErrorCode,cleanAIText,loadLocalModel,checkedShardResponse,LOCAL_AI_CONTEXT_WINDOW,normalizeContextWindow,trackWebGPU,loadSDK:async()=>({MLCEngine:Engine})});
 await self.onmessage({data:{type:'load'}});
 const first=self.onmessage({data:{type:'ask',id:1,messages:[]}});
 await Promise.resolve();await Promise.resolve();
 const queued=self.onmessage({data:{type:'ask',id:2,messages:[]}});
 await self.onmessage({data:{type:'cancel-reply',id:2}});
 release();await Promise.all([first,queued]);
 assert.equal(calls,1);
 assert.deepEqual(sent.filter(m=>m.type==='reply').map(m=>m.id),[1]);
});

test('activated AI generates welcome through its model without recording synthetic prompts as user dialogue',async()=>{
 const h=harness();await h.ai.enable();h.ready();const w=h.workers[0];const greeting=h.ai.greet({time:0,playing:false}),request=w.messages.at(-1);
 assert.equal(request.kind,'reply');assert.match(request.messages.at(-1).content,/主動.*打招呼/);assert.match(request.messages.at(-1).content,/等待回答/);
 w.onmessage({data:{type:'reply',id:request.id,text:'嗨，我是 Luna，想先聊聊嗎？'}});assert.equal(await greeting,'嗨，我是 Luna，想先聊聊嗎？');assert.deepEqual(h.ai.history,[]);h.ai.disable();
});
test('real AI transport includes sensors for greetings, answers and guidance and reports only consumed snapshot',async()=>{
 const h=harness();await h.ai.enable({contextWindow:4096});h.ready();const w=h.workers[0],context={capturedAtMs:200,human:{fresh:true,camera:'active',joints:[[100,200,0,900]],observation:{code:'reach-seen'}},coach:{ready:true,order:['Hips'],joints:[[0,1000,0]],edges:[]}};
 for(const start of [()=>h.ai.greet({time:0},context),()=>h.ai.ask('我的動作如何',{time:7},context),()=>h.ai.guide({at:6,text:'保持呼吸'}, {time:7},context)]){
  const response=start(),request=w.messages.at(-1);assert.equal(request.type,'ask');assert.match(JSON.stringify(request.messages),/reach-seen/);assert.match(JSON.stringify(request.messages),/Hips/);assert.match(JSON.stringify(request.messages),/100,200,0,900/);
  if(request.kind==='reply'){const snapshot=JSON.stringify(h.ai.diagnostics.sensors);await h.ai.ask('busy',{time:0},{human:{fresh:false}});assert.equal(JSON.stringify(h.ai.diagnostics.sensors),snapshot);}
  w.onmessage({data:{type:'reply',id:request.id,text:'保持自然呼吸。'}});await response;
 }
 h.ai.disable();
});
test('16K conversation keeps six bounded exchanges without retaining old sensor snapshots in history',async()=>{
 const h=harness();await h.ai.enable({contextWindow:16384});h.ready();const w=h.workers[0];
 for(let i=0;i<8;i++){
  const response=h.ai.ask('問題'+i+'x'.repeat(600),{time:0},{human:{fresh:false},coach:{ready:true,order:['Hips'],joints:[[0,1000,0]]}}),request=w.messages.at(-1);
  w.onmessage({data:{type:'reply',id:request.id,text:'回答'+i}});await response;
 }
 assert.equal(h.ai.history.length,12);assert.match(h.ai.history[0].content,/問題2/);assert.equal(h.ai.history[0].content.length,300);assert.doesNotMatch(JSON.stringify(h.ai.history),/Hips|joints|感知資料/);
 h.ai.disable();assert.deepEqual(h.ai.history,[]);
});
test('switching context terminates old worker and records selected/loading/active accurately, ignoring late ready',async()=>{
 const h=harness();await h.ai.enable({contextWindow:16384});const first=h.workers.at(-1),late=first.onmessage;
 assert.deepEqual(h.ai.diagnostics.context,{selected:16384,loading:16384,active:null,status:'loading'});assert.equal(first.messages[0].contextWindow,16384);
 first.onmessage({data:{type:'model-info',modelId:'qwen',contextWindow:16384}});h.ready();assert.equal(h.ai.diagnostics.context.active,16384);
 const pending=h.ai.ask('舊問題',{time:0});await h.ai.enable({contextWindow:4096});assert.equal(await pending,null);assert.equal(first.terminated,true);late({data:{type:'ready'}});assert.equal(h.ai.phase,'loading');assert.equal(h.ai.diagnostics.context.active,null);
 const second=h.workers.at(-1);second.onmessage({data:{type:'model-info',modelId:'qwen',contextWindow:4096}});h.ready();assert.equal(h.ai.diagnostics.context.active,4096);h.ai.disable();assert.equal(h.ai.diagnostics.context.active,null);assert.equal(h.ai.diagnostics.context.selected,4096);
});
test('failed context load records error and does not claim the selected window is active',async()=>{
 const h=harness();await h.ai.enable({contextWindow:16384});h.workers[0].onmessage({data:{type:'error',code:'GPU_MEMORY_ERROR',stage:'model',error:{message:'allocation failed'}}});assert.equal(h.ai.diagnostics.context.status,'error');assert.equal(h.ai.diagnostics.context.selected,16384);assert.equal(h.ai.diagnostics.context.active,null);assert.equal(h.ai.diagnostics.context.loading,null);
});
test('1K worker receives summary but debug report retains full source bones separately',async()=>{
 const h=harness();await h.ai.enable();h.ready();const w=h.workers[0],c={human:{fresh:true,joints:Array.from({length:33},()=>[400,200,0,900]),observation:{code:'reach-seen',valid:true}},coach:{ready:true,order:['Hips'],joints:[[0,1000,0]]}};
 const pending=h.ai.ask('姿勢如何',{time:0},c),request=w.messages.at(-1);assert.match(JSON.stringify(request.messages),/skeleton-summary/);assert.doesNotMatch(JSON.stringify(request.messages),/Hips/);assert.equal(h.ai.diagnostics.sensors.representation,'skeleton-summary');assert.equal(h.ai.diagnostics.sourceSensors.human.joints.length,33);w.onmessage({data:{type:'reply',id:request.id,text:'請保持舒適幅度。'}});await pending;h.ai.disable();
});
test('memory task hooks bracket model and inference, retain GPU samples, and observe cleanup without altering replies',async()=>{
 const h=harness(),events=[];h.ai.onMemoryEvent=e=>events.push({...e,state:h.ai.memoryStatus});await h.ai.enable();const w=h.workers[0];w.onmessage({data:{type:'model-info',modelId:'qwen',contextWindow:1024}});h.ready();assert.equal(events.find(e=>e.phase==='model-load-after').state.phase,'ready');
 w.onmessage({data:{type:'gpu-memory',snapshot:{at:new Date().toISOString(),buffers:{outstandingDeclaredBytes:1234}}}});const p=h.ai.ask('你好',{time:0}),id=w.messages.at(-1).id;assert.equal(events.at(-1).phase,'inference-before');w.onmessage({data:{type:'reply',id,text:'你好',usage:{totalTokens:200}}});assert.equal(await p,'你好');assert.equal(events.at(-1).phase,'inference-after');assert.equal(h.ai.memoryStatus.gpu.buffers.outstandingDeclaredBytes,1234);assert.equal(h.ai.memoryStatus.kv.tokens,200);h.ai.requestMemory();assert.equal(w.messages.at(-1).type,'memory-snapshot');h.ai.disable();assert.equal(events.at(-1).phase,'worker-stop-after');assert.equal(events.at(-1).state.context.active,null);
});

test('response deadline includes queue wait, cancels unsent job and preserves working model',async()=>{
 const scheduler=new WorkloadScheduler(),h=harness({scheduler});await h.ai.enable();h.ready();const release=await scheduler.acquire('vision-frame');const p=h.ai.ask('hello',{time:0});assert.equal(scheduler.diagnostics.queued.length,1);h.timers.get(8000)();assert.equal(await p,null);await Promise.resolve();assert.equal(h.ai.diagnostics.response.outcome,'deadline');assert.equal(scheduler.diagnostics.queued.length,0);assert.equal(h.workers[0].messages.filter(m=>m.type==='ask'||m.type==='cancel-reply').length,0);assert.equal(h.ai.ready,true);release();h.ai.disable();assert.equal(h.timers.size,0);
});
test('deadline resolves fallback but holds active lane until native completion acknowledgement',async()=>{
 const scheduler=new WorkloadScheduler(),h=harness({scheduler});await h.ai.enable();h.ready();const p=h.ai.ask('hello',{time:0});await Promise.resolve();const w=h.workers[0],id=w.messages.at(-1).id;h.timers.get(8000)();assert.equal(await p,null);assert.equal(scheduler.diagnostics.active.kind,'ai-inference');assert.equal(h.timers.has(5000),true);let admitted=false;const next=scheduler.acquire('vision-frame').then(r=>{admitted=true;return r;});await Promise.resolve();assert.equal(admitted,false);w.onmessage({data:{type:'reply',id,text:'late'}});assert.equal(h.ai.diagnostics.response.outcome,'deadline');w.onmessage({data:{type:'inference-done',id}});const release=await next;assert.equal(h.timers.has(5000),false);release();h.ai.disable();
});
test('native cancellation that never acknowledges terminates worker before releasing lane',async()=>{
 const scheduler=new WorkloadScheduler(),h=harness({scheduler,responseDeadlineMs:3000});await h.ai.enable();h.ready();const p=h.ai.ask('hello',{time:0});await Promise.resolve();h.timers.get(3000)();await p;assert.equal(scheduler.diagnostics.active.kind,'ai-inference');h.timers.get(5000)();assert.equal(h.workers[0].terminated,true);assert.equal(scheduler.diagnostics.active,null);assert.equal(h.ai.diagnostics.failure.code,'INFERENCE_CANCEL_TIMEOUT');assert.equal(h.timers.size,0);
});
test('successful replies clear deadline, use fresh context after admission, and future limits are configurable',async()=>{
 const scheduler=new WorkloadScheduler(),h=harness({scheduler});await h.ai.enable();h.ready();const release=await scheduler.acquire('vision-frame');let refreshed=0;const p=h.ai.ask('hello',{time:0},null,()=>{refreshed++;return null;});h.ai.setResponseDeadline(15000);assert.equal(h.timers.has(8000),true);assert.equal(refreshed,0);release();await Promise.resolve();assert.equal(refreshed,1);const w=h.workers[0],id=w.messages.at(-1).id;w.onmessage({data:{type:'inference-done',id}});w.onmessage({data:{type:'reply',id,text:'hello'}});assert.equal(await p,'hello');assert.equal(h.timers.size,0);const next=h.ai.ask('next',{time:0});assert.equal(h.timers.has(15000),true);h.ai.disable();await next;assert.equal(h.timers.size,0);
});
