import {createPracticeMat} from './practice-stage.js?v=0.9.39';
import {layoutAvatarPair,createPairSpacing} from './paired-stage.js?v=0.9.39';
import { createPersonalAvatar, exportAvatarGLB } from './personal-avatar.js?v=0.9.39';
import { setupAvatarPanel } from './avatar-panel.js?v=0.9.39';
import { createAvatarEnvelope, createAutoFraming, observeStageInsets } from './auto-framing.js?v=0.9.39';
import { setupHintDisplay } from './hint-display.js?v=0.9.39';
import { trackWebGLCompletion } from './gpu-completion.js?v=0.9.39';
import { TaskPerformance } from './task-performance.js?v=0.9.39';
import { setupTaskPerformancePanel } from './task-performance-panel.js?v=0.9.39';
import { performancePreferences } from './performance-policy.js?v=0.9.39';
import { DualWorkload } from './workload-budget.js?v=0.9.39';
import { WorkloadScheduler } from './workload-scheduler.js?v=0.9.39';
import { setupMemoryDiagnostics } from './memory-diagnostics.js?v=0.9.39';
import { webglMemory } from './webgl-memory.js?v=0.9.39';
import { coachContext } from './coach-context.js?v=0.9.39';
import { createActivityLog, trackActivityControls } from './activity-log.js?v=0.9.39';
import { setupRuntimeLog } from './runtime-log.js?v=0.9.39';
import { setupDefaultMedia } from './default-media.js?v=0.9.39';
import { setupFullscreenTools } from './fullscreen-tools.js?v=0.9.39';
import html2canvas from 'html2canvas';
import { captureReport, setupReportPanel } from './report-panel.js?v=0.9.39';
import { createSkeletonLayer, createCoachSkeletonSource, COACH_JOINTS } from './skeleton.js?v=0.9.39';
import { practiceLayout } from './practice-layout.js?v=0.9.39';
import { setupFullscreen } from './fullscreen.js?v=0.9.39';
import { setupStudentPanel } from './student-panel.js?v=0.9.39';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LESSONS, COURSE_DURATION, courseFrame, lessonStart, createPlayback, reducePlayback, formatTime } from './course.js?v=0.9.39';
import { prepareStandingCoach } from './rig.js?v=0.9.39';
import { setupPosePanel } from './pose-panel.js?v=0.9.39';
import { setupVoicePanel } from './voice-panel.js?v=0.9.39';

const runtimeLog=setupRuntimeLog({win:window,doc:document});
window.yogaAppStarted = true;
const $ = (id) => document.getElementById(id);
const state = { ...createPlayback(), ready: false, powerSaving: false };
const activityLog=createActivityLog({getState:()=>state});
trackActivityControls({doc:document,log:activityLog});
const recordActivity=(type,data)=>{runtimeLog.record(type,data);activityLog.record(type,data);if(type==='camera'||type==='camera-fps'||type==='ai-context')memoryLog.mark(type==='camera'&&data?.phase==='error'?'error':'boundary',{module:type.startsWith('camera')?'camera':'webllm',phase:data?.phase,code:type==='camera'&&data?.phase==='error'?'CAMERA_PIPELINE_ERROR':undefined});};
let activeLesson = -1;
let posePanel,taskPanel,renderCompletion,hintDisplay,personalAvatar;
const taskLog=new TaskPerformance({active:!document.hidden});
let voicePanel,defaultMedia;
let humanPanel, coachStage,coachEnvelope,autoFraming,autoInsets,dualView=false;
let coachSkeleton,coachSkeletonSource;
const pairSpacing=createPairSpacing();
let renderer, camera, scene, controls, pose, lastFrame = 0, lastRender = 0,sceneTask=null,scenePhase='scheduler',sceneErrorInfo=null;
const performancePreference=performancePreferences();
const adaptive=new DualWorkload({onChange:d=>{runtimeLog.record('workload',{phase:'factor-change',code:`cpu-${d.cpuFactor}-gpu-${d.gpuFactor}`});posePanel?.updatePolicy();applyRenderQuality();updatePerformanceStatus();}});
function renderProfile(){const p=performancePreference.value;return scheduler.profile({renderFPS:Math.max(5,p.renderFPS*Math.min(adaptive.cpuFactor,adaptive.gpuFactor)),renderCap:60,powerSaving:state.powerSaving});}
function applyRenderQuality(){if(renderer)renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,state.powerSaving?1:1.75)*adaptive.caps.pixelScale);}
function updatePerformanceStatus(){const p=performancePreference.value;$('workload-status').textContent=`CPU factor ${adaptive.cpuFactor.toFixed(2)} · GPU factor ${adaptive.gpuFactor.toFixed(2)} · 3D 上限 ${Math.max(5,p.renderFPS*Math.min(adaptive.cpuFactor,adaptive.gpuFactor))} FPS · AI 等待 ${p.responseSeconds} 秒`;}
const scheduler=new WorkloadScheduler({onEvent:e=>{if(e.kind!=='vision-frame')runtimeLog.record('scheduler',{phase:e.phase,source:e.kind});if(e.phase==='start'&&e.startedAt>e.queuedAt)taskLog.record(e.kind.startsWith('ai-')?'ai.wait':'vision.wait',e.queuedAt,e.startedAt);if(e.phase==='finish')taskLog.record(['ai-inference','ai-guidance'].includes(e.kind)?'ai.wall':e.kind==='ai-load'?'ai.load':e.kind==='vision-frame'?'vision.wall':'load.wall',e.startedAt,e.atMs);}});
scheduler.setHidden(document.hidden);adaptive.setHidden(document.hidden);
const memoryLog=setupMemoryDiagnostics({collect:()=>({taskPerformance:{...taskLog.memoryStatus,gpuCompletion:gpuCompletionState()},scheduler:{...scheduler.diagnostics,preferences:performancePreference.value,adaptive:adaptive.diagnostics},webllm:voicePanel?.memoryStatus||null,webgl:webglMemory(renderer,scene),camera:posePanel?.memoryStatus||null,human:humanPanel?.memoryStatus||null,personalAvatar:personalAvatar?.diagnostics||null}),requestWorker:()=>voicePanel?.requestMemory()});
function gpuCompletionState(){return {render:renderCompletion?.diagnostics||{status:'initializing'},llm:voicePanel?.memoryStatus?.gpuCompletion||{status:'initializing'}};}
function currentLayout(){return practiceLayout({aspect:camera.aspect,paired:dualView,fov:camera.fov});}
const lessonButtons = [];
for (const [index, lesson] of LESSONS.entries()) {
  const button = document.createElement('button');
  button.type = 'button'; button.disabled = true; button.dataset.lessonIndex=String(index);
  button.innerHTML = `<span class="lesson-number">${index + 1}</span><span class="lesson-item-name">${lesson.name}</span><span class="lesson-length">${formatTime(lesson.duration)}</span>`;
  button.setAttribute('aria-label', `選擇${lesson.name}`);
  button.addEventListener('click', () => dispatch({ type: 'seek', time: lessonStart(index), pause: true }));
  $('lesson-list').appendChild(button); lessonButtons.push(button);
}
$('seek').max = COURSE_DURATION;
$('course-total').textContent = formatTime(COURSE_DURATION);
function dispatch(action) {
  Object.assign(state, reducePlayback(state, action));
  if(action.type!=='tick')recordActivity('course',{phase:action.type,lesson:courseFrame(state.time).lesson.id});
  if(action.type==='speed')document.querySelectorAll('[data-speed]').forEach((button)=>button.setAttribute('aria-pressed',Number(button.dataset.speed)===state.speed));
  if (state.ready) { syncPlayback(); syncTime(); }
  voicePanel?.playbackChanged(action);
}

let framePending = false;

function showError(title, detail, code='not-ready') {
  renderCompletion?.stop();scheduler.block('scene-error');posePanel?.stop();voicePanel?.stopAI();runtimeLog.record('scene-error',{code});memoryLog.mark('error',{module:'scene',code});
  voicePanel?.silence();
  humanPanel?.unavailable();
  coachSkeleton?.dispose();coachSkeleton=null;
  state.playing = false;
  state.ready = false;
  $('loading').hidden = false;
  $('loading-title').textContent = title;
  $('loading-detail').textContent = detail;
  document.querySelector('.spinner').hidden = true;
  $('retry').hidden = false;
  $('playback-status').textContent = '尚未就緒';
  for (const id of ['play', 'restart', 'seek', 'stage-play']) $(id).disabled = true;
  lessonButtons.forEach((button) => { button.disabled = true; });
}
$('retry').addEventListener('click', () => location.reload());

function syncPlayback() {
  $('stage-play').textContent=state.playing?'暫停':state.time>=COURSE_DURATION?'再練一次':state.time>0?'繼續':'開始帶練';
  $('play-icon').textContent = state.playing ? 'Ⅱ' : '▶';
  $('play-label').textContent = state.playing ? '暫停課程' : state.time >= COURSE_DURATION ? '再練一次' : state.time > 0 ? '繼續課程' : '開始帶練';
  $('playback-status').textContent = state.playing ? '帶練中' : state.time >= COURSE_DURATION ? '課程完成' : state.time > 0 ? '已暫停' : '準備就緒';
}
function syncTime() {
  const frame = courseFrame(state.time);
  activityLog.course(frame);
  const stageText=`${frame.lesson.name} · ${formatTime(COURSE_DURATION-state.time)}`;
  if($('stage-lesson').textContent!==stageText)$('stage-lesson').textContent=stageText;
  $('seek').value = state.time;
  $('elapsed').textContent = formatTime(Math.floor(state.time));
  $('course-remaining').textContent = formatTime(COURSE_DURATION - state.time);
  $('movement-remaining').textContent = formatTime(frame.remaining);
  $('lesson-count').textContent = `${frame.index + 1} / ${LESSONS.length}`;
  if (activeLesson !== frame.index) {
    activeLesson = frame.index;
    $('lesson-title').textContent = frame.lesson.name;
    $('lesson-english').textContent = frame.lesson.english;
    $('lesson-description').textContent = frame.lesson.description;
    $('lesson-duration').textContent = `${frame.lesson.duration} 秒`;
  }
  lessonButtons.forEach((button, index) => {
    if (index === frame.index) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    button.classList.toggle('done', index < frame.index || frame.complete);
  });
  const initial = state.time === 0 && !state.playing;
  $('phase-label').textContent = frame.complete ? '今天的練習完成了' : initial ? '站立準備' : frame.label;
  $('phase-cue').textContent = frame.complete ? '三個動作已完成，教練回到站姿。可以重播再看一次。' : initial ? '教練已正面站好，按開始進入三個動作的帶練。' : frame.cue;
  $('next-lesson').textContent = frame.complete ? '完成 · 3 / 3' : frame.index < LESSONS.length - 1 ? `下一個：${LESSONS[frame.index + 1].name}` : '最後一個動作，慢慢收回。';
  posePanel?.contextChanged();hintDisplay?.refresh();
}
$('auto-frame')?.addEventListener('change',()=>{if(!$('auto-frame').checked)camera?.clearViewOffset();pairSpacing.reset();autoInsets?.refresh();autoFraming?.reset();});
$('stage-play').addEventListener('click',()=>{if(state.ready)dispatch({type:'toggle'});});
$('play').addEventListener('click', () => { if (state.ready) dispatch({ type: 'toggle' }); });
$('restart').addEventListener('click', () => { if (state.ready) dispatch({ type: 'restart' }); });
$('seek').addEventListener('input', (event) => { if (state.ready) dispatch({ type: 'seek', time: Number(event.target.value) }); });
for (const button of document.querySelectorAll('[data-speed]')) {
  button.addEventListener('click', () => {
    dispatch({ type: 'speed', speed: Number(button.dataset.speed) });
    document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', b === button));
  });
}
function setView(view) {
  if (!camera || !controls) return;
  const distance = camera.position.distanceTo(controls.target);
  const angles = { front: 0, side: Math.PI / 2, back: Math.PI };
  const angle = angles[view];
  camera.position.set(Math.sin(angle) * distance, currentLayout().targetY, Math.cos(angle) * distance);
  controls.target.set(0, currentLayout().targetY, 0);
  controls.update();
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view));
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('reset-view').addEventListener('click', () => { resize(true); setView('front'); });
$('quality').addEventListener('click', () => {
  state.powerSaving = !state.powerSaving;
  $('quality').setAttribute('aria-pressed', state.powerSaving);
  $('quality').textContent = state.powerSaving ? '省電模式：開' : '省電模式';
  if (renderer) applyRenderQuality();
  resize();
});


function resize(resetCamera = false) {
  if (!renderer) return;
  const { width, height } = $('viewport').getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  // Frame raised hands as well as the full body, including on narrow phones.
  if (resetCamera || !state.ready) {
    const distance=currentLayout().distance;
    camera.position.set(0, currentLayout().targetY, distance);
    controls.target.set(0, currentLayout().targetY, 0);
    controls.minDistance = distance * 0.7;
    controls.maxDistance = distance * 1.65;
  }
  camera.updateProjectionMatrix(); controls.update();autoInsets?.refresh();autoFraming?.reset();
}

async function init() {
  scenePhase='webgl-context';sceneErrorInfo=null;runtimeLog.record('scene-start',{phase:scenePhase});
  memoryLog.mark('model-load-before',{module:'webgl'});
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderCompletion=trackWebGLCompletion(renderer.getContext(),{onComplete:s=>{adaptive.recordGPU(s);taskLog.record('render.gpu',s.startMs,s.completedMs,{submittedMs:s.submittedMs,source:s.source});}});
  scenePhase='scene-setup';
  applyRenderQuality();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('viewport').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();runtimeLog.record('webgl-context-lost',voicePanel?.contextState);memoryLog.mark('error',{module:'webgl',code:'context-lost'});
    showError('3D 畫面已暫停', '裝置暫時無法繼續顯示 3D。請重新載入後再試。');
  });
  scene = new THREE.Scene();
  coachStage=new THREE.Group();scene.add(coachStage);
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * .24;
  controls.maxPolarAngle = Math.PI * .58;
  controls.addEventListener('start', () => {document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));});
  scene.add(new THREE.HemisphereLight(0xf7fff2, 0x8d9a85, 2.5));
  const key = new THREE.DirectionalLight(0xfff6e9, 3.3);
  key.position.set(-3, 5, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 4, bottom: -3.5, near: .1, far: 15 });
  key.shadow.normalBias = .035; scene.add(key);
  const fill = new THREE.DirectionalLight(0xe2f2ff, 1.6); fill.position.set(3, 3, -2); scene.add(fill);
  coachStage.add(createPracticeMat());
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.ShadowMaterial({ opacity: .13 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.008; floor.receiveShadow = true; scene.add(floor);
  resize(true);
  new ResizeObserver(() => resize(true)).observe($('viewport'));
  animate(0);

  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    scenePhase='model-download';
    const modelURL = document.documentElement.dataset.modelUrl || './models/luna-v1.glb';
    response = await fetch(modelURL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    $('loading-detail').textContent = '角色已下載，正在準備材質與骨架。';
    scenePhase='model-decode';
    const gltf = await new GLTFLoader().parseAsync(data, new URL('.', new URL(modelURL, location.href)).href);
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    coachStage.add(model);
    pose = prepareStandingCoach(model);coachEnvelope=createAvatarEnvelope(model);memoryLog.mark('model-load-after',{module:'webgl'});
    coachSkeletonSource=createCoachSkeletonSource(model,coachStage);
    const studentURL=document.documentElement.dataset.studentUrl||'./models/student-v1.glb';
    scenePhase='student-download';
    const studentResponse=await fetch(studentURL,{signal:controller.signal});
    if(!studentResponse.ok)throw new Error(`Student model HTTP ${studentResponse.status}`);
    const studentData=await studentResponse.arrayBuffer();
    scenePhase='student-decode';
    const student=await new GLTFLoader().parseAsync(studentData,new URL('.',new URL(studentURL,location.href)).href);
    humanPanel.attach(scene,student.scene);
    voicePanel?.attachModel(model);
    state.time = 0; state.playing = false;
    setView('front');
    scenePhase='shader-compile';
    renderer.compile(scene, camera);
    autoInsets?.dispose();autoInsets=observeStageInsets({document,viewport:$('viewport')});
    autoFraming=createAutoFraming({fill:.97,camera,controls,getPoints:()=>[...(coachEnvelope?.update().points||[]),...(humanPanel.framingEnvelope?.points||[])],getSize:()=>autoInsets.size,getInsets:()=>autoInsets.value});
    scenePhase='ready';runtimeLog.record('scene-ready');
    state.ready = true;
    $('loading').hidden = true;
    for (const id of ['play', 'restart', 'seek', 'stage-play']) $(id).disabled = false;
    lessonButtons.forEach((button) => { button.disabled = false; });
    syncPlayback(); syncTime();
    void personalAvatar?.restore();
    console.info(`Yoga2: model ready in ${((performance.now() - started) / 1000).toFixed(2)}s`);
  } finally { clearTimeout(timeout); }
}
function animate(now) {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame((time) => { framePending = false; animate(time); });
  if (document.hidden) { lastFrame = now; return; }
  const delta = lastFrame ? Math.max(0, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (state.ready && state.playing) {
    dispatch({ type: 'tick', delta });
  }
  const interval = 1000 / renderProfile().renderFPS;
  if (now - lastRender < interval) return;

  lastRender = now-(now-lastRender)%interval;
  const cpuStarted=performance.now();
  if (pose) {
    const frame = courseFrame(state.time);
  activityLog.course(frame);
    pose(frame.localTime, frame.lesson.id);
  }
  controls.update();
  voicePanel?.update(now);
  const retargetStart=performance.now();humanPanel?.update(camera,now);taskLog.record('retarget.cpu',retargetStart,performance.now());
  if(coachStage&&state.ready){
    const yaw=Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z);
    const fit=currentLayout();
    if($('auto-frame').checked&&humanPanel.stagePosition){const pairFitStarted=performance.now(),separation=pairSpacing.update({coachPoints:coachEnvelope.update().points,studentPoints:humanPanel.framingEnvelope.points,coachOrigin:coachStage.position,studentOrigin:humanPanel.stagePosition,yaw,now});fit.coachX=-separation/2;fit.humanX=separation/2;taskLog.record('framing.cpu',pairFitStarted,performance.now());}
    layoutAvatarPair({coachStage,studentPanel:humanPanel,yaw,fit});
  }
  if(state.ready&&coachSkeletonSource&&$('coach-skeleton-toggle').checked){
    coachSkeleton ||= createSkeletonLayer({parent:coachStage,color:0xb25813,name:'Yoga2CoachSkeleton'});
    coachSkeleton.update(coachSkeletonSource());
  }
  const fitStarted=performance.now();
  if(state.ready&&$('auto-frame')?.checked){controls.enableZoom=false;controls.enablePan=false;controls.minDistance=.05;controls.maxDistance=100;autoFraming?.update(now);}else{controls.enableZoom=true;controls.enablePan=true;}
  taskLog.record('framing.cpu',fitStarted,performance.now());
  const submitAt=performance.now();
  try{renderer.render(scene,camera);}finally{const ended=performance.now();taskLog.record('render.cpu',cpuStarted,retargetStart);taskLog.record('render.submit',submitAt,ended);adaptive.recordCPU(ended-cpuStarted);}
  renderCompletion?.capture(submitAt,performance.now());taskLog.point('render.frame');
}
document.addEventListener('visibilitychange', () => {
  if(document.hidden)renderCompletion?.suspend();taskLog.setActive(!document.hidden);scheduler.setHidden(document.hidden);adaptive.setHidden(document.hidden);if(!document.hidden)startScene();
  lastFrame = 0;
  if (document.hidden && state.playing) dispatch({ type: 'pause' });
});
$('coach-skeleton-toggle').addEventListener('change',()=>{if(!$('coach-skeleton-toggle').checked){coachSkeleton?.dispose();coachSkeleton=null;}});
const fullscreenTools=setupFullscreenTools({document});
const fullscreen=setupFullscreen({document,window,onChange:active=>{fullscreenTools.setActive(active);resize(true);}});
humanPanel=setupStudentPanel({document,onLayout:enabled=>{dualView=enabled;if(coachStage)coachStage.position.x=enabled?-1:0;resize(true);}});
personalAvatar=setupAvatarPanel({document,window,human:humanPanel,build:profile=>scheduler.run('avatar-build',()=>createPersonalAvatar(profile)),exportGLB:profile=>scheduler.run('avatar-build',()=>exportAvatarGLB(profile)),onPreview:()=>document.querySelector('.studio').scrollIntoView({behavior:'smooth',block:'center'}),pause:()=>dispatch({type:'pause'})});
$('avatar-open').addEventListener('click',()=>{fullscreen.exit();$('avatar-editor').open=true;$('avatar-card').scrollIntoView({behavior:'smooth',block:'start'});});
// Keep the empty layer reusable when Safari restores this page from bfcache.
window.addEventListener('pagehide',()=>humanPanel.cameraState(false));
posePanel = setupPosePanel({scheduler,onHintChange:()=>{hintDisplay?.refresh();voicePanel?.refreshHints?.();},onEvaluationTiming:(start,end)=>taskLog.record('evaluation.cpu',start,end),getCaps:()=>adaptive.caps,onSourceFrame:()=>taskLog.point('camera.frame'),onTiming:d=>{if(d.durationMs>1000)adaptive.pressure('cpu','vision-latency');adaptive.recordCPU(['maskMs','portraitMs','poseMs','copyMs'].map(k=>d.timings?.[k]).filter(Number.isFinite).reduce((sum,ms)=>sum+Math.max(0,ms),0));if(d.accepted)taskLog.point('vision.frame');let end=performance.now();for(const [key,kind] of [['maskMs','mask.cpu'],['portraitMs','portrait.cpu'],['poseMs','pose.cpu'],['copyMs','copy.cpu']]){const ms=d.timings[key];if(Number.isFinite(ms)&&ms>=0){taskLog.record(kind,end-ms,end);end-=ms;}}},onMemoryEvent:({phase,code})=>memoryLog.mark(phase==='error'?'error':'boundary',{module:'mediapipe',phase,code}),onObservation:(data,observation,stable)=>activityLog.pose(data,observation,stable),onRuntime:recordActivity, human:humanPanel, onMediaState:()=>defaultMedia?.refresh(), getFrame: () => courseFrame(state.time), isPlaying: () => state.playing, isPowerSaving: () => state.powerSaving });
hintDisplay=setupHintDisplay({document,getInterval:()=>adaptive.caps.hintMs,getHint:()=>posePanel.displayHint,getFrame:()=>courseFrame(state.time),isPlaying:()=>state.playing,isCameraActive:()=>posePanel.active,onEvent:(type,data)=>runtimeLog.record(type,data)});
function getCoachContext(){
  const now=performance.now(),frame=courseFrame(state.time);
  if(state.ready&&pose)pose(frame.localTime,frame.lesson.id);
  coachStage?.updateWorldMatrix(true,true);
  return {capturedAtMs:now,human:posePanel?.aiContext,coach:coachContext(state.ready&&coachSkeletonSource?coachSkeletonSource():null,{now,names:COACH_JOINTS,lesson:frame.lesson.id,time:state.time,ready:state.ready})};
}
voicePanel = setupVoicePanel({getBudget:()=>({...adaptive.caps,optionalLLM:adaptive.caps.optionalLLM&&!(renderCompletion?.diagnostics.pending>=2)}),getHint:()=>posePanel?.displayHint,publishHint:(hint,token)=>posePanel?.publishHint(hint,token),scheduler,onGPUCompletion:event=>{if(event?.clock!=='epoch-ms')return;for(const s of (event.samples||[]).slice(0,64)){const start=s.startMs-performance.timeOrigin,end=s.completedMs-performance.timeOrigin,submitted=s.submittedMs-performance.timeOrigin;adaptive.recordGPU({submittedMs:submitted,completedMs:end});taskLog.record('ai.gpu',start,end,{submittedMs:submitted,source:'webgpu-queue'});}},responseDeadlineMs:performancePreference.value.responseSeconds*1000,onMemoryEvent:({phase,code})=>{if(['LLM_RESPONSE_DEADLINE','GPU_MEMORY_ERROR','GPU_DEVICE_LOST'].includes(code))adaptive.pressure('gpu',code);memoryLog.mark(phase==='error'?'error':'boundary',{module:'webllm',phase,code});},getContext:getCoachContext, onMediaState:()=>defaultMedia?.refresh(),onRuntime:recordActivity, getState: () => state, dispatch, getPose: () => posePanel?.summary });
setupReportPanel({onEvent:(type,data)=>{runtimeLog.record(type,data);memoryLog.mark(type.includes('error')?'error':'boundary',{module:'report',phase:type});},endpoint:document.documentElement.dataset.reportUrl||'https://yoga2-studio-wcy.workspace-540288.chatgpt.site',capture:(id,options)=>captureReport({id,...options,memory:()=>{memoryLog.mark('boundary',{module:'report',phase:'capture-ready'});return memoryLog.diagnostics;},stage:document.querySelector('.studio'),human:humanPanel,render:()=>{if(renderer&&scene&&camera){renderer.render(scene,camera);return renderer.domElement;}return null;},screenshot:html2canvas,diagnostics:()=>({sceneStartup:{phase:scenePhase,error:sceneErrorInfo},taskPerformance:{...taskLog.exportTimeline(),gpuCompletion:gpuCompletionState()},scheduler:{...scheduler.diagnostics,preferences:performancePreference.value,adaptive:adaptive.diagnostics},runtime:runtimeLog.diagnostics,activity:activityLog.diagnostics,hintDisplay:hintDisplay?.diagnostics,autoFraming:$('auto-frame')?.checked?autoFraming?.diagnostics:{enabled:false},voice:voicePanel.diagnostics,camera:posePanel.diagnostics,human:humanPanel.diagnostics,personalAvatar:personalAvatar?.diagnostics,course:{...state,lesson:courseFrame(state.time).lesson.id},skeleton:{ai:$('ai-skeleton-toggle').checked,coach:$('coach-skeleton-toggle').checked},models:{coach:'luna-v1',student:humanPanel.diagnostics.asset,pose:'pose_landmarker_lite/float16/1',segmentation:'disabled-default',mediapipe:'0.10.32'},errors:[$('loading').hidden?null:$('loading-title').textContent,$('camera-feedback').textContent].filter(Boolean)})})});
startScene();
defaultMedia=setupDefaultMedia({document,camera:posePanel,voice:voicePanel,onError:()=>{ $('media-start-status').textContent='自動啟用未完成，請點擊啟用相機與語音。'; }});
function startScene(){
  if(document.hidden||sceneTask)return;
  sceneTask=scheduler.run('scene-load',()=>init()).catch(error=>{
    if(error.name==='AbortError'){sceneTask=null;return;}
    console.error('Yoga2 initialization failed:',error);
    const code=scenePhase==='scheduler'?'SCENE_SCHEDULER_FAILED':scenePhase==='webgl-context'?'WEBGL_CONTEXT_FAILED':scenePhase.includes('download')?'SCENE_DOWNLOAD_FAILED':scenePhase.includes('decode')?'SCENE_DECODE_FAILED':'SCENE_SETUP_FAILED';
    sceneErrorInfo={phase:scenePhase,code,name:/^[a-zA-Z]+Error$/.test(error?.name||'')?error.name:'Error'};runtimeLog.record('scene-start-failed',sceneErrorInfo);
    const detail=scenePhase==='scheduler'?'場景排程初始化失敗，請點版號更新後重試。':scenePhase==='webgl-context'?'無法建立 WebGL 2 畫面，請關閉其他 3D 分頁後重新載入。':scenePhase.includes('download')?'3D 模型下載失敗，請確認網路後重試。':scenePhase.includes('decode')?'3D 模型或貼圖解碼失敗，請更新網頁後重試。':'3D 場景設定失敗，請更新網頁後重試。';
    showError('暫時無法載入 3D 教練',detail,code);
  });
}

for(const [id,key] of [['render-fps','renderFPS'],['response-seconds','responseSeconds'],['auto-workload','auto'],['cpu-factor','cpuFactor'],['gpu-factor','gpuFactor']]){const input=$(id);if(key==='auto')input.checked=performancePreference.value.auto;else input.value=String(performancePreference.value[key]);input.addEventListener('change',()=>{const p=performancePreference.set({[key]:key==='auto'?input.checked:Number(input.value)});adaptive.configure(p);voicePanel?.setResponseDeadline(p.responseSeconds*1000);posePanel?.updatePolicy();updatePerformanceStatus();runtimeLog.record('workload-setting',{phase:key,code:String(p[key])});});}
adaptive.configure(performancePreference.value);

// A bounded 1-second controller runs independently of rendering/vision/LLM.
let budgetAt=performance.now();
setInterval(()=>{const at=performance.now(),heap=performance.memory;adaptive.sample({loopDelayMs:Math.max(0,at-budgetAt-1000),renderBudgetMs:1000/Math.max(1,renderProfile().renderFPS),completion:renderCompletion?.diagnostics,memoryRatio:heap?.jsHeapSizeLimit>0?heap.usedJSHeapSize/heap.jsHeapSizeLimit:null});budgetAt=at;},1000);
window.addEventListener('pagehide',()=>{adaptive.setHidden(true);});
window.addEventListener('pageshow',()=>{adaptive.setHidden(document.hidden);budgetAt=performance.now();});

taskPanel=setupTaskPerformancePanel({log:taskLog,getSettings:()=>({preferences:performancePreference.value,scheduler:renderProfile(),budget:adaptive.diagnostics,currentTask:scheduler.diagnostics.active,camera:posePanel?.diagnostics?.settings,effectiveCamera:posePanel?.diagnostics?.pipeline?.fps,gpuCompletion:gpuCompletionState()})});
window.addEventListener('pagehide',()=>{renderCompletion?.suspend();taskPanel.stop();});

window.addEventListener('pageshow',()=>taskPanel?.start());
