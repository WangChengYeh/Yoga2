import { createSkeletonLayer, createCoachSkeletonSource } from './skeleton.js?v=0.7.0';
import { practiceLayout } from './practice-layout.js?v=0.7.0';
import { setupFullscreen } from './fullscreen.js?v=0.7.0';
import { setupHumanPanel } from './human-panel.js?v=0.7.0';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LESSONS, COURSE_DURATION, courseFrame, lessonStart, createPlayback, reducePlayback, formatTime } from './course.js?v=0.7.0';
import { prepareStandingCoach } from './rig.js?v=0.7.0';
import { setupPosePanel } from './pose-panel.js?v=0.7.0';
import { setupVoicePanel } from './voice-panel.js?v=0.7.0';

window.yogaAppStarted = true;
const $ = (id) => document.getElementById(id);
const state = { ...createPlayback(), ready: false, powerSaving: false };
let activeLesson = -1;
let posePanel;
let voicePanel;
let humanPanel, coachStage, dualView=false, manualView=false;
let coachBones=[],coachWidth=.8,coachHeight=2.2,coachSkeleton,coachSkeletonSource;
const actorPoint=new THREE.Vector3(),layoutRight=new THREE.Vector3();
function currentLayout(){return practiceLayout({aspect:camera.aspect,paired:dualView,coachWidth,humanWidth:humanPanel?.bounds?.width||.8,height:Math.max(coachHeight,humanPanel?.bounds?.height||0),fov:camera.fov});}
const lessonButtons = [];
for (const [index, lesson] of LESSONS.entries()) {
  const button = document.createElement('button');
  button.type = 'button'; button.disabled = true;
  button.innerHTML = `<span class="lesson-number">${index + 1}</span><span class="lesson-item-name">${lesson.name}</span><span class="lesson-length">${formatTime(lesson.duration)}</span>`;
  button.setAttribute('aria-label', `選擇${lesson.name}`);
  button.addEventListener('click', () => dispatch({ type: 'seek', time: lessonStart(index), pause: true }));
  $('lesson-list').appendChild(button); lessonButtons.push(button);
}
$('seek').max = COURSE_DURATION;
$('course-total').textContent = formatTime(COURSE_DURATION);
function dispatch(action) {
  Object.assign(state, reducePlayback(state, action));
  if(action.type==='speed')document.querySelectorAll('[data-speed]').forEach((button)=>button.setAttribute('aria-pressed',Number(button.dataset.speed)===state.speed));
  if (state.ready) { syncPlayback(); syncTime(); }
}
let renderer, camera, scene, controls, pose, lastFrame = 0, lastRender = 0;
let framePending = false;

function showError(title, detail) {
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
  posePanel?.contextChanged();
}
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
  camera.position.set(Math.sin(angle) * distance, 1.25, Math.cos(angle) * distance);
  controls.target.set(0, 1.17, 0);
  controls.update();
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view));
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('reset-view').addEventListener('click', () => { resize(true); setView('front'); });
$('quality').addEventListener('click', () => {
  state.powerSaving = !state.powerSaving;
  $('quality').setAttribute('aria-pressed', state.powerSaving);
  $('quality').textContent = state.powerSaving ? '省電模式：開' : '省電模式';
  if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.powerSaving ? 1 : 1.75));
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
    manualView=false;
    const distance=currentLayout().distance;
    camera.position.set(0, 1.25, distance);
    controls.target.set(0, 1.17, 0);
    controls.minDistance = distance * 0.7;
    controls.maxDistance = distance * 1.65;
  }
  camera.updateProjectionMatrix(); controls.update();
}

async function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('viewport').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
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
  controls.addEventListener('start', () => {manualView=true;document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));});
  scene.add(new THREE.HemisphereLight(0xf7fff2, 0x8d9a85, 2.5));
  const key = new THREE.DirectionalLight(0xfff6e9, 3.3);
  key.position.set(-3, 5, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -2, near: .1, far: 15 });
  key.shadow.normalBias = .035; scene.add(key);
  const fill = new THREE.DirectionalLight(0xe2f2ff, 1.6); fill.position.set(3, 3, -2); scene.add(fill);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.15, .035, 80), new THREE.MeshStandardMaterial({ color: 0xd9e5d6, roughness: .93 }));
  platform.position.y = -.025; platform.receiveShadow = true; coachStage.add(platform);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(.72, .018, 1.65), new THREE.MeshStandardMaterial({ color: 0x557667, roughness: .95 }));
  mat.position.y = .002; mat.receiveShadow = true; coachStage.add(mat);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.ShadowMaterial({ opacity: .13 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.045; floor.receiveShadow = true; scene.add(floor);
  resize(true);
  new ResizeObserver(() => resize(true)).observe($('viewport'));
  animate(0);

  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    const modelURL = document.documentElement.dataset.modelUrl || './models/luna-v1.glb';
    response = await fetch(modelURL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    $('loading-detail').textContent = '角色已下載，正在準備材質與骨架。';
    const gltf = await new GLTFLoader().parseAsync(data, new URL('.', new URL(modelURL, location.href)).href);
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    coachStage.add(model);
    pose = prepareStandingCoach(model);
    coachBones=[];model.traverse(o=>{if(o.isBone)coachBones.push(o);});
    coachSkeletonSource=createCoachSkeletonSource(model,coachStage);
    humanPanel.attach(scene);
    voicePanel?.attachModel(model);
    state.time = 0; state.playing = false;
    setView('front');
    renderer.compile(scene, camera);
    state.ready = true;
    $('loading').hidden = true;
    for (const id of ['play', 'restart', 'seek', 'stage-play']) $(id).disabled = false;
    lessonButtons.forEach((button) => { button.disabled = false; });
    syncPlayback(); syncTime();
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
  const interval = 1000 / (state.powerSaving ? 24 : posePanel?.active ? 30 : 60);
  if (now - lastRender < interval) return;
  lastRender = now;
  if (pose) {
    const frame = courseFrame(state.time);
    pose(frame.localTime, frame.lesson.id);
  }
  controls.update();
  voicePanel?.update(now);
  if(coachStage&&coachBones.length){
    const yaw=Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z);
    layoutRight.set(Math.cos(yaw),0,-Math.sin(yaw));
    let radius=.3,top=1.72;
    for(const bone of coachBones){bone.getWorldPosition(actorPoint);coachStage.worldToLocal(actorPoint);radius=Math.max(radius,Math.abs(actorPoint.dot(layoutRight))+.1);top=Math.max(top,actorPoint.y+.15);}
    coachWidth+=(radius*2-coachWidth)*.18;coachHeight+=(top-coachHeight)*.18;
    const fit=currentLayout();
    coachStage.position.set(layoutRight.x*fit.coachX,0,layoutRight.z*fit.coachX);
    humanPanel.setLayout({x:layoutRight.x*fit.humanX,z:layoutRight.z*fit.humanX,yaw});
    if(!manualView){
      actorPoint.copy(camera.position).sub(controls.target);
      const distance=actorPoint.length();
      actorPoint.setLength(distance+(fit.distance-distance)*.12);
      camera.position.copy(controls.target).add(actorPoint);
      controls.minDistance=fit.distance*.7;controls.maxDistance=fit.distance*1.65;
    }
  }
  if(state.ready&&coachSkeletonSource&&$('coach-skeleton-toggle').checked){
    coachSkeleton ||= createSkeletonLayer({parent:coachStage,color:0xb25813,name:'Yoga2CoachSkeleton'});
    coachSkeleton.update(coachSkeletonSource());
  }
  humanPanel?.update(camera,now);
  renderer.render(scene, camera);
}
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  if (document.hidden && state.playing) dispatch({ type: 'pause' });
});
$('coach-skeleton-toggle').addEventListener('change',()=>{if(!$('coach-skeleton-toggle').checked){coachSkeleton?.dispose();coachSkeleton=null;}});
setupFullscreen({document,window,onChange:()=>resize(true)});
humanPanel=setupHumanPanel({document,onLayout:enabled=>{dualView=enabled;if(coachStage)coachStage.position.x=enabled?-.65:0;resize(true);}});
// Keep the empty layer reusable when Safari restores this page from bfcache.
window.addEventListener('pagehide',()=>humanPanel.cameraState(false));
posePanel = setupPosePanel({ human:humanPanel, getFrame: () => courseFrame(state.time), isPlaying: () => state.playing, isPowerSaving: () => state.powerSaving });
voicePanel = setupVoicePanel({ getState: () => state, dispatch, getPose: () => posePanel?.summary });
init().catch((error) => {
  console.error('Yoga2 initialization failed:', error);
  showError('暫時無法載入 3D 教練', '請確認網路連線，並使用支援 WebGL 2 的新版 Safari 或 Chrome，再重新載入。');
});
