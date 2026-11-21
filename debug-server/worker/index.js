// Dedicated GitHub App. No visitor GitHub connection or token is accepted.
const REPO='WangChengYeh/Yoga2', OWNER='WangChengYeh', PAGES='https://wangchengyeh.github.io';
const LIMIT=8*1024*1024, DAILY_LIMIT=20, HOURLY_LIMIT=10;
const HEADERS={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const utf8=new TextEncoder();
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{...HEADERS,...extra}});
export class ReportError extends Error {constructor(status,message,retryAfterMs=0){super(message);this.status=status;this.retryAfterMs=retryAfterMs;}}
const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64url=bytes=>b64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unurl=s=>unb64(s.replace(/-/g,'+').replace(/_/g,'/'));
export async function sha(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
export async function payloadDigest(files){return sha(utf8.encode(JSON.stringify(await Promise.all(files.map(async f=>[f.name,await sha(f.bytes)])))));}
const storeJson=async(bucket,key)=>{const item=await bucket.get(key);return item?{value:await item.json(),etag:item.etag}:null;};
async function hmac(key,message){const k=await crypto.subtle.importKey('raw',unb64(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',k,utf8.encode(message))));}
export async function signed(key,value,purpose){const data=b64url(utf8.encode(JSON.stringify(value)));return `${data}.${await hmac(key,`${purpose}:${data}`)}`;}
export async function verified(key,token,purpose){
  try{if(typeof token!=='string'||token.length>3000)return null;const [data,mac,extra]=token.split('.');if(extra||!mac)return null;
    const k=await crypto.subtle.importKey('raw',unb64(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('HMAC',k,unurl(mac),utf8.encode(`${purpose}:${data}`)))return null;
    const value=JSON.parse(new TextDecoder().decode(unurl(data)));return value.exp>Date.now()?value:null;
  }catch{return null;}
}
export async function seal(key,value){const iv=crypto.getRandomValues(new Uint8Array(12)),k=await crypto.subtle.importKey('raw',unb64(key),'AES-GCM',false,['encrypt']);const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode('yoga-github-app-v1')},k,utf8.encode(JSON.stringify(value)));return JSON.stringify({v:1,iv:b64(iv),data:b64(new Uint8Array(bytes))});}
export async function unseal(key,text){const value=JSON.parse(text);if(value.v!==1)throw Error('Invalid credential format');const k=await crypto.subtle.importKey('raw',unb64(key),'AES-GCM',false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(value.iv),additionalData:utf8.encode('yoga-github-app-v1')},k,unb64(value.data))));}
async function appConfig(env){const object=await env.BUCKET?.get('private/github-app.enc');return object?unseal(env.REPORT_ENCRYPTION_KEY,await object.text()):null;}
async function saveConfig(env,value){await env.BUCKET.put('private/github-app.enc',await seal(env.REPORT_ENCRYPTION_KEY,value));}
// GitHub's manifest supplies PKCS#1 RSA PEM; WebCrypto imports PKCS#8.
function der(tag,bytes){const n=bytes.length,len=n<128?[n]:n<256?[0x81,n]:[0x82,n>>8,n&255];return new Uint8Array([tag,...len,...bytes]);}
export function privateDer(pem){
  const body=unb64(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,''));
  if(pem.includes('BEGIN PRIVATE KEY'))return body;
  if(!pem.includes('BEGIN RSA PRIVATE KEY'))throw Error('Unsupported key');
  return der(0x30,new Uint8Array([2,1,0,0x30,0x0d,6,9,0x2a,0x86,0x48,0x86,0xf7,0x0d,1,1,1,5,0,...der(4,body)]));
}
export async function appJwt(config,now=Date.now()){
  const key=await crypto.subtle.importKey('pkcs8',privateDer(config.pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const seconds=Math.floor(now/1000),part=`${b64url(utf8.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))}.${b64url(utf8.encode(JSON.stringify({iat:seconds-60,exp:seconds+540,iss:String(config.clientId||config.appId)})))}`;
  return `${part}.${b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,utf8.encode(part))))}`;
}
export async function githubApi(path,{token,method='GET',body,fetcher=fetch}={}){
  if(!path.startsWith('/')||path.startsWith('//'))throw Error('Invalid GitHub path');
  let response;try{response=await fetcher(`https://api.github.com${path}`,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/vnd.github+json',...(body?{'Content-Type':'application/json'}:{}),'X-GitHub-Api-Version':'2026-03-10','User-Agent':'Yoga2-Diagnostic-App',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new ReportError(502,'GitHub 回應未確認，請重試同一份回報。');}
  if(!response.ok){const retry=Math.max(0,Number(response.headers.get('retry-after'))||0)*1000;
    if(response.status===429||(response.status===403&&(retry||response.headers.get('x-ratelimit-remaining')==='0')))throw new ReportError(429,'GitHub 要求稍後再試。',retry||60000);
    throw new ReportError(response.status===422?422:502,`GitHub 操作未完成（${response.status}），請保留這份回報重試。`);
  }
  return response.status===204?null:response.json();
}
export async function installationToken(config,fetcher=fetch){
  if(!config?.installationId)throw new ReportError(503,'管理者尚未完成專用 GitHub App 安裝，請稍後重試。');
  const result=await githubApi(`/app/installations/${config.installationId}/access_tokens`,{token:await appJwt(config),method:'POST',body:{repositories:['Yoga2'],permissions:{contents:'write',issues:'write'}},fetcher});
  if(typeof result.token!=='string')throw new ReportError(502,'無法取得 GitHub App 暫時授權。');return result.token;
}
export async function validateReport(form){
  if(form.get('consent')!=='upload-to-public-github')throw new ReportError(400,'請確認圖片將上傳至公開 GitHub。');
  const id=form.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))throw new ReportError(400,'回報編號無效。');
  const files=[];let total=0;
  for(const name of ['diagnostics.json','camera.png','scene.png','report.zip']){
    const file=form.get(name);if(!file){if(['diagnostics.json','report.zip'].includes(name))throw new ReportError(400,'缺少診斷資料或 ZIP。');continue;}
    if(typeof file.arrayBuffer!=='function'||file.size>LIMIT)throw new ReportError(413,'附件太大或格式無效。');
    const bytes=new Uint8Array(await file.arrayBuffer());total+=bytes.length;
    if(total>LIMIT)throw new ReportError(413,'回報上限 8 MB。');
    if(name.endsWith('.png')&&(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||bytes.length<24))throw new ReportError(400,'圖片不是有效 PNG。');
    if(name.endsWith('.png')){const view=new DataView(bytes.buffer);const w=view.getUint32(16),h=view.getUint32(20);if(w<1||h<1||w>2048||h>2048)throw new ReportError(400,'圖片尺寸超過限制。');}
    if(name==='report.zip'&&!(bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4))throw new ReportError(400,'ZIP 格式無效。');
    files.push({name,bytes});
  }
  let diagnostics;
  try{const data=files.find(f=>f.name==='diagnostics.json');if(data.bytes.length>200000)throw Error();diagnostics=JSON.parse(new TextDecoder().decode(data.bytes));}catch{throw new ReportError(400,'診斷 JSON 無效。');}
  if(diagnostics.schema!==1||diagnostics.id!==id||!/^\d+\.\d+\.\d+$/.test(diagnostics.version||''))throw new ReportError(400,'診斷版號或編號不符。');
  return {id,files,diagnostics};
}
export async function consumeQuota(bucket,key,limit,expiresAt){
  for(let tries=0;tries<5;tries++){
    const old=await storeJson(bucket,key),count=old?.value.count||0;
    if(count>=limit)throw new ReportError(429,'今日或本時段的回報額度已用完，請稍後重試。',Math.max(1000,expiresAt-Date.now()));
    const saved=await bucket.put(key,JSON.stringify({count:count+1,expiresAt}),{onlyIf:old?{etagMatches:old.etag}:{etagDoesNotMatch:'*'}});
    if(saved)return;
  }throw new ReportError(429,'回報服務忙碌，請稍後重試。',5000);
}
export async function checkProof(env,token,counter,id,digest,visitor){
  const value=await verified(env.REPORT_ENCRYPTION_KEY,token,'proof');
  if(!value||value.id!==id||value.digest!==digest||value.visitor!==visitor||value.bits!==16||!Number.isSafeInteger(counter)||counter<0||counter>10000000)throw new ReportError(400,'回報驗證過期或不符，請重試。');
  if(!(await sha(utf8.encode(`${value.nonce}:${counter}`))).startsWith('0000'))throw new ReportError(400,'回報驗證無效。');
}
async function findIssue(token,marker,fetcher){const issues=await githubApi(`/repos/${REPO}/issues?state=all&per_page=100&sort=created&direction=desc`,{token,fetcher});return issues.find?.(i=>i.body?.includes(`<!-- ${marker} -->`));}
export async function uploadReport(report,env,{fetcher=fetch,config}={}){
  config ||= await appConfig(env);
  if(!config?.installationId)throw new ReportError(503,'管理者尚未完成專用 GitHub App 安裝，請稍後重試。');
  const digest=await payloadDigest(report.files),key=`reports/${report.id}`,marker=`yoga-debug-${report.id}`;
  let stored=await storeJson(env.BUCKET,key),state=stored?.value;
  if(state&&state.digest!==digest)throw new ReportError(409,'同一回報編號不能替換附件，請保留原始回報。');
  if(state?.url)return {url:state.url,reused:true};
  const token=await installationToken(config,fetcher);
  if(state?.phase==='issuing'||state?.phase==='uncertain'){
    const issue=await findIssue(token,marker,fetcher);
    if(issue){await env.BUCKET.put(key,JSON.stringify({...state,url:issue.html_url,phase:'complete'}));return {url:issue.html_url,reused:true};}
    throw new ReportError(409,'先前送出結果尚未確認。請查看 GitHub Issues；系統不會重複建立。');
  }
  if(state?.phase==='uploading'&&Date.now()-state.updatedAt<300000)throw new ReportError(409,'同一份回報正在處理，請稍後重試。',5000);
  const claim={digest,phase:'uploading',updatedAt:Date.now()};
  const claimed=await env.BUCKET.put(key,JSON.stringify(claim),{onlyIf:stored?{etagMatches:stored.etag}:{etagDoesNotMatch:'*'}});
  if(!claimed)throw new ReportError(409,'同一份回報已在處理中。',5000);
  let issuing=false,leaseEtag=claimed.etag;
  try{
    const day=new Date().toISOString().slice(0,10),tomorrow=Date.parse(day)+86400000;
    await consumeQuota(env.BUCKET,`quota/day/${day}`,DAILY_LIMIT,tomorrow);
    const existing=await findIssue(token,marker,fetcher);
    if(existing){await env.BUCKET.put(key,JSON.stringify({...claim,phase:'complete',url:existing.html_url}),{onlyIf:{etagMatches:leaseEtag}});return {url:existing.html_url,reused:true};}
    const api=(path,method,body)=>githubApi(`/repos/${REPO}/${path}`,{token,method,body,fetcher});
    const main=await api('branches/main'),parent=main.commit?.sha;
    if(!/^[a-f0-9]{40}$/.test(parent||''))throw new ReportError(502,'GitHub 主分支資料無效。');
    const tree=[];
    for(const file of report.files){const blob=await api('git/blobs','POST',{content:b64(file.bytes),encoding:'base64'});if(!/^[a-f0-9]{40}$/.test(blob.sha||''))throw new ReportError(502,'附件未確認儲存。');tree.push({path:file.name,mode:'100644',type:'blob',sha:blob.sha});}
    const savedTree=await api('git/trees','POST',{tree});
    const commit=await api('git/commits','POST',{message:`Yoga debug ${report.id} ${digest}`,tree:savedTree.sha,parents:[parent]});
    if(!/^[a-f0-9]{40}$/.test(commit.sha||''))throw new ReportError(502,'附件版本未確認。');
    let commitSha=commit.sha;const branch=`debug-reports/${report.id}`;
    try{await api('git/refs','POST',{ref:`refs/heads/${branch}`,sha:commitSha});}
    catch(error){if(error.status!==422)throw error;const ref=await api(`git/ref/heads/${branch}`),oldCommit=await api(`git/commits/${ref.object.sha}`);if(oldCommit.message!==`Yoga debug ${report.id} ${digest}`)throw new ReportError(409,'附件分支與這份回報不符。');commitSha=ref.object.sha;}
    const raw=`https://raw.githubusercontent.com/${REPO}/${commitSha}`,d=report.diagnostics,view=d.viewport||{},size=view.window||{};
    const body=[`<!-- ${marker} -->`,'由 Yoga2 專用 GitHub App 代送；訪客主動同意公開上傳。',`回報 ID：\`${report.id}\`；版本：\`v${d.version}\`；視窗：${Number(size.width)||0} × ${Number(size.height)||0}；DPR：${Number(view.dpr)||1}。`,...['camera.png','scene.png'].filter(name=>report.files.some(f=>f.name===name)).map(name=>`### ${name==='camera.png'?'原始相機輸入':'合成練習畫面'}\n![${name}](${raw}/${name})`),`[診斷 JSON](${raw}/diagnostics.json) · [下載 ZIP](${raw}/report.zip)`,`附件分支：\`${branch}\`。缺圖原因見 diagnostics.json。`].join('\n\n');
    const issued=await env.BUCKET.put(key,JSON.stringify({...claim,phase:'issuing',updatedAt:Date.now()}),{onlyIf:{etagMatches:leaseEtag}});
    if(!issued)throw new ReportError(409,'回報認領已變更，請重試同一份回報。');leaseEtag=issued.etag;issuing=true;
    const issue=await api('issues','POST',{title:`[除錯 v${d.version}] ${report.id.slice(0,8)}`,body});
    if(!/^https:\/\/github\.com\/WangChengYeh\/Yoga2\/issues\/\d+$/.test(issue.html_url||''))throw new ReportError(502,'Issue 連結尚未確認，請重試同一份回報。');
    await env.BUCKET.put(key,JSON.stringify({...claim,phase:'complete',url:issue.html_url}),{onlyIf:{etagMatches:leaseEtag}});return {url:issue.html_url,reused:false};
  }catch(error){
    // Once create_issue may have run, recovery is read-only until success is found.
    try{await env.BUCKET.put(key,JSON.stringify({...claim,phase:issuing?'uncertain':'retryable',updatedAt:Date.now()}),{onlyIf:{etagMatches:leaseEtag}});}catch{}
    throw error;
  }
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(content,{cookie,githubForm=false}={}){return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yoga2 除錯回報</title><style>body{font:16px/1.7 system-ui;background:#f3f7f2;color:#163e35;margin:0;padding:5vw}main{max-width:680px;margin:auto}button,input,a{font:inherit}button{padding:.7rem 1rem;border-radius:1rem;background:#174f43;color:white;border:0}a{color:#075a49;text-decoration:underline}button[hidden],a[hidden]{display:none}</style><main>${content}</main></html>`,{headers:{...HEADERS,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'${githubForm?' https://github.com':''}; frame-ancestors 'none'`,...(cookie?{'Set-Cookie':cookie}:{})}});}
const cookieValue=(request,name)=>request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1);
function admin(request,env){return Boolean(env.REPORT_ADMIN_EMAIL&&request.headers.get('oai-authenticated-user-id')&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.REPORT_ADMIN_EMAIL.toLowerCase());}
function sameOrigin(request){return request.headers.get('Origin')===new URL(request.url).origin;}
async function bounded(request,max){const reader=request.body?.getReader();if(!reader)throw new ReportError(400,'缺少內容。');const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new ReportError(413,'回報超過大小限制。');}chunks.push(value);}return new Blob(chunks);}
export function appManifest(origin,suffix){return {name:`Yoga2 Debug Reports ${suffix}`,url:`${PAGES}/Yoga2/`,description:'Yoga2 anonymous diagnostic reports to WangChengYeh/Yoga2 only',redirect_url:`${origin}/setup/callback`,setup_url:`${origin}/setup/installed`,public:false,hook_attributes:{url:`${origin}/github/events`,active:false},default_permissions:{contents:'write',issues:'write'},default_events:[],request_oauth_on_install:false};}
async function setup(request,env,url){
  if(!admin(request,env)){
    if(!request.headers.get('oai-authenticated-user-id'))return html(`<h1>管理者設定</h1><p>只有專案擁有者需要這個一次性設定；一般訪客回報不用登入。</p><a target="_top" href="/signin-with-chatgpt?return_to=%2Fsetup">管理者登入 ChatGPT</a>`);
    return json({message:'只有專案擁有者可設定 GitHub App。'},403);
  }
  const config=await appConfig(env);
  if(request.method==='GET'&&url.pathname==='/setup'){
    if(config)return html(`<h1>專用 GitHub App ${config.installationId?'已啟用':'已建立'}</h1><p>${config.installationId?'匿名回報已準備就緒，訪客不需要 GitHub 或 ChatGPT 帳號。':'下一步在 GitHub 安裝 App，選 Only select repositories → Yoga2。'}</p><a href="https://github.com/apps/${esc(config.slug)}/installations/new">在 GitHub 安裝至 Yoga2</a><form action="/setup/check" method="post"><button>檢查安裝結果</button></form><p>App 僅請求 Contents 與 Issues 寫入。私鑰只在後端加密保存。</p>`);
    return html('<h1>啟用匿名除錯回報</h1><p>你只需一次在 GitHub 建立並安裝專用 App，授權 Yoga2 的 Contents 和 Issues 寫入。訪客不需要登入，按回報才會公開上傳照片。</p><form action="/setup/start" method="post"><button>準備專用 GitHub App</button></form>');
  }
  if(request.method==='POST'&&!sameOrigin(request))return json({message:'來源不符。'},403);
  if(request.method==='POST'&&url.pathname==='/setup/start'){
    if(config)return json({message:'App 已存在，請返回設定頁檢查安裝，避免重複建立。'},409);
    const nonce=crypto.randomUUID(),key=`setup/${nonce}`;
    await env.BUCKET.put(key,JSON.stringify({user:request.headers.get('oai-authenticated-user-id'),expiresAt:Date.now()+3600000}),{onlyIf:{etagDoesNotMatch:'*'}});
    const manifest=appManifest(url.origin,nonce.slice(0,8));
    return html(`<h1>到 GitHub 核准 App</h1><p>請使用 WangChengYeh 帳號。建立後回到這裡，再安裝並只選 Yoga2。授權完成前，匿名上傳保持停用。</p><form action="https://github.com/settings/apps/new?state=${nonce}" method="post"><input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest))}"><button>在 GitHub 建立專用 App</button></form>`,{githubForm:true,cookie:`__Host-yoga-setup=${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`});
  }
  if(request.method==='GET'&&url.pathname==='/setup/callback'){
    const state=url.searchParams.get('state'),code=url.searchParams.get('code');
    if(!/^[a-f0-9-]{36}$/.test(state||'')||state!==cookieValue(request,'__Host-yoga-setup')||!/^\w{10,200}$/.test(code||''))throw new ReportError(400,'GitHub 設定驗證不符，請重新開始。');
    const record=await storeJson(env.BUCKET,`setup/${state}`);
    if(!record||record.value.user!==request.headers.get('oai-authenticated-user-id')||record.value.expiresAt<Date.now()||record.value.used||config)throw new ReportError(409,'設定連結已使用或過期。請回設定頁檢查現況。');
    if(!await env.BUCKET.put(`setup/${state}`,JSON.stringify({...record.value,used:true}),{onlyIf:{etagMatches:record.etag}}))throw new ReportError(409,'設定正在處理中。');
    const created=await githubApi(`/app-manifests/${encodeURIComponent(code)}/conversions`,{method:'POST'});
    if(created.owner?.login!==OWNER||!Number.isSafeInteger(created.id)||typeof created.pem!=='string'||!/^[-a-z0-9]+$/.test(created.slug||'')||created.permissions?.contents!=='write'||created.permissions?.issues!=='write')throw new ReportError(400,'請以 WangChengYeh 建立 App 並保留所需權限。');
    await saveConfig(env,{appId:created.id,clientId:created.client_id,slug:created.slug,pem:created.pem});
    return Response.redirect(`${url.origin}/setup`,303);
  }
  if((request.method==='GET'&&url.pathname==='/setup/installed')||(request.method==='POST'&&url.pathname==='/setup/check')){
    if(!config)throw new ReportError(409,'尚未建立 App。');
    const jwt=await appJwt(config),installation=await githubApi(`/repos/${REPO}/installation`,{token:jwt});
    if(installation.account?.login!==OWNER||installation.app_id!==config.appId||installation.repository_selection!=='selected')throw new ReportError(400,'請在 GitHub 安裝 App，選 Only select repositories 並只勾 Yoga2。');
    const candidate={...config,installationId:installation.id};await installationToken(candidate);
    await saveConfig(env,candidate);return Response.redirect(`${url.origin}/setup`,303);
  }
  return json({message:'Not found'},404);
}
const reportPage=`<h1>Yoga2 除錯回報</h1><p>你已選擇將相機圖、場景截圖與診斷資料公開上傳至 WangChengYeh/Yoga2。由專用 App 代送，不需要登入 GitHub 或 ChatGPT。</p><p id="status" role="status">等待練習頁傳入畫面…</p><button id="retry" hidden>重試同一份回報</button><p><a href="https://github.com/WangChengYeh/Yoga2/issues" target="_blank" rel="noopener">查看 GitHub Issues</a></p><script>
const origin=${JSON.stringify(PAGES)},id=new URLSearchParams(location.search).get('id');let report,busy=false,retryAt=0;
const status=document.getElementById('status'),retry=document.getElementById('retry');
function notify(type,data={}){window.opener?.postMessage({type,id,...data},origin);}
const hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function solve(nonce){const encoder=new TextEncoder();for(let start=0;start<10000000;start+=128){const hashes=await Promise.all(Array.from({length:128},(_,i)=>hex(encoder.encode(nonce+':'+(start+i)))));const index=hashes.findIndex(x=>x.startsWith('0000'));if(index>=0)return start+index;if(start%2048===0)await new Promise(resolve=>setTimeout(resolve,0));}throw Error('回報驗證未完成，請重試。');}
async function api(path,options){const response=await fetch(path,options);const data=await response.json();if(!response.ok)throw Object.assign(Error(data.message||'回報結果尚未確認。'),{retryAfterMs:data.retryAfterMs||0});return data;}
async function send(){if(busy||!report||Date.now()<retryAt)return;busy=true;retry.hidden=true;
try{status.textContent='準備匿名回報驗證…';const files=await Promise.all(report.files.map(async f=>({name:f.name,bytes:new Uint8Array(await f.blob.arrayBuffer())})));const encoder=new TextEncoder();const digest=await hex(encoder.encode(JSON.stringify(await Promise.all(files.map(async f=>[f.name,await hex(f.bytes)])))));const challenge=await api('/api/challenge',{method:'POST',headers:{'Content-Type':'application/json','X-Yoga-Report':'1'},body:JSON.stringify({id,digest})});const proof=await solve(challenge.nonce);const form=new FormData();form.set('id',id);form.set('consent','upload-to-public-github');form.set('challenge',challenge.token);form.set('proof',String(proof));for(const f of report.files)form.set(f.name,f.blob,f.name);status.textContent='正在上傳附件並由專用 App 建立 Issue…';const data=await api('/api/report',{method:'POST',headers:{'X-Yoga-Report':'1'},body:form});const prefix='https://github.com/WangChengYeh/Yoga2/issues/';if(typeof data.url!=='string'||!data.url.startsWith(prefix)||!(/^[0-9]+$/).test(data.url.slice(prefix.length)))throw Error('Issue 連結尚未確認。');status.textContent='回報成功：';const a=document.createElement('a');a.href=data.url;a.textContent=data.url;a.target='_blank';a.rel='noopener';status.append(a);notify('yoga-report-success',{url:data.url});report=null;
}catch(e){retryAt=Date.now()+Math.min(3600000,Math.max(0,Number(e.retryAfterMs)||0));status.textContent=e.message;retry.hidden=false;notify('yoga-report-error',{message:e.message,retryAfterMs:e.retryAfterMs||0});}finally{busy=false;}}
window.addEventListener('message',e=>{if(e.origin!==origin||e.source!==window.opener||e.data?.type!=='yoga-report-package'||e.data.id!==id||report||busy)return;report=e.data;clearInterval(ready);void send();});retry.onclick=send;const ready=setInterval(()=>notify('yoga-report-ready'),700);if(!id)status.textContent='請從 Yoga2 練習頁按「回報問題」。';else notify('yoga-report-ready');
</script>`;
export default {async fetch(request,env){
  const url=new URL(request.url);
  try{
    if(!env.BUCKET||!env.REPORT_ENCRYPTION_KEY)return json({message:'回報服務設定尚未完成。'},503);
    if(url.pathname.startsWith('/setup'))return await setup(request,env,url);
    if(request.method==='GET'&&url.pathname==='/')return html(reportPage);
    if(request.method==='GET'&&url.pathname==='/api/status'){const config=await appConfig(env);return json({ready:Boolean(config?.installationId),mode:'github-app',requiresVisitorLogin:false});}
    if(request.method!=='POST'||!['/api/challenge','/api/report'].includes(url.pathname))return json({message:'Not found'},404);
    if(!sameOrigin(request)||request.headers.get('X-Yoga-Report')!=='1')return json({message:'回報來源不符。'},403);
    const config=await appConfig(env);if(!config?.installationId)throw new ReportError(503,'管理者尚未完成專用 GitHub App 安裝，請稍後重試。');
    let visitor=await verified(env.REPORT_ENCRYPTION_KEY,cookieValue(request,'__Host-yoga-visitor'),'visitor'),setCookie;
    if(url.pathname==='/api/challenge'){
      const input=JSON.parse(await (await bounded(request,2048)).text());
      if(!/^[a-f0-9-]{36}$/.test(input.id||'')||!/^[a-f0-9]{64}$/.test(input.digest||''))throw new ReportError(400,'回報編號或摘要無效。');
      if(!visitor){visitor={id:crypto.randomUUID(),exp:Date.now()+86400000};setCookie=`__Host-yoga-visitor=${await signed(env.REPORT_ENCRYPTION_KEY,visitor,'visitor')}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400`;}
      const nonce=crypto.randomUUID(),token=await signed(env.REPORT_ENCRYPTION_KEY,{id:input.id,digest:input.digest,visitor:visitor.id,nonce,bits:16,exp:Date.now()+300000},'proof');
      return json({token,nonce,bits:16},200,setCookie?{'Set-Cookie':setCookie}:{});
    }
    if(!visitor)throw new ReportError(400,'回報驗證已過期，請重試。');
    const form=await new Response(await bounded(request,LIMIT+100000),{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();
    const report=await validateReport(form),digest=await payloadDigest(report.files);
    await checkProof(env,form.get('challenge'),Number(form.get('proof')),report.id,digest,visitor.id);
    const hour=Math.floor(Date.now()/3600000);await consumeQuota(env.BUCKET,`quota/visitor/${visitor.id}/${hour}`,HOURLY_LIMIT,(hour+1)*3600000);
    return json(await uploadReport(report,env,{config}));
  }catch(error){
    // Do not log OAuth codes, private keys, JWTs, file content or provider bodies.
    console.error('Yoga report failure',{status:error.status||500,path:url.pathname});
    return json({message:error instanceof ReportError?error.message:'回報尚未確認完成，請保留這份回報重試。',retryAfterMs:error.retryAfterMs||0},error.status||500);
  }
}};
