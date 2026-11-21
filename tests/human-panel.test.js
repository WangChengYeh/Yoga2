import test from 'node:test';
import assert from 'node:assert/strict';
import { setupHumanPanel } from '../src/human-panel.js';
function harness() {
  const elements=new Map(),layouts=[],placements=[];let clears=0,disposed=0;
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',value:id==='human-x'?'0.72':'1',attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;}});return elements.get(id);}};
  const panel=setupHumanPanel({document,onLayout:v=>layouts.push(v),createLayer:()=>({clear:()=>clears++,dispose:()=>disposed++,apply(){},setPlacement:v=>placements.push(v),update(){}})});
  const el=id=>document.getElementById(id),click=id=>el(id).listeners.click();
  return {panel,el,click,layouts,placements,get clears(){return clears;},get disposed(){return disposed;}};
}
test('opening camera automatically enters the scene once ready; stopping camera also leaves',()=>{
  const h=harness();assert.equal(h.el('human-scale').disabled,true);h.panel.attach({});
  assert.equal(h.panel.context.segment,false);h.panel.cameraState(true);
  assert.equal(h.el('human-scale').disabled,false);assert.equal(h.panel.context.segment,true);assert.deepEqual(h.layouts,[true]);
  h.panel.stale();assert.match(h.el('human-status').textContent,/隱藏/);assert.deepEqual(h.layouts,[true]);
  h.panel.cameraState(false);assert.equal(h.el('human-scale').disabled,true);assert.equal(h.panel.context.segment,false);assert.deepEqual(h.layouts,[true,false]);
});
test('camera opened before the coach is ready enters automatically after scene attachment',()=>{
  const h=harness();h.panel.cameraState(true);assert.equal(h.panel.context.segment,false);
  h.panel.attach({});assert.equal(h.panel.context.segment,true);assert.deepEqual(h.layouts,[true]);
});
test('sliders adjust scene placement and alignment invalidates in-flight data',()=>{
  const h=harness();h.panel.attach({});h.panel.cameraState(true);
  h.el('human-x').value='-0.4';h.el('human-scale').value='1.2';h.el('human-scale').listeners.input();
  assert.deepEqual(h.placements,[{x:-.4,scale:1.2}]);assert.equal(h.el('human-size').textContent,'120%');
  const old=h.panel.context.humanToken;h.click('human-align');assert.ok(h.panel.context.humanToken>old);assert.match(h.el('human-status').textContent,/重新校準/);
  h.panel.dispose();assert.equal(h.disposed,1);assert.equal(h.panel.context.segment,false);
});
test('camera restart after background re-enters automatically without reloading the scene',()=>{
  const h=harness();h.panel.attach({});h.panel.cameraState(true);const old=h.panel.context.humanToken;
  h.panel.cameraState(false);h.panel.cameraState(true);
  assert.equal(h.panel.context.segment,true);assert.ok(h.panel.context.humanToken>old);assert.deepEqual(h.layouts,[true,false,true]);
});
test('repeated active notifications do not toggle the human off or reframe again',()=>{
  const h=harness();h.panel.attach({});h.panel.cameraState(true);const token=h.panel.context.humanToken;
  h.panel.cameraState(true);assert.equal(h.panel.context.segment,true);assert.equal(h.panel.context.humanToken,token);assert.deepEqual(h.layouts,[true]);
});

function boneHarness() {
  const elements=new Map();let created=0,disposed=0,frames=0,lastPose;
  const el=id=>{if(!elements.has(id))elements.set(id,{checked:id==='ai-skeleton-toggle',value:'1',listeners:{},setAttribute(){},addEventListener(k,fn){this.listeners[k]=fn;},textContent:''});return elements.get(id);};
  let mesh={};
  const panel=setupHumanPanel({document:{getElementById:el},createLayer:()=>({get mesh(){return mesh;},apply(){mesh={};frames++;},clear(){mesh=null;},dispose(){mesh=null;},update(){}}),createSkeleton:()=>{created++;return {update(p){lastPose=p;},clear(){},dispose(){disposed++;}};}});
  panel.attach({});panel.cameraState(true);
  const data=()=>({capturedAt:100,context:{...panel.context},brightness:100,landmarks:[Array.from({length:33},(_,i)=>({x:i===23?.4:i===24?.6:.5,y:i===0?.15:i===31||i===32?.9:.5,visibility:1}))],segmentation:{width:2,height:2,confidence:new Float32Array([0,1,0,1]),frame:{width:2,height:2,rgba:new Uint8ClampedArray(16).fill(255)}}});
  return {panel,el,data,get created(){return created;},get disposed(){return disposed;},get frames(){return frames;},get lastPose(){return lastPose;}};
}
test('AI skeleton switch hides only bones while camera segmentation and cutout keep running',()=>{
  const h=boneHarness();h.panel.accept(h.data(),200);assert.equal(h.created,1);assert.ok(h.lastPose.edges.length>0);
  h.el('ai-skeleton-toggle').checked=false;h.el('ai-skeleton-toggle').listeners.change();assert.equal(h.disposed,1);assert.equal(h.panel.context.segment,true);
  h.panel.accept(h.data(),300);assert.equal(h.created,1);assert.equal(h.frames,2);
  h.el('ai-skeleton-toggle').checked=true;h.el('ai-skeleton-toggle').listeners.change();h.panel.accept(h.data(),400);assert.equal(h.created,2);
});
test('camera off, watchdog, late old generation and render-time expiry cannot retain stale AI bones',()=>{
  for(const invalidate of [h=>h.panel.cameraState(false),h=>h.panel.stale(),h=>h.panel.update({},1700),h=>{const old=h.data();old.context.humanToken--;h.panel.accept(old,300);}]){
    const h=boneHarness();h.panel.accept(h.data(),200);assert.equal(h.created,1);invalidate(h);assert.equal(h.disposed,1);
  }
});
test('uncertain/no pose clears bone geometry while a valid portrait cutout remains visible',()=>{
  const h=boneHarness();const d=h.data();d.landmarks=[];h.panel.accept(d,200);
  assert.equal(h.frames,1);assert.equal(h.lastPose.edges.length,0);assert.match(h.el('skeleton-status').textContent,/尚未辨識/);assert.equal(h.panel.context.segment,true);
});
test('report keeps the raw inference frame matching the displayed cutout and drops it on camera off',()=>{
  const h=boneHarness(),d=h.data();h.panel.accept(d,200);const snapshot=h.panel.snapshot;
  assert.equal(snapshot.frame,d.segmentation.frame);assert.equal(snapshot.capturedAt,100);assert.equal(snapshot.completedAt,200);assert.equal(snapshot.inScene,true);
  h.panel.cameraState(false);assert.equal(h.panel.snapshot,null);
});
test('rejected segmentation retains raw input for diagnostics but never claims it is in the scene',()=>{
  const h=boneHarness(),d=h.data();d.landmarks=[[],[]];h.panel.accept(d,200);
  assert.equal(h.panel.snapshot.frame,d.segmentation.frame);assert.equal(h.panel.snapshot.inScene,false);
  h.panel.cameraState(false);assert.equal(h.panel.snapshot,null);
});
