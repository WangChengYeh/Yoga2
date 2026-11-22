import { cameraPreferences } from './camera-settings.js?v=0.9.21';
import { humanObservation, humanContext } from './coach-context.js?v=0.9.21';
import { CameraSession } from './camera-session.js?v=0.9.21';
import { createPoseEngine } from './pose-engine.js?v=0.9.21';
import { CONNECTIONS, visible, observePose, FeedbackFilter, feedbackKey, isFreshResult } from './pose-rules.js?v=0.9.21';

export function setupPosePanel({ scheduler=null,getCaps=()=>({camera:60,analysis:15,maxSide:512}),onTiming=()=>{},getFrame, isPlaying, isPowerSaving, human, onMediaState=()=>{},onRuntime=()=>{},onObservation=()=>{},onMemoryEvent=()=>{} }) {
  const $ = (id) => document.getElementById(id);
  const preference=cameraPreferences();$('camera-fps').value=String(preference.value.cameraFPS);$('analysis-fps').value=String(preference.value.analysisFPS);
  const video = $('camera-video'), overlay = $('camera-overlay'), preview = $('camera-preview');
  const ctx = overlay.getContext('2d');
  const lightCanvas = document.createElement('canvas'); lightCanvas.width = lightCanvas.height = 16;
  const lightContext = lightCanvas.getContext('2d', { willReadFrequently: true });
  const filter = new FeedbackFilter();
  let key = null,latestObservation=null;
  let summary = {valid:false,message:'',updatedAt:0};
  const getKey = () => feedbackKey(getFrame(), isPlaying());
  const clear = () => ctx?.clearRect(0, 0, overlay.width, overlay.height);
  function feedback(message, kind = 'info') {
    summary = { valid: kind === 'observed' || kind === 'hint', message, updatedAt: performance.now() };
    $('camera-feedback').textContent = message;
    $('camera-feedback').dataset.kind = kind;
  }
  const config = document.documentElement.dataset;
  const sdkRoot = config.visionRoot || new URL('./vendor/mediapipe/', location.href).href;
  const modelUrl = config.poseModelUrl || new URL('./models/pose_landmarker_lite.task', location.href).href;
  const segmentationModelUrl=config.segmentationModelUrl || new URL('./models/selfie_multiclass_256x256.tflite',location.href).href;
  const effective=()=>({camera:Math.min(preference.value.cameraFPS,getCaps().camera),analysis:Math.min(preference.value.analysisFPS,getCaps().analysis),maxSide:getCaps().maxSide});
  const updatePolicy=()=>{void session.setFPS(effective().camera);fpsStatus();};
  function fpsStatus(){const f=session.fpsDiagnostics;const text=`相機選擇 ${preference.value.cameraFPS} FPS，生效上限 ${f.requested} FPS，協商 ${f.negotiated??'未知'} FPS；辨識上限 ${effective().analysis} FPS。${f.status==='failed'?'設定失敗，維持原串流。':f.status==='unsupported'?'此瀏覽器不支援即時調整，重新開相機才套用。':''}`;$('camera-fps-status').textContent=text;}
  const session = new CameraSession({scheduler,onTiming,requestedFPS:preference.value.cameraFPS,onFPS:fps=>{fpsStatus();onRuntime('camera-fps',{phase:fps.status,requestedFPS:fps.requested,negotiatedFPS:fps.negotiated,analysisFPS:preference.value.analysisFPS,code:fps.error||'none'});},
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
      if (phase !== 'active') { latestObservation=null; clear(); filter.reset(); key = null; }
      feedback(message, phase === 'error' ? 'setup' : 'info');
      onMediaState();
      document.querySelector('.studio').classList.toggle('camera-on', showPreview);
    },
    onStale: () => {latestObservation=null;onRuntime('camera-stale',{phase:session.engine?.diagnostics?.stage||'unknown'}); human?.stale(); clear(); filter.reset(); feedback('相機畫面未及時更新，暫停動作判斷。', 'setup'); },
    onResult: (data, now) => {
      human?.accept(data,now);
      if (!isFreshResult(data, getKey(), now)) { clear(); filter.reset(); return; }
      if (video.videoWidth && video.videoHeight) {
        preview.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        overlay.width = video.videoWidth; overlay.height = video.videoHeight;
      }
      clear();
      const observation = observePose(data.landmarks, data.context.frame, { playing: data.context.playing, aspect: video.videoWidth / video.videoHeight, brightness: data.brightness });
      if (observation.valid && data.landmarks?.length === 1 && ctx) {
        const points = data.landmarks[0];
        ctx.strokeStyle = '#bdf9c8'; ctx.lineWidth = Math.max(2, overlay.width / 160);
        for (const [a, b] of CONNECTIONS) {
          if (!visible(points[a]) || !visible(points[b])) continue;
          ctx.beginPath(); ctx.moveTo(points[a].x * overlay.width, points[a].y * overlay.height);
          ctx.lineTo(points[b].x * overlay.width, points[b].y * overlay.height); ctx.stroke();
        }
      }
      const stable = filter.update(observation, data.context.key, now);
      latestObservation=humanObservation(data,observation,stable);
      onObservation(data,observation,stable);
      feedback(stable.message, stable.kind);
    },
  });
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
    get active() { return session.phase === 'active'; },
    get diagnostics(){return {settings:preference.value,effective:effective(),processingFPSCap:Math.min(effective().camera,effective().analysis),phase:session.phase,mode:session.engine?.mode||null,pipeline:session.diagnostics,summary:{...summary},video:{width:video.videoWidth,height:video.videoHeight,readyState:video.readyState}};},
    get summary() { return { ...summary, active: session.phase === 'active' }; },
    contextChanged() {
      const next = getKey();
      if (key !== next) {
        key = next; filter.reset(); clear();
        if (session.phase === 'active') feedback('正在確認目前動作，畫面穩定後提供觀察。');
      }
    },
  };
}
