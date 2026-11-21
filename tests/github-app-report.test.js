import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify,createHash} from 'node:crypto';
import {Script} from 'node:vm';
import worker,{privateDer,appJwt,seal,unseal,signed,verified,checkProof,sha,consumeQuota,uploadReport,installationToken,appManifest,githubApi} from '../debug-server/worker/index.js';
const key=Buffer.alloc(32,42).toString('base64');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=privateKey.export({format:'pem',type:'pkcs1'}).toString();
const config={appId:1,clientId:'Iv1.test',slug:'yoga-test-app',installationId:2,pem};
const id='1d490f3a-22e3-4e7a-b40b-62b45c14a539';
function bucket(){const data=new Map();let counter=0;return {data,async get(k){const item=data.get(k);return item?{etag:item.etag,json:async()=>JSON.parse(item.text),text:async()=>item.text}:null;},async put(k,text,options={}){const old=data.get(k),condition=options.onlyIf;
 if(condition?.etagDoesNotMatch==='*'&&old)return null;
 if(condition?.etagMatches&&old?.etag!==condition.etagMatches)return null;
 const etag=String(++counter);data.set(k,{text,etag});return {etag};}};}
function fixture(){return {id,diagnostics:{schema:1,id,version:'0.8.1',viewport:{window:{width:844,height:390},dpr:3}},files:[{name:'diagnostics.json',bytes:new TextEncoder().encode('{}')},{name:'report.zip',bytes:new Uint8Array([80,75,3,4])},{name:'camera.png',bytes:new Uint8Array([137,80])},{name:'scene.png',bytes:new Uint8Array([137,80])}]};}
async function setupBody(env,headers,path='/setup/start'){
 const page=await worker.fetch(new Request('https://reports.example/setup',{headers}),env),text=await page.text();
 const form=text.match(new RegExp('<form action="'+path+'"[\\s\\S]*?</form>'))?.[0];
 const token=form?.match(/name="_csrf" value="([^"]+)"/)?.[1];assert.ok(token);return new URLSearchParams({_csrf:token});
}
function github(){const calls=[],issues=[],refs=new Map();let disconnect=false,failBlobs=false;const fetcher=async(url,options={})=>{
 const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({url,path,...options,body});const reply=value=>Response.json(value);
 if(path==='/app/installations/2/access_tokens')return reply({token:'TEST_SERVER_ONLY_TOKEN'});
 if(path.endsWith('/issues')&&options.method==='GET')return reply(issues);
 if(path.endsWith('/branches/main'))return reply({commit:{sha:'a'.repeat(40)}});
 if(path.endsWith('/git/blobs')){if(failBlobs)return new Response('no',{status:503});return reply({sha:'b'.repeat(40)});}
 if(path.endsWith('/git/trees'))return reply({sha:'c'.repeat(40)});
 if(path.endsWith('/git/commits'))return reply({sha:'d'.repeat(40)});
 if(path.endsWith('/git/refs')){if(refs.has(body.ref))return new Response('exists',{status:422});refs.set(body.ref,body.sha);return reply({ref:body.ref});}
 if(path.includes('/git/ref/heads/'))return reply({object:{sha:'d'.repeat(40)}});
 if(path.endsWith('/git/commits/'+'d'.repeat(40)))return reply({message:refs.get('message')});
 if(path.endsWith('/issues')&&options.method==='POST'){const issue={html_url:'https://github.com/WangChengYeh/Yoga2/issues/321',...body};issues.push(issue);if(disconnect)throw Error('Disconnected after commit');return reply(issue);}
 throw Error(`Unexpected API ${path}`);
 };return {fetcher,calls,issues,refs,set disconnect(v){disconnect=v;},set failBlobs(v){failBlobs=v;}};}
test('JWT handles GitHub PKCS#1 PEM and signs RS256 with limited lifetime',async()=>{
 const jwt=await appJwt(config,2000000),parts=jwt.split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.iss,'Iv1.test');assert.equal(claims.iat,1940);assert.equal(claims.exp,2540);assert.equal(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),publicKey,Buffer.from(parts[2],'base64url')),true);
 const pkcs8=privateKey.export({format:'pem',type:'pkcs8'}).toString();assert.deepEqual(privateDer(pkcs8),privateDer(pem));
});
test('App credentials are encrypted and authenticated, never stored as plaintext',async()=>{
 const encrypted=await seal(key,config);assert.ok(!encrypted.includes('PRIVATE KEY'));assert.ok(!encrypted.includes('Iv1.test'));assert.deepEqual(await unseal(key,encrypted),config);
 const bad=JSON.parse(encrypted);bad.data='A'+bad.data.slice(1);await assert.rejects(unseal(key,JSON.stringify(bad)));
 await assert.rejects(unseal(Buffer.alloc(32,1).toString('base64'),encrypted));
});
test('short-lived signed challenge binds purpose, visitor, report ID, digest and real proof',async()=>{
 const value={id,digest:'a'.repeat(64),visitor:'anon',nonce:'test-proof-nonce',bits:16,exp:Date.now()+100000},token=await signed(key,value,'proof');assert.deepEqual(await verified(key,token,'proof'),value);assert.equal(await verified(key,token,'visitor'),null);assert.equal(await verified(key,token+'x','proof'),null);assert.equal(await verified(key,await signed(key,{...value,exp:0},'proof'),'proof'),null);
 let counter=0;while(!createHash('sha256').update(`${value.nonce}:${counter}`).digest('hex').startsWith('0000'))counter++;
 await checkProof({REPORT_ENCRYPTION_KEY:key},token,counter,id,value.digest,'anon');
 for(const args of [[counter,id,value.digest,'other'],[counter,id,'b'.repeat(64),'anon'],[-1,id,value.digest,'anon'],[counter+1,id,value.digest,'anon']])await assert.rejects(checkProof({REPORT_ENCRYPTION_KEY:key},token,...args));
});
test('persistent quota CAS never exceeds cap under concurrent anonymous submissions',async()=>{
 const b=bucket(),results=await Promise.allSettled(Array.from({length:10},()=>consumeQuota(b,'quota/day',3,Date.now()+10000)));assert.equal(results.filter(x=>x.status==='fulfilled').length,3);assert.equal(JSON.parse(b.data.get('quota/day').text).count,3);
});
test('installation token is narrowed to Yoga2 and only Contents/Issues write',async()=>{
 const gh=github();assert.equal(await installationToken(config,gh.fetcher),'TEST_SERVER_ONLY_TOKEN');assert.deepEqual(gh.calls[0].body,{repositories:['Yoga2'],permissions:{contents:'write',issues:'write'}});assert.ok(gh.calls[0].headers.Authorization.startsWith('Bearer ey'));assert.equal(gh.calls[0].redirect,'manual');
});
test('anonymous uploader uses server App, immutable attachment links and existing Issue recovery',async()=>{
 const b=bucket(),gh=github(),report=fixture();const result=await uploadReport(report,{BUCKET:b},{fetcher:gh.fetcher,config});assert.equal(result.url,gh.issues[0].html_url);assert.match(gh.issues[0].body,/camera.png/);assert.match(gh.issues[0].body,/scene.png/);assert.match(gh.issues[0].body,/report.zip/);assert.match(gh.issues[0].body,/844 × 390/);
 assert.ok(gh.calls.every(c=>c.url.startsWith('https://api.github.com/')));assert.ok(gh.calls.filter(c=>c.path.startsWith('/repos/')).every(c=>c.path.startsWith('/repos/WangChengYeh/Yoga2/')));
 const retry=await uploadReport(report,{BUCKET:b},{fetcher:gh.fetcher,config});assert.equal(retry.reused,true);assert.equal(gh.issues.length,1);
 const altered=fixture();altered.files[0].bytes[0]=42;await assert.rejects(uploadReport(altered,{BUCKET:b},{fetcher:gh.fetcher,config}),e=>e.status===409);
});
test('parallel visitors claiming same report create exactly one Issue',async()=>{
 const b=bucket(),gh=github(),report=fixture();const out=await Promise.allSettled([uploadReport(report,{BUCKET:b},{fetcher:gh.fetcher,config}),uploadReport(report,{BUCKET:b},{fetcher:gh.fetcher,config})]);assert.ok(out.some(r=>r.status==='fulfilled'));assert.equal(gh.issues.length,1);
});
test('uncertain issue writes are checked, never blindly replayed even if lookup is empty',async()=>{
 const b=bucket(),gh=github(),report=fixture();gh.disconnect=true;await assert.rejects(uploadReport(report,{BUCKET:b},{fetcher:gh.fetcher,config}));assert.equal(JSON.parse(b.data.get('reports/'+id).text).phase,'uncertain');
 const issue=gh.issues.pop();await assert.rejects(uploadReport(report,{BUCKET:b},{fetcher:gh.fetcher,config}),e=>e.status===409);assert.equal(gh.calls.filter(c=>c.path.endsWith('/issues')&&c.method==='POST').length,1);
 gh.issues.push(issue);const retry=await uploadReport(report,{BUCKET:b},{fetcher:gh.fetcher,config});assert.equal(retry.reused,true);assert.equal(gh.issues.length,1);
});
test('stolen upload lease cannot issue or overwrite the new claimant',async()=>{
 const b=bucket(),gh=github(),report=fixture(),base=gh.fetcher;const fetcher=async(url,o)=>{const r=await base(url,o);if(url.endsWith('/git/refs'))await b.put('reports/'+id,JSON.stringify({phase:'uploading',digest:'new-owner',updatedAt:Date.now()}));return r;};
 await assert.rejects(uploadReport(report,{BUCKET:b},{fetcher,config}),e=>e.status===409);assert.equal(gh.issues.length,0);assert.equal(JSON.parse(b.data.get('reports/'+id).text).digest,'new-owner');
});
test('GitHub rate limits are preserved; upstream messages cannot leak server tokens',async()=>{
 await assert.rejects(githubApi('/repos/WangChengYeh/Yoga2/issues',{token:'SECRET',fetcher:async()=>new Response('SECRET/private-key',{status:429,headers:{'retry-after':'60'}})}),e=>e.status===429&&e.retryAfterMs===60000&&!e.message.includes('SECRET'));
});
test('anonymous report page needs no identity and contains valid script without secrets',async()=>{
 const r=await worker.fetch(new Request('https://reports.example/?id='+id),{BUCKET:bucket(),REPORT_ENCRYPTION_KEY:key});assert.equal(r.status,200);const text=await r.text();assert.match(text,/不需要登入/);assert.ok(!text.includes('TEST_SERVER_ONLY_TOKEN'));assert.doesNotThrow(()=>new Script(text.match(/<script>([\s\S]+)<\/script>/)[1]));
});
test('not configured fails closed and public clients cannot access owner setup or credentials',async()=>{
 const env={BUCKET:bucket(),REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'};
 const r=await worker.fetch(new Request('https://reports.example/api/report',{method:'POST',headers:{Origin:'https://reports.example','X-Yoga-Report':'1'},body:'x'}),env);assert.equal(r.status,503);assert.match((await r.json()).message,/尚未完成/);
 const bad=await worker.fetch(new Request('https://reports.example/setup/start',{method:'POST',headers:{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test',Origin:'https://reports.example'}}),env);assert.equal(bad.status,403);
 const missing=await worker.fetch(new Request('https://reports.example/private/github-app.enc'),env);assert.equal(missing.status,404);
});
test('admin manifest has minimal write permissions and no user OAuth or webhooks',async()=>{
 const m=appManifest('https://reports.example','abcd');assert.equal(m.public,false);assert.equal(m.request_oauth_on_install,false);assert.equal(m.hook_attributes.active,false);assert.deepEqual(m.default_permissions,{contents:'write',issues:'write'});
 const env={BUCKET:bucket(),REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'},headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',Origin:'https://reports.example'};
 const r=await worker.fetch(new Request('https://reports.example/setup/start',{method:'POST',headers,body:await setupBody(env,headers)}),env);const text=await r.text();assert.equal(r.status,200);assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));assert.ok(text.includes('https://github.com/settings/apps/new?state='));assert.equal(env.BUCKET.data.size,1);
 const csrf=await worker.fetch(new Request('https://reports.example/setup/start',{method:'POST',headers:{...headers,Origin:'https://evil.example'}}),env);assert.equal(csrf.status,403);
});
test('full anonymous HTTP flow verifies proof, uploads as App and returns Issue with no visitor identity',async()=>{
 const {reportFiles}=await import('../src/report-core.js');const {payloadDigest}=await import('../debug-server/worker/index.js');
 const b=bucket(),env={BUCKET:b,REPORT_ENCRYPTION_KEY:key};await b.put('private/github-app.enc',await seal(key,config));
 const gh=github(),original=globalThis.fetch;globalThis.fetch=gh.fetcher;
 try{
  const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);new DataView(bytes.buffer).setUint32(16,480);new DataView(bytes.buffer).setUint32(20,640);
  const diagnostics={schema:1,id,version:'0.8.1'},files=await reportFiles(diagnostics,new Blob([bytes]),new Blob([bytes]));
  const digest=await payloadDigest(await Promise.all(files.map(async f=>({name:f.name,bytes:new Uint8Array(await f.blob.arrayBuffer())}))));
  const headers={Origin:'https://reports.example','X-Yoga-Report':'1'};
  const challengeResponse=await worker.fetch(new Request('https://reports.example/api/challenge',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id,digest})}),env);
  assert.equal(challengeResponse.status,200);const challenge=await challengeResponse.json();let counter=0;while(!createHash('sha256').update(`${challenge.nonce}:${counter}`).digest('hex').startsWith('0000'))counter++;
  const form=new FormData();form.set('id',id);form.set('consent','upload-to-public-github');form.set('challenge',challenge.token);form.set('proof',String(counter));for(const f of files)form.set(f.name,f.blob,f.name);
  const response=await worker.fetch(new Request('https://reports.example/api/report',{method:'POST',headers:{...headers,Cookie:challengeResponse.headers.get('set-cookie').split(';')[0]},body:form}),env);assert.equal(response.status,200);assert.equal((await response.json()).url,'https://github.com/WangChengYeh/Yoga2/issues/321');assert.equal(gh.issues.length,1);
 }finally{globalThis.fetch=original;}
});
test('manifest callback binds admin session and stores only encrypted App credentials',async()=>{
 const b=bucket(),env={BUCKET:b,REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'},headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',Origin:'https://reports.example'};
 const start=await worker.fetch(new Request('https://reports.example/setup/start',{method:'POST',headers,body:await setupBody(env,headers)}),env);const cookie=start.headers.get('set-cookie').split(';')[0],nonce=cookie.split('=')[1];
 const noCookie=await worker.fetch(new Request('https://reports.example/setup/callback?state='+nonce+'&code=testcode123456',{headers}),env);assert.equal(noCookie.status,400);
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async(url)=>{calls++;assert.equal(url,'https://api.github.com/app-manifests/testcode123456/conversions');return Response.json({id:1,client_id:'Iv1.test',slug:'yoga-test-app',pem,owner:{login:'WangChengYeh'},permissions:{contents:'write',issues:'write'},client_secret:'NEVER_STORE'});};
 try{
  const r=await worker.fetch(new Request('https://reports.example/setup/callback?state='+nonce+'&code=testcode123456',{headers:{...headers,Cookie:cookie}}),env);assert.equal(r.status,303);const encrypted=b.data.get('private/github-app.enc').text;assert.ok(!encrypted.includes('PRIVATE KEY'));assert.ok(!encrypted.includes('NEVER_STORE'));const saved=await unseal(key,encrypted);assert.equal(saved.appId,1);assert.equal(saved.pem,pem);assert.equal(saved.client_secret,undefined);
  const again=await worker.fetch(new Request('https://reports.example/setup/callback?state='+nonce+'&code=testcode123456',{headers:{...headers,Cookie:cookie}}),env);assert.equal(again.status,303);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('iPhone null/missing Origin form requires signed admin CSRF; wrong origin, user, path and expiry fail',async()=>{
 const env={BUCKET:bucket(),REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'},identity={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'};
 const good=await setupBody(env,identity);
 for(const origin of ['null',null,'https://reports.example']){
  const headers={...identity,...(origin?{Origin:origin}:{})};const r=await worker.fetch(new Request('https://reports.example/setup/start',{method:'POST',headers,body:good.toString()?new URLSearchParams(good):null}),env);assert.equal(r.status,200);assert.match(await r.text(),/到 GitHub 核准 App/);
 }
 const cases=[
  {headers:{...identity,Origin:'null'},body:new URLSearchParams()},
  {headers:{...identity,Origin:'https://evil.example'},body:good},
  {headers:{...identity,Origin:'null'},body:new URLSearchParams({_csrf:await signed(key,{user:'other',path:'/setup/start',exp:Date.now()+60000},'setup-csrf')})},
  {headers:{...identity,Origin:'null'},body:new URLSearchParams({_csrf:await signed(key,{user:'owner',path:'/setup/check',exp:Date.now()+60000},'setup-csrf')})},
  {headers:{...identity,Origin:'null'},body:new URLSearchParams({_csrf:await signed(key,{user:'owner',path:'/setup/start',exp:0},'setup-csrf')})},
  {headers:{Origin:'null'},body:good},
 ];
 for(const sample of cases){const r=await worker.fetch(new Request('https://reports.example/setup/start',{method:'POST',headers:sample.headers,body:new URLSearchParams(sample.body)}),env);if(!sample.headers['oai-authenticated-user-id']){assert.match(await r.text(),/管理者登入/);continue;}assert.equal(r.status,403);assert.match(r.headers.get('content-type'),/text\/html; charset=utf-8/);assert.match(await r.text(),/設定頁/);}
 const crossApi=await worker.fetch(new Request('https://reports.example/api/report',{method:'POST',headers:{Origin:'null','X-Yoga-Report':'1'},body:'x'}),env);assert.equal(crossApi.status,403);
 assert.equal(crossApi.headers.get('content-type'),'application/json; charset=utf-8');assert.match(await crossApi.text(),/回報來源不符/);
});
test('setup/check uses its own signed form token and blocks replay of setup/start token',async()=>{
 const env={BUCKET:bucket(),REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'},headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',Origin:'null'};
 const start=await setupBody(env,headers);await env.BUCKET.put('private/github-app.enc',await seal(key,config));
 const wrong=await worker.fetch(new Request('https://reports.example/setup/check',{method:'POST',headers,body:start}),env);assert.equal(wrong.status,403);
 const body=await setupBody(env,headers,'/setup/check');assert.ok(body.get('_csrf'));const page=await worker.fetch(new Request('https://reports.example/setup',{headers}),env);assert.equal(page.headers.get('referrer-policy'),'same-origin');
});
test('default GitHub transport preserves the runtime global fetch receiver',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=function(url,options){if(this!==globalThis)throw new TypeError('Illegal invocation: function called with incorrect this reference.');calls++;return Promise.resolve(Response.json(url.includes('/access_tokens')?{token:'TEST_TOKEN'}:{ok:true}));};
 try{assert.deepEqual(await githubApi('/repos/WangChengYeh/Yoga2'),{ok:true});assert.equal(await installationToken(config),'TEST_TOKEN');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('failed manifest exchange persists encrypted pending state and retries same registration by explicit POST',async()=>{
 const b=bucket(),env={BUCKET:b,REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'},headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',Origin:'null'};
 const start=await worker.fetch(new Request('https://reports.example/setup/start',{method:'POST',headers,body:await setupBody(env,headers)}),env),cookie=start.headers.get('set-cookie').split(';')[0],state=cookie.split('=')[1];
 const callback='https://reports.example/setup/callback?state='+state+'&code=samecode123456',original=globalThis.fetch;let fail=true,calls=0;
 globalThis.fetch=async url=>{calls++;assert.equal(url,'https://api.github.com/app-manifests/samecode123456/conversions');if(fail)throw new TypeError('Network failed');return Response.json({id:1,client_id:'Iv1.test',slug:'yoga-test-app',pem,owner:{login:'WangChengYeh'},permissions:{contents:'write',issues:'write'}});};
 try{
  const failed=await worker.fetch(new Request(callback,{headers:{...headers,Cookie:cookie}}),env);assert.equal(failed.status,502);const text=await failed.text();assert.match(text,/重試設定交換/);assert.ok(!text.includes('同一份回報'));
  const encrypted=b.data.get('private/pending-setup.enc').text;assert.ok(!encrypted.includes('samecode'));assert.ok(!encrypted.includes('owner'));
  assert.equal(JSON.parse(b.data.get('setup/'+state).text).phase,'retryable');
  const page=await worker.fetch(new Request('https://reports.example/setup',{headers}),env);assert.match(await page.text(),/繼續 GitHub App 設定/);
  const body=await setupBody(env,headers,'/setup/retry');fail=false;
  const retried=await worker.fetch(new Request('https://reports.example/setup/retry',{method:'POST',headers,body}),env);assert.equal(retried.status,303);assert.equal(calls,2);assert.equal((await unseal(key,b.data.get('private/github-app.enc').text)).appId,1);
 }finally{globalThis.fetch=original;}
});
test('legacy used-only setup record can recover once from original authenticated callback',async()=>{
 const b=bucket(),env={BUCKET:b,REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'},state='11111111-1111-1111-1111-111111111111';
 await b.put('setup/'+state,JSON.stringify({user:'owner',expiresAt:Date.now()+60000,used:true}));const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({id:1,client_id:'Iv1.test',slug:'yoga-test-app',pem,owner:{login:'WangChengYeh'},permissions:{contents:'write',issues:'write'}});};
 try{const r=await worker.fetch(new Request('https://reports.example/setup/callback?state='+state+'&code=legacycode123456',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',Cookie:'__Host-yoga-setup='+state}}),env);assert.equal(r.status,303);assert.equal(calls,1);assert.equal(JSON.parse(b.data.get('setup/'+state).text).phase,'complete');}finally{globalThis.fetch=original;}
});

test('edge transport uses manual redirects and never follows a redirect with App credentials',async()=>{
 let calls=0;await assert.rejects(githubApi('/repos/WangChengYeh/Yoga2/issues',{token:'SECRET',fetcher:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://evil.example/'}});}}),e=>e.status===502);assert.equal(calls,1);
});
test('GitHub exhausted primary limit honors actual reset timestamp, not a blind one-minute retry',async()=>{
 const reset=Math.floor(Date.now()/1000)+900;
 await assert.rejects(githubApi('/repos/WangChengYeh/Yoga2/issues',{fetcher:async()=>new Response('limited',{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-reset':String(reset)}})}),e=>e.status===429&&e.retryAfterMs>895000&&e.retryAfterMs<905000);
});
test('pending setup rate-limit cooldown prevents another exchange and displays retry time',async()=>{
 const b=bucket(),env={BUCKET:b,REPORT_ENCRYPTION_KEY:key,REPORT_ADMIN_EMAIL:'owner@example.test'},headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',Origin:'null'},state='22222222-2222-2222-2222-222222222222';
 const pending={state,code:'samecode123456',user:'owner',expiresAt:Date.now()+3600000};await b.put('private/pending-setup.enc',await seal(key,pending));await b.put('setup/'+state,JSON.stringify({user:'owner',expiresAt:pending.expiresAt,used:true,phase:'retryable',retryAt:Date.now()+60000}));
 const page=await worker.fetch(new Request('https://reports.example/setup',{headers}),env);assert.match(await page.text(),/預計台灣時間/);
 const token=await signed(key,{user:'owner',path:'/setup/retry',exp:Date.now()+600000},'setup-csrf'),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not call');};
 try{const r=await worker.fetch(new Request('https://reports.example/setup/retry',{method:'POST',headers,body:new URLSearchParams({_csrf:token})}),env);assert.equal(r.status,429);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
