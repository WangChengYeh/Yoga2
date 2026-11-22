import { setupCameraPreviewLayout } from './camera-preview-layout.js?v=0.9.34';
import { HintManager } from './hint-manager.js?v=0.9.34';
import { PoseEvaluationEngine } from './pose-evaluation.js?v=0.9.34';
import { createPoseDebugOverlay } from './pose-debug.js?v=0.9.34';
import { CAMERA_FPS, cameraPreferences } from './camera-settings.js?v=0.9.34';
import { humanObservation, humanContext } from './coach-context.js?v=0.9.34';
import { CameraSession } from './camera-session.js?v=0.9.34';
import { createPoseEngine } from './pose-engine.js?v=0.9.34';
import { feedbackKey, isFreshResult } from './pose-rules.js?v=0.9.34';

export function setupPosePanel({ scheduler=null,onHintChange=()=>{},createSession=options=>new CameraSession(options),onEvaluationTiming=()=>{},now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),getCaps=()=>({camera:60,analysis:15,maxSide:512}),onTiming=()=>{},onSourceFrame=()=>{},getFrame, isPlaying, isPowerSaving, human, onMediaState=()=>{},onRuntime=()=>{},onObservation=()=>{},onMemoryEvent=()=>{} }) {
  const $ = (id) => document.getElementById(id);
  const preference=cameraPreferences();$('camera-fps').value=String(preference.value.cameraFPS);$('analysis-fps').value=String(preference.value.analysisFPS);
  const video = $('camera-video'), overlay = $('camera-overlay'), preview = $('camera-preview');
  const previewLayout=setupCameraPreviewLayout({preview,frame:$('camera-debug-frame'),video});
  const debugOverlay=createPoseDebugOverlay({canvas:overlay,enabled:()=>Boolean($('camera-debug')?.checked)});
  const lightCanvas = document.createElement('canvas'); lightCanvas.width = lightCanvas.height = 16;
  const lightContext = lightCanvas.getContext('2d', { willReadFrequently: true });
  const evaluator = new PoseEvaluationEngine();
  const hints=new HintManager({now});
  let evaluationTimer=null;
  function resetEvaluation(){clearTimer(evaluationTimer);evaluationTimer=null;evaluator.reset();hints.reset();latestObservation=null;}
  let key = null,latestObservation=null;
  let summary = {valid:false,message:'',updatedAt:0};
  const getKey = () => feedbackKey(getFrame(), isPlaying());
  const clear = () => debugOverlay.clear();
  function feedback(message, kind = 'info') {
    summary = { kind,valid: kind === 'observed' || kind === 'hint', message, updatedAt: now() };
    if($('camera-feedback').textContent!==message)$('camera-feedback').textContent = message;
    $('camera-feedback').dataset.kind = kind;onHintChange();
  }
  const config = document.documentElement.dataset;
  const sdkRoot = config.visionRoot || new URL('./vendor/mediapipe/', location.href).href;
  const modelUrl = config.poseModelUrl || new URL('./models/pose_landmarker_lite.task', location.href).href;
  const segmentationModelUrl=config.segmentationModelUrl || new URL('./models/selfie_multiclass_256x256.tflite',location.href).href;
  const effective=()=>{const caps=getCaps(),f=caps.cpuFactor??1,camera=Math.min(preference.value.cameraFPS*f,caps.camera);return {camera:CAMERA_FPS.filter(v=>v<=camera).at(-1)||5,analysis:Math.min(preference.value.analysisFPS*f,caps.analysis),maxSide:caps.maxSide};};
  const updatePolicy=()=>{void session.setFPS(effective().camera);fpsStatus();};
  function fpsStatus(){const f=session.fpsDiagnostics;const text=`相機選擇 ${preference.value.cameraFPS} FPS，生效上限 ${f.requested} FPS，協商 ${f.negotiated??'未知'} FPS；辨識上限 ${effective().analysis} FPS。${f.status==='failed'?'設定失敗，維持原串流。':f.status==='unsupported'?'此瀏覽器不支援即時調整，重新開相機才套用。':''}`;$('camera-fps-status').textContent=text;}
  const session = createSession({scheduler,onTiming,onSourceFrame,requestedFPS:effective().camera,onFPS:fps=>{fpsStatus();onRuntime('camera-fps',{phase:fps.status,requestedFPS:fps.requested,negotiatedFPS:fps.negotiated,analysisFPS:preference.value.analysisFPS,code:fps.error||'none'});},
    video, mediaDevices: navigator.mediaDevices, secure: window.isSecureContext,
    createEngine: signal => createPoseEngine({ moduleUrl: `${sdkRoot}vision_bundle.mjs`, wasmRoot: `${sdkRoot}wasm`, modelUrl, segmentationModelUrl },{onMemoryEvent,signal}),
    minInterval: () => Math.max(isPowerSaving()?350:0,1000/Math.min(effective().camera,effective().analysis)),
    getContext: () => ({ key: getKey(), frame: getFrame(), playing: isPlaying(), ...human?.context,maxSide:effective().maxSide }),
    measureLight: () => {
      if (!lightContext) return null;
      try {
        lightContext.drawImage(video, 0, 0, 16, 16);
        const pixels = lightContext.getImageData(0, 0, 16, 16).data;
        let sum = 0; for (let i = 0; i < pixels.length; i += 4) sum += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        return sum / 256;
      } catch { return null; }
    },
    onState: ({ phase, message, preview: showPreview }) => {
      onRuntime('camera',{phase});fpsStatus();
      const running = ['requesting', 'loading', 'active'].includes(phase);
      human?.cameraState(phase === 'active');
      $('camera-toggle').textContent = running ? '關閉相機' : phase === 'error' ? '重試開啟相機' : '開啟相機';
      $('camera-toggle').setAttribute('aria-pressed', running);
      $('camera-status').textContent = phase === 'active' ? '本機觀察中' : phase === 'requesting' ? '等待相機權限' : phase === 'loading' ? '準備辨識中' : phase === 'error' ? '暫時無法啟用' : '相機未開啟';
      preview.hidden = !showPreview;
      if (phase !== 'active') { latestObservation=null; clear(); resetEvaluation(); key = null; }
      feedback(message, phase === 'error' ? 'setup' : 'info');
      onMediaState();
      document.querySelector('.studio').classList.toggle('camera-on', showPreview);
    },
    onStale: () => {latestObservation=null;onRuntime('camera-stale',{phase:session.engine?.diagnostics?.stage||'unknown'}); human?.stale(); clear(); resetEvaluation(); feedback('相機畫面未及時更新，暫停動作判斷。', 'setup'); },
    onResult: (data, now) => {
      human?.accept({...data,aspect:video.videoWidth/video.videoHeight},now);
      if (video.videoWidth && video.videoHeight) {
        previewLayout.update();
        overlay.width = video.videoWidth; overlay.height = video.videoHeight;
      }
      debugOverlay.update(data,now);
      if (!isFreshResult(data, getKey(), now)) { resetEvaluation(); feedback('等待目前課程的新關節資料。'); return; }
      const started=performance.now();
      const stable=evaluator.update(data,data.context.frame,{now,playing:data.context.playing,aspect:video.videoWidth/video.videoHeight});
      const observation=evaluator.raw||stable;
      const finished=performance.now();onEvaluationTiming(started,finished);
      clearTimer(evaluationTimer);
      if(stable.expiresAt!==null)evaluationTimer=setTimer(()=>{resetEvaluation();feedback('相機關節資料已過期，等待新的觀察。','setup');},Math.max(0,stable.expiresAt-now));
      const display=hints.acceptEvaluation(stable,{scope:getKey()});
      const shown=display?{...stable,code:display.code,message:display.message,kind:display.kind}:stable;
      latestObservation=humanObservation(data,observation,shown);
      onObservation(data,observation,shown);
      feedback(shown.message,shown.kind);
    },
  });
  document.getElementById('camera-debug')?.addEventListener('change',event=>{preview.classList.toggle('camera-debug-visible',event.target.checked);preview.setAttribute('aria-hidden',String(!event.target.checked));previewLayout.update();debugOverlay.refresh();});
  $('camera-fps').addEventListener('change',()=>{preference.set({cameraFPS:$('camera-fps').value});$('camera-fps').value=String(preference.value.cameraFPS);updatePolicy();});
  $('analysis-fps').addEventListener('change',()=>{preference.set({analysisFPS:$('analysis-fps').value});$('analysis-fps').value=String(preference.value.analysisFPS);fpsStatus();onRuntime('camera-fps',{phase:'analysis-updated',requestedFPS:preference.value.cameraFPS,negotiatedFPS:session.fpsDiagnostics.negotiated,analysisFPS:preference.value.analysisFPS});});
  fpsStatus();
  $('camera-toggle').addEventListener('click', () => {
    if (['requesting', 'loading', 'active'].includes(session.phase)) session.stop();
    else void session.start();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && ['requesting', 'loading', 'active'].includes(session.phase)) session.stop('切到背景已關閉相機，回來後可重新開啟。'); });
  window.addEventListener('pagehide', () => session.stop());
  return {
    updatePolicy,
    start:()=>session.start(),
    stop:()=>session.stop(),
    get mediaStatus(){return {phase:session.phase,open:Boolean(session.stream)};},
    get memoryStatus(){const settings=session.stream?.getVideoTracks?.()[0]?.getSettings?.()||{};return {settings:preference.value,effective:effective(),processingFPSCap:Math.min(effective().camera,effective().analysis),fps:session.fpsDiagnostics,phase:session.phase,video:{width:video.videoWidth,height:video.videoHeight,negotiatedFPS:settings.frameRate??null,oneRGBAFrameBytesEstimate:video.videoWidth*video.videoHeight*4,decoderBuffersBytes:null},pipeline:session.diagnostics};},
    get aiContext(){return humanContext(latestObservation,{now:performance.now(),phase:session.phase,lesson:getFrame().lesson.id,videoWidth:video.videoWidth,videoHeight:video.videoHeight});},
    publishHint(hint,token){const accepted=hints.publish(hint,token);if(accepted)onHintChange();return accepted;},
    get displayHint(){return hints.snapshot()||(summary.kind==='setup'?{id:'camera-state',code:'camera-state',source:'camera',kind:'setup',message:summary.message,timestamp:summary.updatedAt,expiresAt:Infinity,context:{scope:getKey(),generation:0}}:null);},
    get active() { return session.phase === 'active'; },
    get diagnostics(){return {settings:preference.value,effective:effective(),processingFPSCap:Math.min(effective().camera,effective().analysis),phase:session.phase,mode:session.engine?.mode||null,pipeline:session.diagnostics,summary:{...summary},evaluation:evaluator.snapshot(now()),hints:hints.diagnostics,video:{width:video.videoWidth,height:video.videoHeight,readyState:video.readyState}};},
    get summary() { return { ...summary,valid:summary.valid&&evaluator.snapshot(now()).valid, active: session.phase === 'active' }; },
    contextChanged() {
      const next = getKey();
      if (key !== next) {
        key = next; resetEvaluation(); clear();
        if (session.phase === 'active') feedback('正在確認目前動作，畫面穩定後提供觀察。');
      }
    },
  };
}
