// All connector capability comes from this visitor's request-scoped binding.
const REPO='WangChengYeh/Yoga2', CONNECTOR='connector_76869538009648d5b282a4bb21c3d157';
const PAGES='https://wangchengyeh.github.io';
const LIMIT=8*1024*1024;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(data,status=200)=>Response.json(data,{status,headers});
class ReportError extends Error {constructor(status,message,detail){super(message);this.status=status;this.detail=detail;}}
export function unwrap(result){
  let x=result?.structuredContent??result;
  for(let i=0;i<5;i++){
    if(x?.structuredContent){x=x.structuredContent;continue;}
    if(typeof x?.content==='string'){try{x=JSON.parse(x.content);continue;}catch{}}
    if(Array.isArray(x?.content)){const text=x.content.find(v=>v.type==='text')?.text;try{x=JSON.parse(text);continue;}catch{}}
    return x;
  }return x;
}
async function sha(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
function base64(bytes){let out='';for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(out);}
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
export async function uploadReport(report,user,binding){
  if(!binding?.invoke)throw new ReportError(503,'這個請求尚未提供 GitHub 連線。');
  // These actions are a closed server-owned allowlist. Browser data never selects
  // a connector, repository, action, URL, path, title or Markdown content.
  const known=['fetch','create_blob','create_tree','create_commit','create_branch','create_issue'];
  const context=await binding.getContext?.();
  const metadata=context?.status==='success'?context.connectors.find(c=>c.connectorId===CONNECTOR):null;
  const actionNames=new Map(known.map(action=>[action,action]));
  if(metadata?.tools){for(const action of known){const tool=metadata.tools.find(t=>t.actionName===action||t.actionName.endsWith(`_${action}`));if(!tool)throw new ReportError(503,`GitHub 缺少 ${action} 能力。`);actionNames.set(action,tool.actionName);}}
  const invoke=async(action,args)=>{
    const result=await binding.invoke(CONNECTOR,actionNames.get(action),args);
    if(result?.status!=='success')throw new ReportError(result?.status==='reauthentication_required'?401:result?.status==='rate_limited'?429:502,result?.message||'GitHub 未確認操作完成。',{status:result?.status,requestId:result?.requestId,retryAfterMs:result?.retryAfterMs,result:result?.result});
    return unwrap(result.result);
  };
  const read=path=>invoke('fetch',{url:`https://api.github.com/repos/${REPO}/${path}`});
  const token=(await sha(new TextEncoder().encode(`${user}:${report.id}`))).slice(0,32);
  const marker=`yoga-debug-${token}`;
  // Non-indexed list avoids relying on GitHub Search's indexing delay. A lock
  // still prevents a duplicate if a completed issue falls outside this page.
  const existing=await read('issues?state=all&per_page=100&sort=created&direction=desc');
  const found=(Array.isArray(existing)?existing:[]).find(i=>i.body?.includes(`<!-- ${marker} -->`));
  if(found)return {url:found.html_url,reused:true};
  const main=await read('branches/main'), parent=main.commit?.sha;
  if(!/^[a-f0-9]{40}$/.test(parent||''))throw new ReportError(502,'GitHub 未回傳主分支版本。');
  const entries=[];
  for(const f of report.files){const blob=await invoke('create_blob',{repository_full_name:REPO,encoding:'base64',content:base64(f.bytes)});if(!blob.sha)throw new ReportError(502,'GitHub 附件儲存未確認。');entries.push({path:f.name,mode:'100644',type:'blob',sha:blob.sha});}
  const tree=await invoke('create_tree',{repository_full_name:REPO,tree_elements:entries});
  const digest=await sha(new TextEncoder().encode(entries.map(e=>e.sha).join(',')));
  const commit=await invoke('create_commit',{repository_full_name:REPO,parent_sha:parent,tree_sha:tree.sha,message:`Yoga debug ${token} ${digest}`});
  if(!/^[a-f0-9]{40}$/.test(commit.sha||''))throw new ReportError(502,'GitHub 附件版本未確認。');
  const branch=`debug-reports/${token}`;
  // GitHub's create-ref is atomic: exactly one caller can claim this report.
  // A transport error may have claimed it. Never replay create_issue on retry.
  try{await invoke('create_branch',{repository_full_name:REPO,branch_name:branch,sha:commit.sha});}
  catch(error){throw new ReportError(error.status||409,'尚未確認回報結果，或同一份回報已送出。請查看 GitHub 最新 Issues；重試會先檢查既有回報。',error.detail);}
  const raw=`https://raw.githubusercontent.com/${REPO}/${commit.sha}`;
  const link=name=>`${raw}/${name}`;
  const view=report.diagnostics.viewport||{},screen=view.window||{};
  const body=[`<!-- ${marker} -->`,`自 Yoga2 使用者按下「回報問題」提交。回報 ID：\`${report.id}\`。`,`版本：\`v${report.diagnostics.version}\`；視窗：${Number(screen.width)||0} × ${Number(screen.height)||0}；DPR：${Number(view.dpr)||1}。`,
    report.files.some(f=>f.name==='camera.png')?`### 原始相機輸入\n![camera](${link('camera.png')})`:'相機輸入缺失，請查看 diagnostics.json 的原因。',
    report.files.some(f=>f.name==='scene.png')?`### 合成練習畫面\n![scene](${link('scene.png')})`:'場景擷取失敗，請查看 captureErrors。',
    `[診斷 JSON](${link('diagnostics.json')}) · [下載 ZIP](${link('report.zip')})`,
    `附件保存在 \`${branch}\`，未合入 main。`].join('\n\n');
  const issue=await invoke('create_issue',{repository_full_name:REPO,title:`[除錯 v${report.diagnostics.version}] ${token.slice(0,8)}`,body});
  const url=issue.html_url||issue.url||issue.issue?.html_url||issue.issue?.url;
  if(!new RegExp(`^https://github.com/${REPO}/issues/\\d+$`).test(url||''))throw new ReportError(502,'Issue 已送出但未確認連結，請查看 GitHub 最新 Issues。');
  return {url,reused:false};
}
const page=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yoga2 除錯回報</title><style>body{font:16px/1.6 system-ui;background:#f3f7f2;color:#163e35;margin:0;padding:5vw}main{max-width:640px;margin:auto}button,a{font:inherit}button{padding:.7rem 1rem;border-radius:1rem;background:#174f43;color:white;border:0}a{color:#075a49}#retry[hidden],#connect[hidden]{display:none}</style><main><h1>Yoga2 除錯回報</h1><p>只在你按下回報時，將相機圖、場景截圖、版號與裝置診斷上傳至 WangChengYeh/Yoga2 的公開 GitHub Issue。</p><p id="status" role="status">等待練習頁傳入畫面。首次使用請完成登入與 GitHub 授權。</p><button id="retry" hidden>重試這份回報</button> <a id="connect" hidden target="_top">登入／重新連接 GitHub</a><p><a href="https://github.com/WangChengYeh/Yoga2/issues" target="_blank" rel="noopener">查看 GitHub Issues</a></p></main><script>
const origin=${JSON.stringify(PAGES)},id=new URLSearchParams(location.search).get('id');let report,busy=false,retryAt=0;
const status=document.getElementById('status'),retry=document.getElementById('retry'),connect=document.getElementById('connect');
connect.href='/signin-with-chatgpt?return_to='+encodeURIComponent('/?id='+encodeURIComponent(id||''));
function notify(type,data={}){window.opener?.postMessage({type,id,...data},origin);}
async function send(){if(busy||!report||Date.now()<retryAt)return;busy=true;retry.hidden=true;connect.hidden=true;status.textContent='正在上傳附件並建立 GitHub Issue…';const form=new FormData();form.set('id',id);form.set('consent','upload-to-public-github');for(const f of report.files)form.set(f.name,f.blob,f.name);
try{const response=await fetch('/api/report',{method:'POST',body:form,headers:{'X-Yoga-Report':'1'}});const data=await response.json();if(!response.ok){if(response.status===401)connect.hidden=false;const delay=Math.min(3600000,Math.max(0,Number(data.connector?.retryAfterMs)||0));retryAt=Date.now()+delay;throw Object.assign(Error(data.message||'回報失敗'),{retryAfterMs:delay});}if(typeof data.url!=='string'||!data.url.startsWith('https://github.com/WangChengYeh/Yoga2/issues/')||!(/^[0-9]+$/).test(data.url.slice('https://github.com/WangChengYeh/Yoga2/issues/'.length)))throw Error('回報連結無效');status.textContent='已建立 Issue：';const a=document.createElement('a');a.href=data.url;a.textContent=data.url;a.target='_blank';a.rel='noopener';status.append(a);notify('yoga-report-success',{url:data.url});report=null;}catch(e){status.textContent=e.message;retry.hidden=false;notify('yoga-report-error',{message:e.message,retryAfterMs:e.retryAfterMs||0});}finally{busy=false;}}
window.addEventListener('message',e=>{if(e.origin!==origin||e.source!==window.opener||e.data?.type!=='yoga-report-package'||e.data.id!==id||report||busy)return;report=e.data;clearInterval(ready);void send();});retry.onclick=send;const ready=setInterval(()=>notify('yoga-report-ready'),700);notify('yoga-report-ready');
</script></html>`;
export default {async fetch(request,env,ctx){
  const url=new URL(request.url),user=request.headers.get('oai-authenticated-user-id');
  if(request.method==='GET'&&url.pathname==='/'){
    if(!user)return Response.redirect(`${url.origin}/signin-with-chatgpt?return_to=${encodeURIComponent(url.pathname+url.search)}`,302);
    return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
  }
  if(request.method==='GET'&&url.pathname==='/api/capabilities'){if(!user)return json({message:'Sign in required'},401);return json(await ctx?.props?.CONNECTORS?.getContext?.()||{status:'binding_unavailable'});}
  if(url.pathname!=='/api/report'||request.method!=='POST')return json({message:'Not found'},404);
  if(!user)return json({message:'請先登入 ChatGPT 並連接 GitHub。'},401);
  if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Yoga-Report')!=='1')return json({message:'回報來源不符。'},403);
  if(Number(request.headers.get('Content-Length'))>LIMIT+100000)return json({message:'回報上限 8 MB。'},413);
  try{
    // Bound streamed requests too; do not rely solely on Content-Length.
    const reader=request.body?.getReader();if(!reader)throw new ReportError(400,'缺少回報內容。');const chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT+100000){await reader.cancel();throw new ReportError(413,'回報上限 8 MB。');}chunks.push(value);}
    const body=new Blob(chunks),form=await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();
    const report=await validateReport(form);return json(await uploadReport(report,user,ctx?.props?.CONNECTORS));
  }catch(e){console.error('Yoga report failure',{status:e.status||500,connectorStatus:e.detail?.status,requestId:e.detail?.requestId});return json({message:e instanceof ReportError?e.message:'回報未確認完成，請查看 Issues 後重試。',...(e.detail?{connector:e.detail}:{})},e.status||500);}
}};
