import test from 'node:test';
import assert from 'node:assert/strict';
import {humanObservation,humanContext,coachContext,sensorContext} from '../src/coach-context.js';
import {localAIMessages,LocalCoachAI} from '../src/local-ai.js';
import {guidanceMessages,AIGuidance} from '../src/ai-guidance.js';
import {guidanceAt} from '../src/guidance.js';
const state={time:7,playing:true,speed:.5},frame={lesson:{id:'reach'},localTime:7};
function sample(){return humanObservation({capturedAt:100,context:{frame},brightness:100,landmarks:[Array.from({length:33},()=>({x:.4,y:.2,z:-.1,visibility:.9}))]}, {code:'reach-seen',message:'雙手高於頭部',valid:true},{code:'reach-seen',message:'雙手高於頭部',valid:true});}
function context(){return {capturedAtMs:200,human:humanContext(sample(),{now:200,phase:'active',lesson:'reach'}),coach:coachContext({points:[[0,1,0],[.5,2,0]],edges:[[0,1]]},{now:200,names:['Hips','Head'],lesson:'reach',time:7,ready:true})};}
test('camera observation includes all 33 indexed joints with confidence and missing joints as null',()=>{
 const s=sample();assert.equal(s.joints.length,33);assert.deepEqual(s.joints[15],[400,200,-100,900]);
 const data={capturedAt:100,context:{frame},landmarks:[[...Array(33)].map(()=>({x:2,y:.3,visibility:1}))]};assert.ok(humanObservation(data,{},{}).joints.every(p=>p===null));
 data.landmarks.push([]);assert.ok(humanObservation(data,{},{}).joints.every(p=>p===null));
});
test('stale, wrong lesson and closed camera cannot expose old skeleton as a fresh observation',()=>{
 for(const opts of [{now:2000,phase:'active',lesson:'reach'},{now:200,phase:'off',lesson:'reach'},{now:200,phase:'active',lesson:'side'},{now:0,phase:'active',lesson:'reach'}]){
 const result=humanContext(sample(),opts);assert.equal(result.fresh,false);assert.deepEqual(result.joints,[]);assert.equal(result.observation.valid,false);}
});
test('coach bones remain independent of overlay visibility and preserve 3D named joints and edges',()=>{
 const c=context().coach;assert.equal(c.ready,true);assert.deepEqual(c.joints,[[0,1000,0],[500,2000,0]]);assert.deepEqual(c.order,['Hips','Head']);assert.match(c.coordinates,/not human/);
 assert.deepEqual(coachContext(null,{ready:false}).joints,[]);
});
test('dialogue and guidance prompts include both skeletons, observation and playback context',()=>{
 const c=context(),messages=localAIMessages('我的動作呢',state,[],c),cue=guidanceMessages(guidanceAt(6),state,c);
 for(const m of [messages[1],cue[1]]){assert.match(m.content,/reach-seen/);assert.match(m.content,/Hips/);assert.match(m.content,/400,200,-100,900/);}
 assert.match(messages[0].content,/stable.valid/);assert.match(messages[1].content,/速度：0.5/);assert.match(cue[0].content,/未來/);
});
test('sensor allowlist bounds numeric data and strips pixels, transcript and arbitrary diagnostics',()=>{
 const c=context();c.human.rgba='private-image';c.human.joints.push(...Array(100).fill([1,2,3,4]));c.coach.secret='private';c.interaction={listening:true,transcript:'private-speech'};
 const result=sensorContext(c);assert.equal(result.human.joints.length,33);assert.doesNotMatch(JSON.stringify(result),/private|rgba|transcript|secret/);
 c.human.fresh=false;assert.deepEqual(sensorContext(c).human.joints,[]);
});
test('live guidance requests take a fresh context snapshot without changing target cue timing',()=>{
 let got;const ai={ready:true,guide:(cue,state,sensors)=>{got={cue,state,sensors};return Promise.resolve(null);}};
 const g=new AIGuidance({ai,getState:()=>({...state,ready:true}),getContext:context,speak(){}});g.update();assert.equal(got.cue.at,10);assert.equal(got.sensors.coach.courseTime,7);assert.equal(got.sensors.human.fresh,true);g.cancel();
});
test('4K compresses only conversation history while 16K carries six exchanges; both keep full sensor snapshot',()=>{
 const history=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(512)}));
 const small=localAIMessages('問題',state,history,context(),4096),large=localAIMessages('問題',state,history,context(),16384);
 assert.equal(small.length,4);assert.equal(large.length,14);assert.equal(small[1].content.length,96);assert.equal(large[1].content.length,512);assert.equal(small.at(-1).content,large.at(-1).content);
});
