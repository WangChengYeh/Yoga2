import test from 'node:test';import assert from 'node:assert/strict';import {TaskPerformance} from '../src/task-performance.js';
const row=(s,k)=>s.tasks.find(t=>t.kind===k);
test('CPU parallel spans double count while GPU overlap is unioned and queues stay separate',()=>{
 let now=0;const p=new TaskPerformance({now:()=>now});now=1000;p.record('pose.cpu',0,1000);p.record('portrait.cpu',0,1000);p.record('ai.gpu',0,1000);p.record('render.gpu',100,600);p.record('vision.wait',0,1000);
 const s=p.summary(1000);assert.equal(s.loading.cpuPercent,200);assert.equal(s.loading.gpuPercent,100);assert.equal(s.loading.gpuMs,1000);assert.equal(row(s,'vision.wait').foregroundPercent,100);assert.equal(row(s,'ai.gpu').channel,'gpu-task');assert.equal(p.diagnostics.recentSpans.length,5);
});
test('background is excluded from denominator and task intervals; returning resumes observation',()=>{
 let now=0;const p=new TaskPerformance({now:()=>now});now=1000;p.setActive(false);now=5000;p.setActive(true);now=6000;p.record('ai.gpu',0,6000);const s=p.summary(6000);assert.equal(s.foregroundMs,2000);assert.equal(s.loading.gpuMs,2000);assert.equal(s.loading.gpuPercent,100);now=7000;assert.equal(p.summary(7000).foregroundMs,3000);
});
test('window edges clip long tasks, zero-duration API calls count once and FPS is observed not requested',()=>{
 let now=0;const p=new TaskPerformance({now:()=>now});now=3000;p.record('ai.gpu',0,3000);p.record('render.gpu',3000,3000);p.point('render.frame');const s=p.summary(1000);assert.equal(s.loading.gpuMs,1000);assert.equal(row(s,'render.frame').count,1);assert.equal(row(s,'render.frame').rate,1);assert.equal(row(s,'render.gpu').averageMs,0);
});
test('collector keeps at most thirty minutes, per-kind recent spans are bounded and exports isolated data',()=>{
 let now=0;const p=new TaskPerformance({now:()=>now});for(let i=0;i<2000;i++){now=i*1000+500;p.record('pose.cpu',now-100,now);}const dump=p.exportTimeline();assert.ok(dump.buckets.length<=1801);assert.equal(dump.recentSpans.length,24);assert.equal(p.summary(1800000).foregroundMs,1800000);dump.buckets[0].tasks['pose.cpu'].ms=999999;assert.notEqual(p.exportTimeline().buckets[0].tasks['pose.cpu'].ms,999999);
});
test('baseline survives settings mutations and reset affects metrics only; invalid input does not grow storage',()=>{
 let now=0;const p=new TaskPerformance({now:()=>now});now=1000;const settings={renderFPS:30};p.record('pose.cpu',0,500);p.markBaseline(60000,settings);settings.renderFPS=10;assert.equal(p.baseline.settings.renderFPS,30);assert.equal(p.baseline.summary.loading.cpuPercent,50);for(const args of [['unknown',0,100],['pose.cpu',100,0],['pose.cpu',NaN,100]])p.record(...args);assert.equal(p.diagnostics.recentSpans.length,1);p.reset();assert.equal(p.baseline,null);assert.equal(p.buckets.size,0);
});
test('dense GPU overlaps and sparse intervals remain bounded and never report more than foreground duration',()=>{
 let now=0;const p=new TaskPerformance({now:()=>now});now=1000;for(let i=0;i<100;i++)p.record('render.gpu',i*10,i*10+1);const s=p.summary(1000);assert.ok(s.loading.gpuPercent<=100);assert.ok(p.exportTimeline().buckets[0].tasks['@gpu'].length<=64);assert.equal(row(s,'render.gpu').count,100);
});
test('sub-millisecond CPU and GPU submission spans retain their full duration instead of being squared',()=>{let now=0;const p=new TaskPerformance({now:()=>now});now=10;p.record('render.cpu',1,1.25);p.record('render.gpu',2,2.5);const s=p.summary(1000);assert.equal(row(s,'render.cpu').ms,.25);assert.equal(row(s,'render.gpu').ms,.5);assert.equal(s.loading.cpuPercent,2.5);assert.equal(s.loading.gpuPercent,5);});
test('submission and SDK return do not count as GPU completion, confirmed intervals include submitted and notified ends',()=>{let now=0;const p=new TaskPerformance({now:()=>now});now=1000;p.record('render.submit',0,2);p.record('ai.wall',0,900);p.record('ai.load',0,500);assert.equal(p.summary(1000).loading.gpuPercent,null);p.record('render.gpu',0,20,{submittedMs:2,source:'webgl-fence'});p.record('ai.gpu',100,1000,{submittedMs:900,source:'webgpu-queue'});assert.equal(p.summary(1000).loading.gpuMs,920);assert.equal(p.summary(1000,500).loading.gpuPercent,84);const span=p.recentSpans.find(s=>s.kind==='ai.gpu');assert.equal(span.completionLatencyMs,100);assert.equal(span.endMs,1000);assert.equal(span.source,'webgpu-queue');});
