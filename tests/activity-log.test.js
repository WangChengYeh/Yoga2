import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityLog,trackActivityControls} from '../src/activity-log.js';
const frame={lesson:{id:'reach'},localTime:7,complete:false};
function harness(){let time=0;const state={time:7,playing:true,speed:1};return {state,setTime:t=>time=t,log:createActivityLog({clock:()=>time,now:()=>new Date(time).toISOString(),getState:()=>state})};}
test('human samples retain visible body movement and aligned course time without faces or hidden joints',()=>{
 const h=harness(),points=Array.from({length:33},()=>({x:.5,y:.2,visibility:1}));points[15].visibility=.1;
 const data={capturedAt:100,landmarks:[points],context:{frame},private:'secret'};
 h.log.pose(data,{code:'reach-seen',valid:true},{code:'stabilizing'});let sample=h.log.diagnostics.poses[0];
 assert.equal(sample.courseTime,7);assert.equal(sample.phase,'reach-hold');assert.equal(sample.capturedAtMs,100);assert.ok(sample.joints.every(p=>p.index>=11&&p.index!==15));
 points[16].y=.8;h.setTime(500);h.log.pose(data,{code:'reach-hands'},{code:'stabilizing'});assert.equal(h.log.diagnostics.poses.length,1);
 h.setTime(1000);h.log.pose(data,{code:'reach-hands'},{code:'stabilizing'});assert.equal(h.log.diagnostics.poses[1].joints.find(p=>p.index===16).y,.8);assert.doesNotMatch(JSON.stringify(h.log.diagnostics),/secret|private/);
});
test('rings are bounded, snapshots isolated, unknown poses do not invent joints',()=>{
 const h=harness();for(let i=0;i<300;i++){h.setTime(i*1000);h.log.record('control',{control:'seek',value:'12',text:'secret'});h.log.pose({landmarks:[],context:{frame}},{code:'missing'},{code:'missing'});}
 const d=h.log.diagnostics;assert.equal(d.events.length,256);assert.equal(d.poses.length,120);assert.deepEqual(d.poses[0].joints,[]);assert.equal(d.poses[0].people,0);d.events.length=0;assert.equal(h.log.diagnostics.events.length,256);assert.doesNotMatch(JSON.stringify(d),/secret/);
});
test('course phase transitions and voice events share ordered timestamps and final playback state',()=>{
 const h=harness();h.log.course(frame);h.log.course(frame);h.state.playing=false;h.log.record('voice',{phase:'thinking'});h.log.course({...frame,lesson:{id:'side'},localTime:9});
 const e=h.log.diagnostics.events;assert.equal(e.length,3);assert.equal(e[1].playing,false);assert.equal(e[2].phase,'side-right');assert.ok(e[0].sequence<e[1].sequence);
});
test('controls record selected lesson/speed/checkbox only, never text input',()=>{
 const handlers={},doc={addEventListener:(t,f)=>handlers[t]=f,removeEventListener:t=>delete handlers[t]},h=harness();const dispose=trackActivityControls({doc,log:h.log});
 const fire=(type,el)=>handlers[type]({type,target:{closest:()=>el}});
 fire('click',{tagName:'BUTTON',dataset:{lessonIndex:'2'}});fire('click',{tagName:'BUTTON',dataset:{speed:'0.5'}});fire('change',{tagName:'INPUT',id:'ai-skeleton-toggle',type:'checkbox',checked:false});fire('change',{tagName:'INPUT',id:'voice-question',value:'secret'});
 assert.deepEqual(h.log.diagnostics.events.map(e=>[e.control,e.value]),[['lesson','2'],['speed','0.5'],['ai-skeleton-toggle','false']]);dispose();assert.equal(Object.keys(handlers).length,0);
});
