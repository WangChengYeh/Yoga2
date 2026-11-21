import { APP_VERSION } from './release.js?v=0.8.0';
import { pairedFrame, viewportDiagnostics, reportFiles, trustedMessage } from './report-core.js?v=0.8.0';

const toBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('截圖編碼失敗')),'image/png'));
export async function captureReport({stage, human, render, diagnostics, screenshot, win=window, doc=document, id=crypto.randomUUID()}) {
  const errors=[], stamp=performance.now(), snapshot=human?.snapshot, frame=pairedFrame(snapshot,stamp);
  // Everything up to screenshot()'s synchronous DOM clone uses one accepted
  // inference frame. Never draw a newer live video frame for the input image.
  let input, frozen;
  if(frame) {input=doc.createElement('canvas');input.width=frame.width;input.height=frame.height;const ctx=input.getContext('2d');const pixels=ctx.createImageData(frame.width,frame.height);pixels.data.set(snapshot.frame.rgba);ctx.putImageData(pixels,0,0);}
  let canvas;
  try{canvas=render();if(canvas){frozen=doc.createElement('canvas');frozen.width=canvas.width;frozen.height=canvas.height;frozen.getContext('2d').drawImage(canvas,0,0);}}catch(e){errors.push(`3D: ${e.message}`);}
  if(!input){const video=doc.getElementById('camera-video');if(video?.srcObject&&video.readyState>=2&&video.videoWidth){input=doc.createElement('canvas');const ratio=Math.min(1,512/Math.max(video.videoWidth,video.videoHeight));input.width=Math.round(video.videoWidth*ratio);input.height=Math.round(video.videoHeight*ratio);input.getContext('2d').drawImage(video,0,0,input.width,input.height);}}
  const data={schema:1,id,version:APP_VERSION,createdAt:new Date().toISOString(),captureTime:stamp,page:{origin:win.location.origin,path:win.location.pathname},userAgent:win.navigator.userAgent,viewport:viewportDiagnostics(win,doc,stage,canvas),frame,cameraSource:frame?'inference-frame':input?'live-fallback-unpaired':'missing',missingCamera:!input,...diagnostics(),captureErrors:errors};
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
export function setupReportPanel({capture,endpoint,win=window,doc=document}) {
  const button=doc.getElementById('report-problem'),status=doc.getElementById('report-status');
  let report,popup,timer,started=0,busy=false,retryAt=0;
  const message=text=>{status.textContent=text;};
  const finish=()=>{busy=false;button.disabled=false;button.textContent=report?'重試回報':'回報問題';clearInterval(timer);};
  const receive=async event=>{
    if(!report||!trustedMessage(event,popup,new URL(endpoint).origin,report.id))return;
    if(event.data.type==='yoga-report-ready') {popup.postMessage({type:'yoga-report-package',...report},new URL(endpoint).origin);message('正在傳送這份回報…');}
    if(event.data.type==='yoga-report-success'&&/^https:\/\/github\.com\/WangChengYeh\/Yoga2\/issues\/\d+$/.test(event.data.url)){
      status.textContent='回報成功 ';const a=doc.createElement('a');a.href=event.data.url;a.textContent='開啟 GitHub Issue';a.target='_blank';a.rel='noopener';status.append(a);report=null;finish();
    }
    if(event.data.type==='yoga-report-error'){retryAt=Date.now()+Math.min(3600000,Math.max(0,Number(event.data.retryAfterMs)||0));message(`尚未確認完成：${String(event.data.message).slice(0,240)}。可按重試回報。`);finish();}
  };
  win.addEventListener('message',receive);
  button.addEventListener('click',async()=>{
    if(busy)return;
    if(Date.now()<retryAt){message(`GitHub 要求稍候，請在 ${Math.ceil((retryAt-Date.now())/1000)} 秒後重試。`);return;}
    if(!endpoint){message('回報服務尚未設定，請更新版本後再試。');return;}
    busy=true;button.disabled=true;started=Date.now();
    const id=report?.id||crypto.randomUUID();
    // Open during the visitor click, before any await (mobile popup rules).
    popup=win.open(`${endpoint}/?id=${encodeURIComponent(id)}`,'yoga-debug-report');
    if(!popup){message('瀏覽器阻擋回報視窗，請允許彈出式視窗後重試。');finish();return;}
    try {message(report?'重試同一份回報…':'正在擷取畫面，準備登入與上傳…');report ||= await capture(id);button.textContent='回報處理中';
      // Popup repeats ready until it receives the package, including after sign-in.
      timer=setInterval(()=>{if(popup.closed||Date.now()-started>180000){message('回報尚未確認完成，可重試同一份回報。');finish();}},1000);
    }catch(e){message(`擷取失敗：${e.message}`);finish();}
  });
  return {dispose(){win.removeEventListener('message',receive);clearInterval(timer);}};
}
