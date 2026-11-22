import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setupAvatarPanel} from '../src/avatar-panel.js';
import {AVATAR_VIEWS} from '../src/avatar-profile.js';
const flush=()=>new Promise(r=>setImmediate(r)),profile=()=>({schema:2,template:'luna-v1',referenceArmDeg:30,views:Object.fromEntries(AVATAR_VIEWS.map(k=>[k,new Blob(['jpeg'],{type:'image/jpeg'})]))});
function harness({stored=null,saveFails=false,removeFails=false,load=null,build=null}={}){
 const nodes=new Map(),events={},models=[],writes=[];let saved=stored;
 const ctx={clearRect(){},strokeRect(){},translate(){},scale(){},fillRect(){},drawImage(){},beginPath(){},ellipse(){},stroke(){},setLineDash(){},moveTo(){},lineTo(){}};
 const make=()=>({width:512,height:512,value:'',checked:false,files:[],open:false,disabled:false,hidden:false,listeners:{},getContext:()=>ctx,toBlob:fn=>fn(new Blob(['jpeg'],{type:'image/jpeg'})),addEventListener(k,fn){this.listeners[k]=fn;},removeAttribute(){},scrollIntoView(){}});
 const doc={createElement:make,getElementById(id){if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);}},el=id=>doc.getElementById('avatar-'+id);
 for(const [key,v] of Object.entries({view:'front',zoom:1,x:.5,y:.5,'reference-angle':30}))el(key).value=String(v);
 const human={replaceAvatar(m){models.push(m);return true;}},store={load:load||async function(){return saved;},async save(p){if(saveFails)throw Error();writes.push(p);saved=p;},async remove(){if(removeFails)throw Error();saved=null;},close(){}};
 const panel=setupAvatarPanel({document:doc,window:{addEventListener:(k,f)=>events[k]=f},human,store,findBounds:()=>({x:0,y:0,width:512,height:1024}),decode:async()=>make(),build:build||async function(){return new THREE.Group();}});
 return {panel,el,events,models,writes,get saved(){return saved;},async click(id){el(id).listeners.click();await flush();},async photo(){el('consent').checked=true;el('consent').listeners.change();for(const key of ['photo','photo-side','photo-back']){el(key).files=[new Blob(['source-photo'],{type:'image/jpeg'})];el(key).listeners.change();await flush();}},dispose(){panel.dispose();}};
}
test('consent gates photo; preview never stores; cancel restores default and releases source',async()=>{
 const h=harness();assert.equal(h.el('photo').disabled,true);await h.photo();assert.equal(h.el('preview').disabled,false);await h.click('preview');assert.equal(h.panel.diagnostics.previewing,true);assert.equal(h.writes.length,0);await h.click('cancel');assert.equal(h.panel.diagnostics.previewing,false);assert.equal(h.panel.diagnostics.sourceRetained,false);assert.equal(h.models.at(-1).name,'Yoga2MaleStudent');h.dispose();
});
test('explicit save persists only derived crop; reload, edit and delete restore standard avatar',async()=>{
 const h=harness();await h.photo();await h.click('preview');await h.click('save');assert.equal(h.writes.length,1);assert.equal(h.saved.views.front.size,4);assert.equal(h.panel.diagnostics.stored,true);assert.equal(h.panel.diagnostics.sourceRetained,false);assert.doesNotMatch(JSON.stringify(h.panel.diagnostics),/source-photo|appearance|jpeg/);
 const next=harness({stored:h.saved});await next.panel.restore();assert.equal(next.models.length,1);assert.equal(next.panel.diagnostics.stored,true);await next.click('delete');assert.equal(next.saved,null);assert.equal(next.panel.diagnostics.mode,'default');assert.equal(next.models.at(-1).name,'Yoga2MaleStudent');h.dispose();next.dispose();
});
test('session-only apply preserves an existing saved profile; quota failure permits retry or cancel',async()=>{
 const old=profile(),h=harness({stored:old});await h.panel.restore();await h.photo();await h.click('preview');await h.click('apply');assert.equal(h.saved,old);assert.equal(h.panel.diagnostics.stored,false);assert.equal(h.panel.diagnostics.savedOnDevice,true);h.dispose();
 const bad=harness({saveFails:true});await bad.photo();await bad.click('preview');await bad.click('save');assert.equal(bad.panel.diagnostics.stored,false);assert.equal(bad.panel.diagnostics.previewing,true);assert.equal(bad.el('save').disabled,false);await bad.click('cancel');assert.equal(bad.panel.diagnostics.mode,'default');bad.dispose();
});
test('late restore cannot replace new editing work; failed deletion never claims stored data was erased',async()=>{
 let resolve;const h=harness({load:()=>new Promise(r=>resolve=r)}),pending=h.panel.restore();await h.photo();resolve(profile());await pending;assert.equal(h.models.length,0);h.dispose();
 const old=profile(),bad=harness({stored:old,removeFails:true});await bad.panel.restore();await bad.click('delete');assert.equal(bad.panel.diagnostics.mode,'default');assert.equal(bad.saved,old);assert.match(bad.el('status').textContent,/刪除失敗/);bad.dispose();
});
test('closing photo editor or leaving page clears unconfirmed preview and source',async()=>{
 const h=harness();await h.photo();await h.click('preview');h.el('editor').open=false;h.el('editor').listeners.toggle();await flush();assert.equal(h.panel.diagnostics.previewing,false);assert.equal(h.panel.diagnostics.sourceRetained,false);
 await h.photo();await h.click('preview');h.events.pagehide();await flush();assert.equal(h.panel.diagnostics.previewing,false);assert.equal(h.panel.diagnostics.sourceRetained,false);h.dispose();
});

test('revoking consent discards unconfirmed preview without persisting a photo',async()=>{
 const h=harness();await h.photo();await h.click('preview');h.el('consent').checked=false;h.el('consent').listeners.change();await flush();assert.equal(h.panel.diagnostics.previewing,false);assert.equal(h.panel.diagnostics.sourceRetained,false);assert.equal(h.writes.length,0);h.dispose();
});

test('all three input views are required before generation; editing saved profile restores three sources',async()=>{
 const h=harness();h.el('consent').checked=true;h.el('consent').listeners.change();h.el('photo').files=[new Blob(['front'],{type:'image/jpeg'})];h.el('photo').listeners.change();await flush();assert.equal(h.panel.diagnostics.sourceCount,1);assert.equal(h.el('preview').disabled,true);assert.match(h.el('status').textContent,/1\/3/);h.dispose();
 const full=harness({stored:profile()});await full.panel.restore();await full.click('edit');assert.equal(full.panel.diagnostics.sourceCount,3);assert.equal(full.el('preview').disabled,false);full.dispose();
});
