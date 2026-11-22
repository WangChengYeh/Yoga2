import test from 'node:test';
import assert from 'node:assert/strict';
import {trackWebGPU} from '../src/gpu-memory-tracker.js';
test('tracking preserves native buffers and counts declared capacities without retaining references or double destroy',()=>{
 class Buffer{constructor(size){this.size=size;}destroy(){this.destroyed=true;}}class Device{createBuffer(d){if(d.size<0)throw new RangeError('private');return new Buffer(d.size);}}
 const original=Device.prototype.createBuffer,events=[],t=trackWebGPU({Device,Buffer,onEvent:e=>events.push(e)}),d=new Device(),a=d.createBuffer({size:100}),b=d.createBuffer({size:200});assert.equal(a.size,100);assert.equal(t.snapshot.outstandingDeclaredBytes,300);a.destroy();a.destroy();assert.equal(t.snapshot.destroyed,1);assert.equal(t.snapshot.outstandingDeclaredBytes,200);assert.equal(t.snapshot.peakDeclaredBytes,300);assert.throws(()=>d.createBuffer({size:-1}),RangeError);assert.equal(t.snapshot.allocationFailures,1);assert.equal(events[0].code,'RangeError');assert.doesNotMatch(JSON.stringify(events),/private/);b.destroy();t.dispose();assert.equal(Device.prototype.createBuffer,original);
});
test('device lost and uncaptured errors record reason/category without message contents',async()=>{
 let lose,handler;const device={lost:new Promise(r=>lose=r),addEventListener:(n,f)=>handler=f};class Adapter{requestDevice(){return Promise.resolve(device);}}const events=[],t=trackWebGPU({Adapter,onEvent:e=>events.push(e)});assert.equal(await new Adapter().requestDevice(),device);class GPUOutOfMemoryError{}handler({error:new GPUOutOfMemoryError()});assert.equal(t.snapshot.lastDeviceError.name,'GPUOutOfMemoryError');lose({reason:'unknown',message:'private driver message'});await Promise.resolve();assert.equal(t.snapshot.lastDeviceLost.reason,'unknown');assert.equal(events.length,2);assert.doesNotMatch(JSON.stringify(t.snapshot),/private driver/);t.dispose();
});
test('unsupported or readonly GPU prototypes remain operational with availability false',()=>{
 class Device{}Object.defineProperty(Device.prototype,'createBuffer',{value:()=>({size:1}),writable:false});const t=trackWebGPU({Device});assert.equal(t.snapshot.supported.createBuffer,false);assert.equal(t.snapshot.outstandingDeclaredBytes,null);assert.equal(new Device().createBuffer().size,1);t.dispose();
});
