import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,zipFiles,reportFiles,pairedFrame,viewportDiagnostics,trustedMessage} from '../src/report-core.js';
import worker,{validateReport} from '../debug-server/worker/index.js';
const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,640);new DataView(png.buffer).setUint32(20,480);
const id='1d490f3a-22e3-4e7a-b40b-62b45c14a539';
async function formFor(){const data={schema:1,id,version:'0.8.0',viewport:{window:{width:844,height:390},dpr:3}},f=new FormData();f.set('id',id);f.set('consent','upload-to-public-github');for(const file of await reportFiles(data,new Blob([png]),new Blob([png])))f.set(file.name,file.blob,file.name);return f;}
test('ZIP headers, central directory and CRC preserve exact binary and Unicode JSON',async()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const raw=new TextEncoder().encode('{"測試":true}'),b=new Uint8Array(await zipFiles([{name:'diagnostics.json',bytes:raw}]).arrayBuffer()),d=new DataView(b.buffer);
  assert.equal(d.getUint32(0,true),0x04034b50);assert.equal(d.getUint32(14,true),crc32(raw));
  const start=30+d.getUint16(26,true);assert.deepEqual(b.slice(start,start+raw.length),raw);
  assert.equal(d.getUint32(start+raw.length,true),0x02014b50);assert.equal(d.getUint32(b.length-22,true),0x06054b50);
  assert.equal(d.getUint16(b.length-12,true),1);assert.throws(()=>zipFiles([{name:'../bad',bytes:raw}]));
});
test('missing camera/screenshot still produces valid JSON + ZIP with explicit diagnostics',async()=>{
  const files=await reportFiles({schema:1,missingCamera:true,captureErrors:['no GPU']},null,null);assert.deepEqual(files.map(f=>f.name),['diagnostics.json','report.zip']);assert.equal(JSON.parse(await files[0].blob.text()).missingCamera,true);
});
test('same inference frame ID, timestamp, mirror and expiry are explicit',()=>{
  const snap={id:4,capturedAt:100,completedAt:230,inScene:true,frame:{width:384,height:512}};
  const f=pairedFrame(snap,250);assert.equal(f.id,4);assert.equal(f.ageMs,150);assert.equal(f.mirroredInput,false);assert.equal(f.mirroredScene,true);assert.equal(f.inScene,true);
  assert.equal(pairedFrame(snap,1700),null);assert.equal(pairedFrame(snap,90),null);assert.equal(pairedFrame(null,0),null);
});
test('viewport records actual screen, visual viewport, DPR, fullscreen and framebuffer',()=>{
  const v=viewportDiagnostics({screen:{width:390,height:844},innerWidth:844,innerHeight:390,visualViewport:{width:800,height:350,scale:1.2,offsetLeft:2,offsetTop:4},devicePixelRatio:3},{fullscreenElement:{},body:{classList:{contains:()=>true}}},{getBoundingClientRect:()=>({width:844,height:390})},{width:1477,height:682});assert.equal(v.orientation,'landscape');assert.equal(v.fullscreen.native,true);assert.equal(v.fullscreen.css,true);assert.equal(v.visualViewport.scale,1.2);assert.equal(v.dpr,3);assert.equal(v.drawingBuffer.width,1477);
});
test('cross-window handoff requires exact source, origin and report ID',()=>{
  const source={};const event={source,origin:'https://reports.example',data:{id}};assert.equal(trustedMessage(event,source,event.origin,id),true);
  for(const bad of [{...event,source:{}},{...event,origin:'https://evil.example'},{...event,data:{id:'other'}}])assert.equal(trustedMessage(bad,source,event.origin,id),false);
});
test('server validates consent, ID, schema, PNG dimensions and ZIP before any write',async()=>{
  assert.equal((await validateReport(await formFor())).files.length,4);
  for(const [key,value] of [['consent','no'],['id','../../x'],['camera.png',new Blob(['bad'])],['report.zip',new Blob(['bad'])],['diagnostics.json',new Blob(['{}'])]]){const f=await formFor();f.set(key,value);await assert.rejects(validateReport(f));}
  const f=await formFor();f.delete('diagnostics.json');await assert.rejects(validateReport(f));
  const big=png.slice();new DataView(big.buffer).setUint32(16,9999);const g=await formFor();g.set('camera.png',new Blob([big]));await assert.rejects(validateReport(g),/尺寸/);
});
test('bridge inline browser script parses after HTML templating',async()=>{
  const {Script}=await import('node:vm');
  const response=await worker.fetch(new Request('https://reports.example/?id='+id,{headers:{'oai-authenticated-user-id':'owner'}}),{BUCKET:{},REPORT_ENCRYPTION_KEY:'test'},{});
  const html=await response.text();assert.doesNotThrow(()=>new Script(html.match(/<script>([\s\S]+)<\/script>/)[1]));assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('capture freezes the same RGBA input before asynchronous screenshot and records dimensions',async()=>{
  const {captureReport}=await import('../src/report-panel.js');const raw=new Uint8ClampedArray([10,20,30,255]),drawn=[];
  const makeCanvas=()=>({width:0,height:0,style:{},getContext:()=>({createImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData:p=>drawn.push([...p.data]),drawImage:()=>{}}),toBlob:fn=>fn(new Blob([png]))});
  const doc={createElement:makeCanvas,getElementById:()=>null,body:{classList:{contains:()=>true}}};
  const win={screen:{width:844,height:390},innerWidth:844,innerHeight:390,location:{origin:'https://wangchengyeh.github.io',pathname:'/Yoga2/'},navigator:{userAgent:'test'},devicePixelRatio:3};
  const stage={getBoundingClientRect:()=>({width:844,height:390})};let options;
  const result=await captureReport({id,doc,win,stage,human:{snapshot:{id:44,inScene:true,capturedAt:performance.now(),completedAt:performance.now(),frame:{width:1,height:1,rgba:raw}}},render:()=>({width:1200,height:600}),diagnostics:()=>({test:true}),screenshot:async(s,o)=>{options=o;raw[0]=99;const c=makeCanvas();c.width=1266;c.height=585;return c;}});
  assert.deepEqual(drawn,[[10,20,30,255]]);assert.equal(result.diagnostics.frame.id,44);assert.equal(result.diagnostics.screenshot.width,1266);assert.equal(result.files.length,4);assert.equal(options.scale,1.5);
});
test('capture reports rendering/screenshot failures without inventing camera or losing JSON/ZIP',async()=>{
  const {captureReport}=await import('../src/report-panel.js');
  const result=await captureReport({id,stage:{getBoundingClientRect:()=>({width:844,height:390})},human:{},render:()=>{throw Error('context lost');},diagnostics:()=>({}),screenshot:()=>{throw Error('screenshot failed');},doc:{getElementById:()=>null,body:{classList:{contains:()=>false}}},win:{screen:{},innerWidth:844,innerHeight:390,location:{},navigator:{}}});
  assert.equal(result.diagnostics.missingCamera,true);assert.equal(result.diagnostics.missingScene,true);assert.equal(result.diagnostics.captureErrors.length,2);assert.deepEqual(result.files.map(f=>f.name),['diagnostics.json','report.zip']);
});
test('memory time series is a separate ZIP entry without changing the deployed upload form contract',async()=>{
 const memory={schema:1,samples:[{timeMs:5000,jsHeap:{available:false}}]},files=await reportFiles({schema:1,id,version:'0.9.20'},null,null,memory);assert.deepEqual(files.map(f=>f.name),['diagnostics.json','report.zip']);const bytes=await files.at(-1).blob.arrayBuffer();const text=new TextDecoder().decode(bytes);assert.match(text,/memory-diagnostics.json/);assert.match(text,/"timeMs": 5000/);assert.doesNotMatch(await files[0].blob.text(),/jsHeap/);
});
