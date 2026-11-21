import { APP_VERSION } from './release.js?v=0.9.13';
import { pairedFrame, viewportDiagnostics, reportFiles, trustedMessage } from './report-core.js?v=0.9.13';

const toBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('截圖編碼失敗')),'image/png'));
export async function captureReport({stage, human, render, diagnostics, screenshot, win=window, doc=document, id=crypto.randomUUID(),images=true,fallbackReason=null}) {
  if(!images){
    const data={schema:1,id,version:APP_VERSION,createdAt:new Date().toISOString(),captureMode:'diagnostics-only',page:{origin:win.location.origin,path:win.location.pathname},userAgent:win.navigator.userAgent,viewport:viewportDiagnostics(win,doc,stage,null),...diagnostics(),missingCamera:true,missingScene:true,captureErrors:[fallbackReason==='image-capture-failed'?'Full image capture failed; diagnostic-only fallback without renderer or screenshot.':'Images omitted by user; no renderer or screenshot invoked.']};
    return {id,diagnostics:data,files:await reportFiles(data,null,null)};
  }
  const errors=[], stamp=performance.now(), snapshot=human?.snapshot, frame=pairedFrame(snapshot,stamp);
  // Everything up to screenshot()'s synchronous DOM clone uses one accepted
  // inference frame. Never draw a newer live video frame for the input image.
  let input, frozen;
  if(frame) {input=doc.createElement('canvas');input.width=frame.width;input.height=frame.height;const ctx=input.getContext('2d');const pixels=ctx.createImageData(frame.width,frame.height);pixels.data.set(snapshot.frame.rgba);ctx.putImageData(pixels,0,0);}
  let canvas;
  try{canvas=render();if(canvas){frozen=doc.createElement('canvas');frozen.width=canvas.width;frozen.height=canvas.height;frozen.getContext('2d').drawImage(canvas,0,0);}}catch(e){errors.push(`3D: ${e.message}`);}
  if(!input){const video=doc.getElementById('camera-video');if(video?.srcObject&&video.readyState>=2&&video.videoWidth){input=doc.createElement('canvas');const ratio=Math.min(1,512/Math.max(video.videoWidth,video.videoHeight));input.width=Math.round(video.videoWidth*ratio);input.height=Math.round(video.videoHeight*ratio);input.getContext('2d').drawImage(video,0,0,input.width,input.height);}}
  const data={schema:1,id,version:APP_VERSION,createdAt:new Date().toISOString(),captureMode:'full',captureTime:stamp,page:{origin:win.location.origin,path:win.location.pathname},userAgent:win.navigator.userAgent,viewport:viewportDiagnostics(win,doc,stage,canvas),frame,cameraSource:frame?'inference-frame':input?'live-fallback-unpaired':'missing',missingCamera:!input,...diagnostics(),captureErrors:errors};
  let scene;
  try {
    const rect=stage.getBoundingClientRect();
    const scale=Math.min(1.5,2048/Math.max(rect.width,rect.height));
    // html2canvas clones DOM synchronously; onclone replaces WebGL with the
    // synchronous frozen raster instead of relying on preserveDrawingBuffer.
    scene=await screenshot(stage,{scale,backgroundColor:'#e6eee5',logging:false,allowTaint:false,useCORS:true,onclone:clone=>{const target=clone.querySelector('#viewport canvas');if(target&&frozen){const replacement=clone.createElement('canvas');replacement.width=frozen.width;replacement.height=frozen.height;replacement.style.cssText=target.style.cssText;replacement.getContext('2d').drawImage(frozen,0,0);target.replaceWith(replacement);}}});
    data.screenshot={width:scene.width,height:scene.height,scope:'practice-stage-with-controls'};
  } catch(e){errors.push(`場景截圖: ${e.message}`);}
  const encoded=await Promise.allSettled([input?toBlob(input):null,scene?toBlob(scene):null]);
  const [cameraBlob,sceneBlob]=encoded.map((r,i)=>{if(r.status==='fulfilled')return r.value;errors.push(`${i===0?'相機':'場景'}編碼失敗: ${r.reason?.message}`);return null;});
  data.missingCamera=!cameraBlob;data.missingScene=!sceneBlob;
  return {id,diagnostics:data,files:await reportFiles(data,cameraBlob,sceneBlob)};
}
export function setupReportPanel({capture,endpoint,win=window,doc=document,onEvent=()=>{}}) {
  const download=doc.getElementById('report-download'),logs=doc.getElementById('report-logs'),link=doc.getElementById('report-local-link');
  let localURL=null,capturing=null,capturingId=null,localBusy=false,disposed=false;
  const button=doc.getElementById('report-problem'),status=doc.getElementById('report-status'),notice=status.closest('.report-notice'),dismiss=doc.getElementById('report-dismiss');
  dismiss?.addEventListener('click',()=>{if(notice)notice.dataset.active='false';dismiss.hidden=true;});
  const showNotice=()=>{if(notice)notice.dataset.active='true';if(dismiss)dismiss.hidden=false;};
  let report,popup,timer,started=0,busy=false,retryAt=0;
  const message=text=>{status.textContent=text;showNotice();};
  const finish=()=>{busy=false;button.disabled=false;if(localURL)download.textContent=report?'下載同份回報':'重新擷取除錯包';button.textContent=report?'重試回報':'回報問題';clearInterval(timer);};
  const getCapture=(id,options)=>{
    if(capturing)return capturing;
    capturingId=id;capturing=Promise.resolve().then(()=>capture(id,options)).finally(()=>{capturing=null;capturingId=null;});return capturing;
  };
  async function saveLocal(images){
    if(localBusy||disposed)return;
    localBusy=true;download.disabled=logs.disabled=true;
    try{
      message(images?'正在打包相機、場景與日誌；只儲存到本機，不會上傳。':'正在打包精簡日誌；不擷取圖片，也不會上傳。');
      let pack;onEvent('report-capture',{phase:images?'full':'logs'});
      try{pack=images?(report||await getCapture(crypto.randomUUID(),{images:true})):await capture(crypto.randomUUID(),{images:false});}
      catch(error){
        if(!images)throw error;
        onEvent('report-capture-error',{code:'full-capture-failed'});message('圖片擷取失敗，改打包精簡日誌…');pack=await getCapture(crypto.randomUUID(),{images:false,fallbackReason:'image-capture-failed'});
      }
      if(disposed)return;
      const zip=pack.files.find(file=>file.name==='report.zip')?.blob;
      if(!zip)throw new Error('除錯包缺少 ZIP');
      const next=win.URL.createObjectURL(zip);if(localURL)win.URL.revokeObjectURL(localURL);localURL=next;
      const version=/^\d+\.\d+\.\d+$/.test(pack.diagnostics.version)?pack.diagnostics.version:APP_VERSION;
      const safeId=String(pack.id).replace(/[^a-zA-Z0-9-]/g,'').slice(0,64)||'local';
      link.href=localURL;link.download=`yoga2-v${version}-${safeId}.zip`;link.hidden=false;link.textContent=`儲存 ZIP（${(zip.size/1024/1024).toFixed(2)} MB）`;
      message(`${pack.diagnostics.captureMode==='diagnostics-only'?'精簡日誌':'除錯包'}已備妥；若未自動下載，請點「儲存 ZIP」。檔案只在本機，需自行上傳分享。`);
      try{link.click();}catch{/* The persistent link permits a fresh trusted click on mobile. */}
      download.textContent=report?'下載同份回報':'重新擷取除錯包';onEvent('report-download-ready',{phase:pack.diagnostics.captureMode==='diagnostics-only'?'logs':'full'});
    }catch(error){onEvent('report-capture-error',{code:'capture-failed'});message(`無法建立下載包：${error.message}。可重試「下載精簡日誌」。`);}
    finally{localBusy=false;download.disabled=logs.disabled=false;}
  }
  download.addEventListener('click',()=>saveLocal(true));logs.addEventListener('click',()=>saveLocal(false));
  const receive=async event=>{
    if(!report||!trustedMessage(event,popup,new URL(endpoint).origin,report.id))return;
    if(event.data.type==='yoga-report-ready') {popup.postMessage({type:'yoga-report-package',...report},new URL(endpoint).origin);message('正在傳送這份回報…');}
    if(event.data.type==='yoga-report-success'&&/^https:\/\/github\.com\/WangChengYeh\/Yoga2\/issues\/\d+$/.test(event.data.url)){
      showNotice();status.textContent='回報成功 ';const a=doc.createElement('a');a.href=event.data.url;a.textContent='開啟 GitHub Issue';a.target='_blank';a.rel='noopener';status.append(a);report=null;finish();
    }
    if(event.data.type==='yoga-report-error'){retryAt=Date.now()+Math.min(3600000,Math.max(0,Number(event.data.retryAfterMs)||0));message(`尚未確認完成：${String(event.data.message).slice(0,240)}。可按重試回報。`);finish();}
  };
  win.addEventListener('message',receive);
  button.addEventListener('click',async()=>{
    if(busy||disposed)return;
    if(Date.now()<retryAt){message(`GitHub 要求稍候，請在 ${Math.ceil((retryAt-Date.now())/1000)} 秒後重試。`);return;}
    if(!endpoint){message('回報服務尚未設定，請更新版本後再試。');return;}
    busy=true;button.disabled=true;started=Date.now();
    const id=report?.id||capturingId||crypto.randomUUID();
    // Open during the visitor click, before any await (mobile popup rules).
    popup=win.open(`${endpoint}/?id=${encodeURIComponent(id)}`,'yoga-debug-report');
    if(!popup){message('瀏覽器阻擋回報視窗，請允許彈出式視窗後重試。');finish();return;}
    try {message(report?'重試同一份回報…':'正在擷取畫面，準備匿名回報…');report ||= await getCapture(id,{images:true});if(disposed){finish();return;}button.textContent='回報處理中';
      // Popup repeats ready until it receives the package, including after sign-in.
      timer=setInterval(()=>{if(popup.closed||Date.now()-started>180000){message('回報尚未確認完成，可重試同一份回報。');finish();}},1000);
    }catch(e){message(`擷取失敗：${e.message}`);finish();}
  });
  return {dispose(){disposed=true;win.removeEventListener('message',receive);clearInterval(timer);if(localURL)win.URL.revokeObjectURL(localURL);localURL=null;link.hidden=true;link.removeAttribute?.('href');}};
}
