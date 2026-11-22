import test from 'node:test';import assert from 'node:assert/strict';import {WorkloadScheduler} from '../src/workload-scheduler.js';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('one heavy workload at a time, AI precedes queued vision, and release is idempotent',async()=>{
 const s=new WorkloadScheduler(),first=await s.acquire('vision-load');let visionReady=false;const vision=s.acquire('vision-frame').then(r=>{visionReady=true;return r;});const ai=s.acquire('ai-inference');assert.equal(s.profile().renderFPS,15);first();const ar=await ai;assert.equal(visionReady,false);assert.equal(s.diagnostics.active.kind,'ai-inference');ar();ar();const vr=await vision;assert.equal(s.diagnostics.active.kind,'vision-frame');vr();assert.equal(s.diagnostics.completed,3);assert.equal(s.diagnostics.active,null);
});
test('cancelling a running job cannot release the lane before its actual operation settles',async()=>{
 const s=new WorkloadScheduler(),a=new AbortController(),d=defer();const job=s.run('vision-frame',()=>d.promise,{signal:a.signal});await Promise.resolve();const next=s.acquire('ai-inference');a.abort();assert.equal(s.diagnostics.active.kind,'vision-frame');d.resolve();await job;const release=await next;assert.equal(s.diagnostics.active.kind,'ai-inference');release();
});
test('background cancels queued work and blocks new admissions, foreground allows explicit new work',async()=>{
 const s=new WorkloadScheduler(),release=await s.acquire('ai-load'),queued=s.acquire('vision-frame');const rejected=assert.rejects(queued,{name:'AbortError'});s.setHidden(true);await rejected;await assert.rejects(s.acquire('vision-load'),{name:'AbortError'});assert.equal(s.profile().renderFPS,0);release();s.setHidden(false);const next=await s.acquire('vision-frame');next();
});
test('aborted queued requests leave no pending lane and fatal scene blocking survives foreground',async()=>{
 const s=new WorkloadScheduler(),release=await s.acquire('vision-frame'),a=new AbortController(),queued=s.acquire('ai-inference',{signal:a.signal});const rejected=assert.rejects(queued,{name:'AbortError'});a.abort();await rejected;assert.equal(s.diagnostics.queued.length,0);s.block('scene-error');release();s.setHidden(false);assert.equal(s.profile().renderFPS,0);await assert.rejects(s.acquire('ai-load'),{name:'AbortError'});
});
test('render caps reflect normal/camera/power/AI policy and diagnostic time excludes task contents',async()=>{
 let time=0;const s=new WorkloadScheduler({now:()=>time});assert.equal(s.profile().renderFPS,30);assert.equal(s.profile({camera:true}).renderFPS,30);assert.equal(s.profile({powerSaving:true}).renderFPS,24);const release=await s.acquire('ai-load');time=500;assert.equal(s.diagnostics.active.runningMs,500);assert.equal(s.profile().renderFPS,15);assert.doesNotMatch(JSON.stringify(s.diagnostics),/resolve|reject|signal/);release();await assert.rejects(s.acquire('unknown'),TypeError);
});
test('render selection never exceeds user cap and busy/automatic/power caps compose',async()=>{const s=new WorkloadScheduler();assert.equal(s.profile({renderFPS:60,renderCap:20}).renderFPS,20);const release=await s.acquire('ai-inference');assert.equal(s.profile({renderFPS:10,renderCap:15}).renderFPS,10);release();assert.equal(s.profile({renderFPS:30,powerSaving:true}).renderFPS,24);});

test('latest-wins replaces only queued work and expiry cannot release an active native operation',async()=>{
 let now=0;const timers=new Map(),s=new WorkloadScheduler({now:()=>now,setTimer:(fn)=>{const id=Symbol();timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id)}),release=await s.acquire('vision-load');
 const old=s.acquire('vision-frame',{key:'pose',ttlMs:1000}),rejected=assert.rejects(old,{code:'WORK_REPLACED'});const fresh=s.acquire('vision-frame',{key:'pose',ttlMs:1000});await rejected;
 const expired=assert.rejects(fresh,{code:'WORK_EXPIRED'});now=1100;for(const fn of [...timers.values()])fn();await expired;assert.equal(s.diagnostics.active.kind,'vision-load');assert.equal(s.diagnostics.queued.length,0);assert.equal(s.diagnostics.dropped,2);release();assert.equal(timers.size,0);
});
test('user reply outranks vision and optional explanation; elapsed TTL checked even when timers are delayed',async()=>{
 let now=0;const s=new WorkloadScheduler({now:()=>now,setTimer:()=>0,clearTimer:()=>{}}),r=await s.acquire('scene-load');
 const expired=s.acquire('ai-guidance',{ttlMs:1000}),rejected=assert.rejects(expired,{code:'WORK_EXPIRED'});const v=s.acquire('vision-frame'),a=s.acquire('ai-inference');now=2000;r();const ar=await a;ar();const vr=await v;vr();await rejected;assert.equal(s.diagnostics.active,null);
});
