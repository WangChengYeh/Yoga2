import test from 'node:test';
import assert from 'node:assert/strict';
import {setupReportPanel,captureReport} from '../src/report-panel.js';
import {reportFiles} from '../src/report-core.js';
const id='1d490f3a-22e3-4e7a-b40b-62b45c14a539';
async function pack(id,images=true){const diagnostics={schema:1,id,version:'0.9.12',captureMode:images?'full':'diagnostics-only',voice:{lastAudioError:'start-timeout'}};return {id,diagnostics,files:await reportFiles(diagnostics,images?new Blob(['camera']):null,images?new Blob(['scene']):null)};}
function harness({endpoint='',capture=pack,popupBlocked=false}={}){
 const nodes=new Map(),notice={dataset:{}},events={},created=[],revoked=[],calls=[];let opened=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,disabled:false,listeners:{},clicks:0,textContent:'',closest:()=>notice,addEventListener(t,f){this.listeners[t]=f;},click(){this.clicks++;},append(n){this.child=n;},removeAttribute(n){delete this[n];}});return nodes.get(id);};
 const popup={closed:false,postMessage(data){calls.push(data);}},win={URL:{createObjectURL:b=>{created.push(b);return 'blob:test-'+created.length;},revokeObjectURL:u=>revoked.push(u)},open(){opened++;return popupBlocked?null:popup;},addEventListener:(t,f)=>events[t]=f,removeEventListener:t=>delete events[t]};
 const doc={getElementById:node,createElement:()=>({})};const captures=[];
 const panel=setupReportPanel({win,doc,endpoint,capture:async(id,options)=>{captures.push({id,options});return capture(id,options?.images!==false);}});
 return {node,events,created,revoked,captures,popup,panel,click:async id=>node(id).listeners.click(),get opened(){return opened;}};
}
test('local full ZIP download needs no backend or popup, retains a mobile fallback link and revokes URLs on replacement/dispose',async()=>{
 const h=harness();try{
  await h.click('report-download');assert.equal(h.opened,0);assert.equal(h.created.length,1);assert.equal(h.node('report-local-link').clicks,1);assert.match(h.node('report-local-link').download,/^yoga2-v0\.9\.12-[a-zA-Z0-9-]+\.zip$/);assert.equal(h.node('report-local-link').hidden,false);
  assert.equal(h.captures[0].options.images,true);assert.match(h.node('report-status').textContent,/若未自動下載/);assert.deepEqual(h.node('report-download').disabled,false);
  await h.click('report-download');assert.deepEqual(h.revoked,['blob:test-1']);assert.equal(h.created.length,2);
 }finally{h.panel.dispose();}assert.deepEqual(h.revoked,['blob:test-1','blob:test-2']);
});
test('compact ZIP omits images, and full capture failure falls back to diagnostic-only capture',async()=>{
 const h=harness({capture:(id,images)=>{if(images)throw Error('GPU unavailable');return pack(id,false);}});try{
  await h.click('report-download');assert.deepEqual(h.captures.map(c=>c.options.images),[true,false]);assert.equal(h.captures[1].options.fallbackReason,'image-capture-failed');assert.equal(h.created.length,1);assert.match(h.node('report-status').textContent,/精簡日誌/);
  const bytes=await h.created[0].text();assert.match(bytes,/diagnostics.json/);assert.doesNotMatch(bytes,/camera.png|scene.png/);
  await h.click('report-logs');assert.equal(h.captures.at(-1).options.images,false);
 }finally{h.panel.dispose();}
});
test('local capture failure is retryable, duplicate clicks share one operation, and disposal prevents late download',async()=>{
 let resolve;const h=harness({capture:id=>new Promise(r=>resolve=()=>pack(id).then(r))});const a=h.click('report-download');await Promise.resolve();await h.click('report-download');assert.equal(h.captures.length,1);h.panel.dispose();await resolve();await a;assert.equal(h.created.length,0);
 const failed=harness({capture:()=>{throw Error('unavailable');}});try{await failed.click('report-logs');assert.match(failed.node('report-status').textContent,/無法建立/);assert.equal(failed.node('report-logs').disabled,false);}finally{failed.panel.dispose();}
});
test('popup blocked online report does not prevent local download',async()=>{
 const h=harness({endpoint:'https://reports.example',popupBlocked:true});try{await h.click('report-problem');assert.match(h.node('report-status').textContent,/阻擋/);await h.click('report-download');assert.equal(h.created.length,1);}finally{h.panel.dispose();}
});
test('download reuses exact pending online report and remains available after service error',async()=>{
 const h=harness({endpoint:'https://reports.example'});try{
  await h.click('report-problem');const reportId=h.captures[0].id;await h.events.message({source:h.popup,origin:'https://reports.example',data:{id:reportId,type:'yoga-report-error',message:'not configured'}});
  await h.click('report-download');assert.equal(h.captures.length,1);assert.match(h.node('report-local-link').download,new RegExp(reportId));assert.equal(h.node('report-download').textContent,'下載同份回報');
 }finally{h.panel.dispose();}
});
test('compact download never adopts an image capture already pending for online report',async()=>{
 let finish;const h=harness({endpoint:'https://reports.example',capture:(id,images)=>images?new Promise(r=>finish=()=>pack(id,true).then(r)):pack(id,false)});try{
  const online=h.click('report-problem');await Promise.resolve();await h.click('report-logs');assert.equal(h.created.length,1);assert.doesNotMatch(await h.created[0].text(),/camera.png/);await finish();await online;
 }finally{h.panel.dispose();}
});
test('diagnostic-only capture includes runtime and voice evidence without touching camera, renderer or screenshot',async()=>{
 let renders=0,screenshots=0;const result=await captureReport({id,images:false,stage:{getBoundingClientRect:()=>({width:844,height:390})},human:{get snapshot(){throw Error('must not access');}},render:()=>{renders++;},screenshot:()=>{screenshots++;},diagnostics:()=>({runtime:{previousSessionUnclean:true},voice:{lastAudioError:'start-timeout'}}),doc:{body:{classList:{contains:()=>false}}},win:{screen:{},innerWidth:844,innerHeight:390,location:{},navigator:{}}});
 assert.equal(renders,0);assert.equal(screenshots,0);assert.equal(result.diagnostics.runtime.previousSessionUnclean,true);assert.deepEqual(result.files.map(f=>f.name),['diagnostics.json','report.zip']);
});

test('disposing during online capture prevents late timers and leaves local controls inert',async()=>{
 let resolve;const h=harness({endpoint:'https://reports.example',capture:id=>new Promise(r=>resolve=()=>pack(id).then(r))});const pending=h.click('report-problem');await Promise.resolve();h.panel.dispose();await resolve();await pending;
 await h.click('report-download');assert.equal(h.created.length,0);assert.equal(h.node('report-problem').disabled,false);
});

test('downloads close the nested menu before any capture; the ZIP link stays usable afterwards',async()=>{
 let h;h=harness({capture:(id,images)=>{assert.equal(h.node('report-local-controls').open,false);assert.equal(h.node('practice-settings').open,false);return pack(id,images);}});try{
  h.node('report-local-controls').open=true;h.node('practice-settings').open=true;await h.click('report-download');assert.equal(h.node('report-local-link').hidden,false);assert.equal(h.node('report-local-link').clicks,1);
 }finally{h.panel.dispose();}
});
test('scene clone hides report progress and closes menus without hiding normal controls or altering live DOM',async()=>{
 const liveNotice={hidden:false},cloneNotice={hidden:false,style:{setProperty(name,value,priority){this[name]=value;this.priority=priority;}}},downloadMenu={open:true},settingsMenu={open:true},normalControl={hidden:false};
 const canvas={width:500,height:400,toBlob:fn=>fn(new Blob(['png']))};
 const result=await captureReport({id,stage:{getBoundingClientRect:()=>({width:500,height:400})},human:{},render:()=>null,diagnostics:()=>({}),doc:{getElementById:()=>null,body:{classList:{contains:()=>false}}},win:{screen:{},innerWidth:500,innerHeight:400,location:{},navigator:{}},screenshot:async(stage,options)=>{
  options.onclone({querySelector:selector=>({'#report-local-controls':downloadMenu,'#practice-settings':settingsMenu,'.report-notice':cloneNotice,'#stage-play':normalControl}[selector]||null)});
  assert.equal(downloadMenu.open,false);assert.equal(settingsMenu.open,false);assert.equal(cloneNotice.style.display,'none');assert.equal(cloneNotice.style.priority,'important');assert.equal(normalControl.hidden,false);assert.equal(liveNotice.hidden,false);return canvas;
 }});
 assert.equal(result.diagnostics.missingScene,false);assert.deepEqual(result.diagnostics.screenshot.omittedTransientUi,['download-menu','settings-menu','report-notice']);
});
