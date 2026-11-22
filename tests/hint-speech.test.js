import test from 'node:test';
import assert from 'node:assert/strict';
import {HintSpeechRouter,hintSpeechPreferences,validHintExplanation} from '../src/hint-speech.js';
function harness(policy={intervalMs:15000,cooldownMs:20000}){
 let now=0,hint=null,enabled=true,busy=false;const spoken=[],requests=[],published=[];let cancelled=0,speechCancelled=0;
 const ai={ready:true,explainHint(h,stats){return new Promise(resolve=>requests.push({h,stats,resolve}));},cancelGuidance(){cancelled++;}};
 const router=new HintSpeechRouter({getHint:()=>hint,now:()=>now,enabled:()=>enabled,canSpeak:()=>!busy,canExplain:()=>!busy,ai,speak:text=>{spoken.push(text);return true;},cancelSpeech:()=>speechCancelled++,publish:(h,t)=>{published.push({h,t});return true;},getState:()=>({time:8,playing:true}),getPolicy:()=>policy,setTimer:()=>1,clearTimer(){}});
 return {router,spoken,requests,published,ai,get cancelled(){return cancelled;},get speechCancelled(){return speechCancelled;},sample(at,id='left-elbow-bent',generation=1){now=at;hint={id,code:id,message:'手肘可在舒適範圍內伸展。',kind:'hint',timestamp:at,expiresAt:at+1500,context:{scope:'reach-hold:true',generation},values:{error:40,measured:140,target:180}};router.tick();},poll(){router.tick();},set enabled(v){enabled=v;},set busy(v){busy=v;},clear(at){now=at;hint=null;router.tick();},expire(at){now=at;router.tick();}};
}
test('high-rate repeated fixed corrections produce one local TTS and one aggregate LLM request',()=>{
 const h=harness();h.sample(0);h.router.speechStarted();h.router.speechEnded();for(let t=200;t<=10000;t+=200)h.sample(t);
 assert.equal(h.spoken.length,1);assert.equal(h.requests.length,1);assert.ok(h.requests[0].stats.samples>3);assert.equal(h.router.diagnostics.queueSize,0);assert.equal(h.router.diagnostics.ttsPlayed,1);
});
test('render/display polling never counts as independent sensor observations',()=>{
 const h=harness();h.sample(0);for(let i=0;i<1000;i++)h.poll();assert.equal(h.router.diagnostics.generated,1);assert.equal(h.requests.length,0);
});
test('delayed explanation uses a fresh TTL and the speech interval while correction remains current',async()=>{
 const h=harness();for(const t of [0,1000,2000,3000])h.sample(t);h.requests[0].resolve('影像中的手肘角度與參考值有差距，請維持舒適幅度。');await new Promise(r=>setImmediate(r));
 assert.equal(h.published.length,1);assert.equal(h.published[0].h.expiresAt,4500);assert.equal(h.router.diagnostics.pendingSpeech,true);assert.equal(h.spoken.length,1);
 h.router.speechEnded();for(let t=4000;t<=15000;t+=1000)h.sample(t);assert.equal(h.spoken.length,2);assert.equal(h.router.diagnostics.pendingSpeech,false);assert.equal(h.requests.length,1);
});
test('changed/expired/paused hints cancel output, invalidate replies and retain a single flight',async()=>{
 const h=harness({intervalMs:1000,cooldownMs:20000});for(const t of [0,1000,2000,3000])h.sample(t);const stale=h.requests[0];
 h.sample(4000,'right-elbow-bent',2);for(const t of [5000,6000,7000])h.sample(t,'right-elbow-bent',2);assert.equal(h.requests.length,1);assert.equal(h.cancelled,1);assert.ok(h.speechCancelled>=1);
 stale.resolve('保持舒適幅度，自然呼吸。');await new Promise(r=>setImmediate(r));assert.equal(h.published.length,0);assert.equal(h.router.diagnostics.pendingLLM,false);
 h.expire(9000);assert.equal(h.router.diagnostics.aggregate,null);h.sample(10000);h.enabled=false;h.poll();assert.equal(h.router.diagnostics.aggregate,null);
});
test('user-priority busy state does not enqueue auto speech/LLM, cooldown spans semantic changes',async()=>{
 const h=harness({intervalMs:1000,cooldownMs:20000});h.busy=true;for(const t of [0,1000,2000,3000])h.sample(t);assert.equal(h.spoken.length,0);assert.equal(h.requests.length,0);
 h.busy=false;h.sample(4000);h.requests[0].resolve(null);await new Promise(r=>setImmediate(r));
 for(const t of [5000,6000,7000,8000])h.sample(t,'right-arm-elevation',2);assert.equal(h.requests.length,1);
 h.sample(24000,'right-arm-elevation',2);assert.equal(h.requests.length,2);assert.equal(h.router.diagnostics.queueSize,0);
});
test('automatic explanation validation and preferences reject unsafe/new movement text',()=>{
 for(const text of ['姿勢正確，繼續。','換邊並向後仰。','下蹲十次。','左手上舉。','轉成 90 度。','abc'])assert.equal(validHintExplanation(text),null);
 assert.ok(validHintExplanation('影像角度有差距，請維持舒適幅度。'));
 let saved;const p=hintSpeechPreferences(()=>({getItem:()=>null,setItem:(_,v)=>saved=v}));assert.equal(p.value.intervalMs,15000);p.set({intervalMs:10000,cooldownMs:60000});assert.match(saved,/60000/);p.set({intervalMs:1});assert.equal(p.value.intervalMs,15000);
});
