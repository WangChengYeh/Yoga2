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
  runInNewContext(source.replace("import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm')",'loadSDK()'),{self,loadSDK:async()=>({MLCEngine:Engine})});
  await self.onmessage({data:{type:'load',half}});assert.match(reloads[0][0],half?/q4f16_1/:/q4f32_1/);assert.equal(reloads[0][1].context_window_size,1024);assert.equal(messages.at(-1).type,'ready');
  await self.onmessage({data:{type:'ask',id:8,messages:localAIMessages('肩膀怎麼放？',{time:0})}});
  assert.equal(messages.at(-1).id,8);assert.equal(messages.at(-1).text,'自然呼吸。');assert.equal(requests[0].max_tokens,160);assert.equal(requests[0].stream,false);
  fail=true;await self.onmessage({data:{type:'ask',id:9,messages:[]}});assert.equal(messages.at(-1).type,'error');
 }
});
