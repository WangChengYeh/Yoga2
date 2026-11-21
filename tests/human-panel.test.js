import test from 'node:test';
import assert from 'node:assert/strict';
import { setupHumanPanel } from '../src/human-panel.js';
function harness() {
  const elements=new Map(),layouts=[],placements=[];let clears=0,disposed=0,applied=0;
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',value:id==='human-x'?'0.72':'1',attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;}});return elements.get(id);}};
  const panel=setupHumanPanel({document,onLayout:v=>layouts.push(v),createLayer:()=>({clear:()=>clears++,dispose:()=>disposed++,apply:()=>applied++,setPlacement:v=>placements.push(v),update:()=>{}})});
  const el=id=>document.getElementById(id),click=id=>el(id).listeners.click();
  return {panel,el,click,layouts,placements,get clears(){return clears;},get disposed(){return disposed;},get applied(){return applied;}};
}
test('human UI availability follows camera plus scene, updates labels and reframes only when entering/leaving',()=>{
  const h=harness();assert.equal(h.el('human-toggle').disabled,true);assert.equal(h.el('human-scale').disabled,true);
  h.panel.attach({});assert.equal(h.el('human-toggle').disabled,true);h.panel.cameraState(true);assert.equal(h.el('human-toggle').disabled,false);
  h.click('human-toggle');assert.equal(h.el('human-toggle').attrs['aria-pressed'],'true');assert.equal(h.el('human-toggle').textContent,'真人離場');assert.equal(h.el('human-scale').disabled,false);
  assert.equal(h.panel.context.segment,true);assert.deepEqual(h.layouts,[true]);
  h.panel.stale();assert.match(h.el('human-status').textContent,/隱藏/);assert.deepEqual(h.layouts,[true]);
  h.panel.cameraState(false);assert.equal(h.el('human-toggle').disabled,true);assert.equal(h.el('human-scale').disabled,true);assert.equal(h.panel.context.segment,false);assert.deepEqual(h.layouts,[true,false]);
});
test('human UI sliders adjust scene placement and alignment invalidates in-flight data',()=>{
  const h=harness();h.panel.attach({});h.panel.cameraState(true);h.click('human-toggle');
  h.el('human-x').value='-0.4';h.el('human-scale').value='1.2';h.el('human-scale').listeners.input();
  assert.deepEqual(h.placements,[{x:-.4,scale:1.2}]);assert.equal(h.el('human-size').textContent,'120%');
  const old=h.panel.context.humanToken;h.click('human-align');assert.ok(h.panel.context.humanToken>old);assert.match(h.el('human-status').textContent,/重新對齊/);
  h.panel.dispose();assert.equal(h.disposed,1);assert.equal(h.el('human-toggle').disabled,true);
});

test('restoring after background/camera stop can re-enter without reloading the scene',()=>{
  const h=harness();h.panel.attach({});h.panel.cameraState(true);h.click('human-toggle');
  h.panel.cameraState(false);h.panel.cameraState(true);
  assert.equal(h.el('human-toggle').disabled,false);assert.equal(h.panel.context.segment,false);
  h.click('human-toggle');assert.equal(h.panel.context.segment,true);assert.deepEqual(h.layouts,[true,false,true]);
});
