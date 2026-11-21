import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRelease, updateURL, setupUpdater } from '../src/update.js';
import { APP_VERSION } from '../src/release.js';

function harness(fetch) {
  let click;
  const button={textContent:'',disabled:false,addEventListener:(type,handler)=>{click=handler;}};
  const status={textContent:''},replaced=[];
  const document={getElementById:(id)=>id==='app-version'?button:status};
  const location={href:'https://wangchengyeh.github.io/Yoga2/?existing=1',replace:(url)=>replaced.push(url)};
  setupUpdater({document,location,fetch,now:()=>12345});
  return {button,status,replaced,click:()=>click()};
}
test('version: installed build is displayed without fetching or reloading on startup',()=>{
  let called=false;const h=harness(()=>{called=true;});assert.equal(h.button.textContent,`v${APP_VERSION}`);assert.equal(called,false);assert.equal(h.replaced.length,0);
});
test('click version: fetch fresh metadata and reload same origin/path with cache-busting query',async()=>{
  const h=harness(async(url,options)=>{assert.equal(options.cache,'no-store');assert.equal(new URL(url).pathname,'/Yoga2/version.json');assert.ok(new URL(url).searchParams.has('check'));return {ok:true,json:async()=>({version:'0.5.1'})};});
  await h.click();assert.equal(h.replaced.length,1);const url=new URL(h.replaced[0]);assert.equal(url.origin,'https://wangchengyeh.github.io');assert.equal(url.pathname,'/Yoga2/');assert.equal(url.searchParams.get('version'),'0.5.1');assert.equal(url.searchParams.get('refresh'),'12345');assert.equal(url.searchParams.get('existing'),'1');
});
test('same version still permits a clean reload for a stale page',async()=>{
  const h=harness(async()=>({ok:true,json:async()=>({version:APP_VERSION})}));await h.click();assert.equal(h.replaced.length,1);assert.match(h.status.textContent,/最新版/);
});
test('network, HTTP and malformed metadata failures do not reload or disable other features',async()=>{
  for(const fetch of [async()=>{throw new Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({version:'javascript:bad'})})]){
    const h=harness(fetch);await h.click();assert.equal(h.replaced.length,0);assert.equal(h.button.disabled,false);assert.match(h.status.textContent,/仍可繼續使用/);
  }
});
test('double clicks cannot launch duplicate update requests',async()=>{
  let finish,calls=0;const wait=new Promise((resolve)=>{finish=resolve;});
  const h=harness(async()=>{calls++;await wait;return {ok:true,json:async()=>({version:APP_VERSION})};});
  const first=h.click();await h.click();assert.equal(calls,1);finish();await first;assert.equal(h.replaced.length,1);
});
test('release metadata cannot inject navigation URLs',()=>{
  for(const version of ['',null,'https://other.example','0.5','v0.5.0','0.5.0?other'])assert.throws(()=>parseRelease({version}));
  assert.throws(()=>updateURL('https://wangchengyeh.github.io/Yoga2/','javascript:bad',1));
});
