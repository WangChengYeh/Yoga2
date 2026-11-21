import test from 'node:test';
import assert from 'node:assert/strict';
import {setupRuntimeLog} from '../src/runtime-log.js';
function harness(initial){const values=new Map(initial?[['yoga2.runtime.v1',initial]]:[]),events={},docEvents={};let writes=0;const storage={getItem:k=>values.get(k),setItem:(k,v)=>{writes++;values.set(k,v);}};const win={location:{href:'https://example.test/Yoga2/'},addEventListener:(t,f)=>events[t]=f,removeEventListener:t=>delete events[t]};const doc={hidden:false,addEventListener:(t,f)=>docEvents[t]=f,removeEventListener:t=>delete docEvents[t]};const log=setupRuntimeLog({win,doc,getStorage:()=>storage,now:()=> '2026-11-22T01:02:03Z'});return {log,events,docEvents,values,doc,get writes(){return writes;}};}
test('runtime ring is bounded, deduplicates progress, and persists no arbitrary fields or error text',()=>{
 const h=harness();for(let i=0;i<100;i++)h.log.record('ai',{phase:'loading',question:'private',rgba:[1]});assert.equal(h.writes,2);
 h.events.error({type:'error',error:new Error('private https://example.test/file.js?token=secret out of memory'),filename:'https://cdn.test/app.js?token=secret',lineno:8,colno:3});
 const error=h.log.diagnostics.current.events.at(-1);assert.equal(error.hint,'memory-allocation-text');assert.equal(error.source,'app.js');assert.equal(error.line,8);
 for(let i=0;i<50;i++)h.log.record('phase'+i);assert.equal(h.log.diagnostics.current.events.length,32);assert.doesNotMatch([...h.values.values()].join(''),/private|secret|rgba|question/);h.log.dispose();
});
test('unclean previous session survives reload as evidence but is explicitly not a crash verdict',()=>{
 const first=harness();first.log.record('webgl-context-lost');const saved=first.values.get('yoga2.runtime.v1');const next=harness(saved);
 assert.equal(next.log.diagnostics.previousSessionUnclean,true);assert.equal(next.log.diagnostics.previous.events.at(-1).type,'webgl-context-lost');assert.match(next.log.diagnostics.note,/does not prove a crash/);
 first.log.dispose();next.log.dispose();
});
test('background/pagehide mark inactive, foreground/pageshow resume and disposal removes listeners',()=>{
 const h=harness();h.doc.hidden=true;h.docEvents.visibilitychange();assert.equal(JSON.parse(h.values.get('yoga2.runtime.v1')).active,false);
 h.doc.hidden=false;h.docEvents.visibilitychange();assert.equal(JSON.parse(h.values.get('yoga2.runtime.v1')).active,true);h.events.pagehide();assert.equal(JSON.parse(h.values.get('yoga2.runtime.v1')).active,false);
 h.events.pageshow();assert.equal(h.log.diagnostics.current.active,true);h.log.dispose();assert.equal(Object.keys(h.events).length,0);assert.equal(Object.keys(h.docEvents).length,0);
});
test('denied/corrupt storage cannot break app startup, and previous data is sanitized again',()=>{
 const win={addEventListener(){},removeEventListener(){}},doc={hidden:false,addEventListener(){},removeEventListener(){}};
 const denied=setupRuntimeLog({win,doc,getStorage:()=>{throw new Error('denied');}});assert.equal(denied.diagnostics.persistence,false);denied.record('test');denied.dispose();
 const corrupt=harness('{bad');assert.equal(corrupt.log.diagnostics.previous,null);corrupt.log.dispose();
 const hostile=harness(JSON.stringify({schema:1,version:'0.9.1',active:true,events:[{type:'js-error',at:'now',phase:'test',message:'secret',stack:'private',rgba:[1]}]}));assert.doesNotMatch(JSON.stringify(hostile.log.diagnostics.previous),/secret|private|rgba|message/);hostile.log.dispose();
});
test('unhandled rejection only records safe error category and filename, never prompt content',()=>{
 const h=harness();h.events.unhandledrejection({type:'unhandledrejection',reason:new TypeError('user private question fetch failed')});const event=h.log.diagnostics.current.events.at(-1);
 assert.equal(event.type,'unhandled-rejection');assert.equal(event.name,'TypeError');assert.equal(event.hint,'network-text');assert.doesNotMatch(JSON.stringify(h.log.diagnostics),/private question/);h.log.dispose();
});
test('context mode and null active/loading survive persistent logs and previous-session restoration',()=>{
 const h=harness();h.log.record('ai',{phase:'loading',selected:4096,loading:4096,active:null});h.log.record('ai',{phase:'ready',selected:4096,loading:null,active:4096});h.log.record('webgl-context-lost',{selected:4096,active:4096});const restored=harness(h.values.get('yoga2.runtime.v1'));assert.equal(restored.log.diagnostics.previous.events.at(-1).active,4096);assert.equal(restored.log.diagnostics.previous.events.at(-3).active,null);h.log.dispose();restored.log.dispose();
});
