import test from 'node:test';
import assert from 'node:assert/strict';
import {setupHintDisplay} from '../src/hint-display.js';
import {courseFrame} from '../src/course.js';
function harness(interval=250){let now=0,hint=null,frame=courseFrame(8),playing=true;const nodes=new Map(),events={},timers=new Map();let next=0;const document={hidden:false,getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true,dataset:{}});return nodes.get(id);},addEventListener:(k,v)=>events[k]=v,removeEventListener(){}};
 const panel=setupHintDisplay({document,getInterval:()=>interval,getHint:()=>hint,getFrame:()=>frame,isPlaying:()=>playing,isCameraActive:()=>true,now:()=>now,setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
 return {panel,nodes,document,events,timers,set(at,code='left-elbow-bent',value=140){now=at;hint={id:code,code,kind:'hint',message:'留意手肘。',timestamp:at,context:{scope:'reach',generation:1},values:{measured:value,target:180}};panel.refresh();},clear(at){now=at;hint=null;frame=courseFrame(26);panel.refresh();},poll(at){now=at;const f=timers.values().next().value;timers.clear();f();}};}
test('text identity stays stable while independent 4Hz values update; phase/unknown states are immediate',()=>{
 const h=harness();h.set(0);const n=h.panel.diagnostics.textUpdates;h.set(100,'left-elbow-bent',130);assert.match(h.nodes.get('stage-hint-values').textContent,/140/);h.poll(250);assert.match(h.nodes.get('stage-hint-values').textContent,/130/);assert.equal(h.panel.diagnostics.textUpdates,n);
 h.clear(260);assert.doesNotMatch(h.nodes.get('stage-hint-message').textContent,/留意手肘/);assert.equal(h.nodes.get('stage-hint-values').textContent,'');h.panel.dispose();assert.equal(h.timers.size,0);
});
test('background hides stale feedback and stops display timer; return restores current state',()=>{
 const h=harness();h.document.hidden=true;h.events.visibilitychange();assert.equal(h.nodes.get('stage-hint').hidden,true);assert.equal(h.timers.size,0);h.document.hidden=false;h.events.visibilitychange();assert.equal(h.nodes.get('stage-hint').hidden,false);assert.equal(h.timers.size,1);h.panel.dispose();
});

test('CPU budget throttles only repeated numeric updates; semantic/unknown transitions remain immediate',()=>{
 const h=harness(1000);h.set(0);h.set(300,'left-elbow-bent',125);assert.match(h.nodes.get('stage-hint-values').textContent,/140/);h.poll(1000);assert.match(h.nodes.get('stage-hint-values').textContent,/125/);h.clear(1001);assert.equal(h.nodes.get('stage-hint-values').textContent,'');h.panel.dispose();
});
