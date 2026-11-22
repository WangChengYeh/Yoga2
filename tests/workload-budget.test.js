import test from 'node:test';
import assert from 'node:assert/strict';
import {DualWorkload} from '../src/workload-budget.js';
function harness(){let t=0;const b=new DualWorkload({now:()=>t});return {b,set:t0=>t=t0,step(opts={},cpu=0){b.recordCPU(cpu);t+=1000;return b.sample(opts);}};}
test('CPU and GPU factors degrade independently, with bounded steps and cooldown',()=>{
 const h=harness();for(let i=0;i<3;i++)h.step({},850);assert.equal(h.b.cpuFactor,.75);assert.equal(h.b.gpuFactor,1);
 for(let i=0;i<2;i++)h.step({},900);assert.equal(h.b.cpuFactor,.75);for(let i=0;i<3;i++)h.step({},900);assert.equal(h.b.cpuFactor,.5);
 const g=harness();for(let i=0;i<3;i++)g.step({completion:{supported:true,pending:4,oldestPendingMs:700}});assert.equal(g.b.gpuFactor,.75);assert.equal(g.b.cpuFactor,1);assert.equal(g.b.caps.pixelScale,Math.sqrt(.75));
});
test('sustained healthy completion evidence recovers one step after 30 seconds; unknown GPU cannot recover it',()=>{
 const h=harness();h.b.pressure('gpu','deadline');assert.equal(h.b.gpuFactor,.75);
 for(let i=0;i<45;i++)h.step({completion:{supported:false,pending:0}});assert.equal(h.b.gpuFactor,.75);
 for(let i=0;i<10;i++){h.b.recordGPU({submittedMs:i,completedMs:i+8});h.step({completion:{supported:true,pending:0}});}assert.equal(h.b.gpuFactor,1);
});
test('manual limits persist across automatic disable; invalid values normalize and rates preserve nonzero fallbacks',()=>{
 const h=harness();h.b.configure({cpuFactor:.25,gpuFactor:.5,auto:false});h.b.pressure('cpu','busy');assert.equal(h.b.cpuFactor,.25);assert.equal(h.b.gpuFactor,.5);assert.equal(h.b.caps.hintMs,1000);assert.equal(h.b.caps.optionalLLM,false);assert.equal(h.b.caps.maxSide,256);
 h.b.configure({cpuFactor:NaN,gpuFactor:0});assert.equal(h.b.cpuFactor,1);assert.equal(h.b.gpuFactor,1);
});
test('completion latency, event-loop delay and JS heap pressure are explicit independent proxies',()=>{
 const g=harness();for(let i=0;i<3;i++){g.b.recordGPU({submittedMs:100,completedMs:400});g.step({completion:{supported:true,pending:0}});}assert.equal(g.b.gpuFactor,.75);assert.equal(g.b.cpuFactor,1);
 const c=harness();for(let i=0;i<3;i++)c.step({loopDelayMs:250});assert.equal(c.b.cpuFactor,.75);assert.equal(c.b.gpuFactor,1);
 const m=harness();for(let i=0;i<3;i++)m.step({memoryRatio:.9});assert.equal(m.b.cpu.reason,'js-heap-pressure');assert.match(m.b.diagnostics.measurement,/not hardware/);
});
test('background and long suspension cannot create false healthy recovery or pressure',()=>{
 const h=harness();h.b.pressure('cpu','slow');h.b.setHidden(true);h.b.recordCPU(9999);h.set(100000);h.b.sample({loopDelayMs:9999});assert.equal(h.b.cpuFactor,.75);h.b.setHidden(false);h.set(120000);h.b.sample({loopDelayMs:9999});assert.equal(h.b.cpuFactor,.75);assert.equal(h.b.cpu.good,0);
});
test('30-minute synthetic overload/recovery replay keeps bounded factors/history and restores healthy quality',()=>{
 const h=harness();let minimum=1;for(let second=0;second<1800;second++){
  const busy=second<90||second>=600&&second<690||second>=1200&&second<1290;
  h.b.recordGPU({submittedMs:0,completedMs:busy?400:8});h.step({completion:{supported:true,pending:0}},busy?900:100);
  minimum=Math.min(minimum,h.b.cpuFactor,h.b.gpuFactor);assert.ok(h.b.diagnostics.history.length<=32);
 }
 assert.equal(minimum,.25);assert.equal(h.b.cpuFactor,1);assert.equal(h.b.gpuFactor,1);assert.equal(h.b.windows,1800);
});
