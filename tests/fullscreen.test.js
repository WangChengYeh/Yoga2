import test from 'node:test';
import assert from 'node:assert/strict';
import { setupFullscreen } from '../src/fullscreen.js';
function harness(request) {
  const events={},windowEvents={},classes=new Set(),changes=[],scrolls=[];let restored=0;
  const button={textContent:'全螢幕',attrs:{},addEventListener:(name,fn)=>events.click=fn,setAttribute(k,v){this.attrs[k]=v;}};
  const studio={attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  if(request)studio.requestFullscreen=request;
  const document={body:{classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}}},activeElement:{focus:()=>restored++},querySelector:()=>studio,getElementById:()=>button,addEventListener:(name,fn)=>events[name]=fn};
  const window={scrollX:0,scrollY:320,scrollTo:(...xy)=>scrolls.push(xy),addEventListener:(name,fn)=>windowEvents[name]=fn};
  const api=setupFullscreen({document,window,onChange:v=>changes.push(v)});
  return {api,document,studio,button,events,windowEvents,classes,changes,scrolls,get restored(){return restored;},click:()=>events.click()};
}
test('iPhone fallback enters viewport fullscreen without a native API, then restores scroll and focus',()=>{
  const h=harness();h.click();assert.equal(h.api.active,true);assert.ok(h.classes.has('practice-fullscreen'));assert.equal(h.button.textContent,'退出全螢幕');assert.equal(h.button.attrs['aria-pressed'],'true');
  h.click();assert.equal(h.api.active,false);assert.equal(h.classes.size,0);assert.deepEqual(h.scrolls,[[0,320]]);assert.equal(h.restored,1);assert.deepEqual(h.changes,[true,false]);
});
test('native fullscreen is requested by the click; browser Escape exits viewport mode too',async()=>{
  let requests=0;const h=harness(()=>{requests++;return Promise.resolve();});
  h.click();assert.equal(requests,1);h.document.fullscreenElement=h.studio;h.events.fullscreenchange();
  h.document.fullscreenElement=null;h.events.fullscreenchange();assert.equal(h.api.active,false);assert.deepEqual(h.changes,[true,false]);
});
test('rejected or throwing native fullscreen keeps a working viewport fallback',async()=>{
  for(const request of [()=>Promise.reject(Error('unsupported')),()=>{throw Error('unsupported');}]){
    const h=harness(request);h.click();await Promise.resolve();await Promise.resolve();assert.equal(h.api.active,true);h.events.keydown({key:'Escape'});assert.equal(h.api.active,false);
  }
});
test('leaving explicitly exits owned native fullscreen without affecting another element',async()=>{
  const h=harness();let exits=0;h.document.exitFullscreen=async()=>exits++;
  h.click();h.document.fullscreenElement=h.studio;h.api.exit();assert.equal(exits,1);
  h.click();h.document.fullscreenElement={};h.api.exit();assert.equal(exits,1);
});
test('background exit and a late native entry cannot leave an unwanted fullscreen session',async()=>{
  let resolve;const h=harness(()=>new Promise(r=>resolve=r));let exits=0;h.document.exitFullscreen=async()=>exits++;
  h.click();h.windowEvents.pagehide();assert.equal(h.api.active,false);
  h.document.fullscreenElement=h.studio;resolve();await Promise.resolve();assert.equal(exits,1);assert.equal(h.classes.size,0);
});
