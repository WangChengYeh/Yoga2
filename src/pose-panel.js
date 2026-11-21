import { humanObservation, humanContext } from './coach-context.js?v=0.9.19';
import { CameraSession } from './camera-session.js?v=0.9.19';
import { createPoseEngine } from './pose-engine.js?v=0.9.19';
import { CONNECTIONS, visible, observePose, FeedbackFilter, feedbackKey, isFreshResult } from './pose-rules.js?v=0.9.19';

export function setupPosePanel({ getFrame, isPlaying, isPowerSaving, human, onMediaState=()=>{},onRuntime=()=>{},onObservation=()=>{} }) {
  const $ = (id) => document.getElementById(id);
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
  const session = new CameraSession({
    video, mediaDevices: navigator.mediaDevices, secure: window.isSecureContext,
    createEngine: () => createPoseEngine({ moduleUrl: `${sdkRoot}vision_bundle.mjs`, wasmRoot: `${sdkRoot}wasm`, modelUrl, segmentationModelUrl }),
    minInterval: () => isPowerSaving() ? 350 : 180,
    getContext: () => ({ key: getKey(), frame: getFrame(), playing: isPlaying(), ...human?.context }),
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
      onRuntime('camera',{phase});
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
  $('camera-toggle').addEventListener('click', () => {
    if (['requesting', 'loading', 'active'].includes(session.phase)) session.stop();
    else void session.start();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && ['requesting', 'loading', 'active'].includes(session.phase)) session.stop('切到背景已關閉相機，回來後可重新開啟。'); });
  window.addEventListener('pagehide', () => session.stop());
  return {
    start:()=>session.start(),
    get mediaStatus(){return {phase:session.phase,open:Boolean(session.stream)};},
    get aiContext(){return humanContext(latestObservation,{now:performance.now(),phase:session.phase,lesson:getFrame().lesson.id,videoWidth:video.videoWidth,videoHeight:video.videoHeight});},
    get active() { return session.phase === 'active'; },
    get diagnostics(){return {phase:session.phase,mode:session.engine?.mode||null,pipeline:session.diagnostics,summary:{...summary},video:{width:video.videoWidth,height:video.videoHeight,readyState:video.readyState}};},
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
