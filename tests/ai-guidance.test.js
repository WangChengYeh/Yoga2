import test from 'node:test';
import assert from 'node:assert/strict';
import {AIGuidance,guidanceMessages,validGuidance} from '../src/ai-guidance.js';
import {guidanceAt} from '../src/guidance.js';
const flush=()=>new Promise(r=>setImmediate(r));
function harness(){
 const state={time:0,playing:false,ready:true,speed:1},spoken=[],requests=[],timers=new Map(),sources=[];let enabled=true,allowed=true,serial=0;
 const ai={ready:true,pending:null,guide(cue){this.ready=false;let resolve;const result=new Promise(r=>resolve=r);this.pending={kind:'guidance',resolve};requests.push({cue,resolve:text=>{this.ready=true;this.pending=null;resolve(text);}});return result;},cancelGuidance(){if(this.pending){this.pending.resolve(null);this.pending=null;this.ready=true;}}};
 const coach=new AIGuidance({ai,getState:()=>state,speak:(text,options)=>spoken.push({text,options}),enabled:()=>enabled,canSpeak:()=>allowed,onSource:s=>sources.push(s),setTimer:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
 return {state,ai,coach,spoken,requests,timers,sources,set enabled(v){enabled=v;},set allowed(v){allowed=v;},expire(){for(const [id,timer]of [...timers]){timers.delete(id);timer.fn();}}};
}
test('AI disabled uses basic cue immediately without loading/generating',()=>{
 const h=harness();h.enabled=false;h.state.playing=true;h.coach.say('基本口令',{kind:'guidance'});assert.equal(h.requests.length,0);assert.equal(h.spoken[0].text,'基本口令');assert.equal(h.sources[0],'基本口令');
});
test('prefetch while paused produces no audio; playback uses AI sentence and warms next phase',async()=>{
 const h=harness();h.coach.update();assert.equal(h.requests[0].cue.key,'reach:0');assert.equal(h.spoken.length,0);
 h.requests[0].resolve('雙手慢慢舉高，肩膀放鬆。');await flush();h.state.playing=true;h.coach.say(guidanceAt(0).text,{kind:'guidance'});
 assert.equal(h.spoken[0].text,'雙手慢慢舉高，肩膀放鬆。');assert.equal(h.sources[0],'AI');h.coach.update();assert.equal(h.requests[1].cue.key,'reach:6');h.coach.cancel();
});
test('current AI cue arrives before deadline and speaks only once',async()=>{
 const h=harness();h.state.playing=true;h.coach.say(guidanceAt(0).text,{kind:'guidance'});assert.equal(h.spoken.length,0);
 h.requests[0].resolve('雙手輕輕舉高，跟著呼吸。');await flush();assert.equal(h.spoken.length,1);assert.equal(h.timers.size,0);assert.equal(h.spoken[0].options.kind,'guidance');h.expire();assert.equal(h.spoken.length,1);
});
test('deadline falls back once; late generated words are discarded',async()=>{
 const h=harness();h.state.playing=true;const cue=guidanceAt(0);h.coach.say(cue.text,{kind:'guidance'});assert.ok([...h.timers.values()][0].ms<=3000);h.expire();assert.equal(h.spoken[0].text,cue.text);
 h.requests[0].resolve('雙手向上舉高。');await flush();assert.equal(h.spoken.length,1);assert.equal(h.coach.cache.size,0);
});
test('pause/question, AI off and phase changes cannot speak stale AI cues',async()=>{
 for(const reason of ['question','off','seek']){
  const h=harness();h.state.playing=true;h.coach.say(guidanceAt(0).text,{kind:'guidance'});
  if(reason==='question'){h.allowed=false;h.state.playing=false;h.coach.cancel();}
  if(reason==='off'){h.enabled=false;h.coach.cancel({clearCache:true});}
  if(reason==='seek'){h.state.time=20;h.coach.cancel();}
  h.requests[0].resolve('雙手慢慢舉高。');await flush();h.expire();assert.equal(h.spoken.length,0,reason);assert.equal(h.coach.cache.size,0);
 }
});
test('AI failure and unsafe/contradictory output use basic cues, without invented next movements',async()=>{
 for(const text of [null,'雙手放下，完成了。','雙手舉高，換邊吧。','<script>雙手舉高</script>']){
  const h=harness();h.state.playing=true;const cue=guidanceAt(0);h.coach.say(cue.text,{kind:'guidance'});h.requests[0].resolve(text);await flush();assert.equal(h.spoken[0].text,cue.text);assert.equal(h.sources[0],'基本口令');
 }
 assert.equal(validGuidance('自然呼吸，同時把雙手放下。',guidanceAt(6)),null);
 assert.equal(validGuidance('現在換邊，輕輕側彎。',guidanceAt(32)),'現在換邊，輕輕側彎。');
});
test('guidance prompt uses phase facts and has no user image, transcript or pose claims',()=>{
 const text=JSON.stringify(guidanceMessages(guidanceAt(32),{time:1}));assert.match(text,/換邊/);assert.match(text,/24/);assert.match(text,/沒有看到使用者/);assert.doesNotMatch(text,/rgba|landmarks|使用者問題/);
});

test('invalid prefetch is attempted once per phase rather than running the model on every frame',async()=>{
 const h=harness();h.coach.update();h.requests[0].resolve('我不知道');await flush();
 for(let i=0;i<60;i++)h.coach.update();assert.equal(h.requests.length,1);h.state.playing=true;h.coach.say(guidanceAt(0).text,{kind:'guidance'});assert.equal(h.spoken[0].text,guidanceAt(0).text);assert.equal(h.timers.size,0);
 h.coach.cancel({clearCache:true});h.state.playing=false;h.coach.update();assert.equal(h.requests.length,2);h.coach.cancel();
});
