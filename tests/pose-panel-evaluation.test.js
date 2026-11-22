import test from 'node:test';
import assert from 'node:assert/strict';
import { setupPosePanel } from '../src/pose-panel.js';
import { courseFrame } from '../src/course.js';
import { feedbackKey } from '../src/pose-rules.js';
import { poseSample } from './helpers/pose-samples.js';
function harness(){
 let time=0,courseTime=8,playing=true,options;const timers=new Map(),nodes=new Map(),saved={document:globalThis.document,window:globalThis.window};
 const context={clearRect(){}};
 const document={documentElement:{dataset:{visionRoot:"https://example.invalid/vision/",poseModelUrl:"https://example.invalid/pose.task",segmentationModelUrl:"https://example.invalid/mask.tflite"}},getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',checked:false,hidden:false,style:{},dataset:{},textContent:'',listeners:{},videoWidth:480,videoHeight:640,width:480,height:640,classList:{toggle(){}},setAttribute(){},getContext:()=>context,addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);},createElement:()=>({getContext:()=>null}),querySelector:()=>({classList:{toggle(){}}}),addEventListener(){}};
 globalThis.document=document;globalThis.window={isSecureContext:true,addEventListener(){}};
 const session={phase:'active',stream:null,fpsDiagnostics:{requested:20,negotiated:20,status:'active'},diagnostics:{},setFPS(){},start(){},stop(){}};
 const panel=setupPosePanel({createSession:opts=>{options=opts;return session;},getFrame:()=>courseFrame(courseTime),isPlaying:()=>playing,isPowerSaving:()=>false,now:()=>time,setTimer:(fn,delay)=>{const id=Symbol();timers.set(id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id)});
 options.onState({phase:'active',message:'active',preview:true});
 return {panel,nodes,timers,options,setCourse(value){courseTime=value;panel.contextChanged();},pause(){playing=false;panel.contextChanged();},send(at,settings={}){time=at;const data=poseSample(courseTime,{...settings,capturedAt:at});data.context=options.getContext();options.onResult(data,time);},expire(at){time=at;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}},dispose(){globalThis.document=saved.document;globalThis.window=saved.window;}};
}
test('camera integration exposes stable structured evaluation, expires UI and stops stale praise',()=>{
 const h=harness();try{
  for(const t of [0,250,500])h.send(t,{armOffset:-.7});assert.equal(h.panel.diagnostics.evaluation.status,'correction');assert.equal(h.nodes.get('camera-feedback').dataset.kind,'hint');assert.equal(h.panel.summary.valid,true);
  h.expire(2000);assert.equal(h.panel.summary.valid,false);assert.equal(h.nodes.get('camera-feedback').dataset.kind,'setup');assert.deepEqual(h.panel.diagnostics.evaluation.hints,[]);
  for(const t of [2100,2350,2600])h.send(t);assert.equal(h.panel.diagnostics.evaluation.status,'matched');
  h.pause();assert.equal(h.panel.summary.valid,false);assert.equal(h.timers.size,0);assert.deepEqual(h.panel.diagnostics.evaluation.hints,[]);
 }finally{h.dispose();}
});
test('a previous course result clears feedback; camera stale and off reset structured state',()=>{
 const h=harness();try{
  for(const t of [0,250,500])h.send(t,{armOffset:-.7});h.setCourse(58);
  const old=poseSample(8,{capturedAt:600});old.context.key=feedbackKey(courseFrame(8),true);h.options.onResult(old,600);
  assert.equal(h.panel.summary.valid,false);assert.equal(h.timers.size,0);
  for(const t of [700,950,1200])h.send(t);assert.equal(h.panel.diagnostics.evaluation.status,'matched');
  h.options.onStale();assert.equal(h.panel.summary.valid,false);assert.equal(h.timers.size,0);
  for(const t of [1300,1550,1800])h.send(t);h.options.onState({phase:'off',message:'off',preview:false});
  assert.equal(h.panel.summary.valid,false);assert.equal(h.timers.size,0);assert.deepEqual(h.panel.diagnostics.evaluation.hints,[]);
 }finally{h.dispose();}
});
