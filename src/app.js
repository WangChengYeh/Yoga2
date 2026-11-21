import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DURATION, phaseAt, advance } from './motion.js';
import { prepareStandingCoach } from './rig.js?v=standing-2';

window.yogaAppStarted = true;
const $ = (id) => document.getElementById(id);
const state = { ready: false, playing: false, time: 0, speed: 1, powerSaving: false };
let renderer, camera, scene, controls, pose, lastFrame = 0, lastRender = 0;
let framePending = false;

function showError(title, detail) {
  state.playing = false;
  state.ready = false;
  $('loading').hidden = false;
  $('loading-title').textContent = title;
  $('loading-detail').textContent = detail;
  document.querySelector('.spinner').hidden = true;
  $('retry').hidden = false;
  $('playback-status').textContent = '尚未就緒';
  for (const id of ['play', 'restart', 'seek']) $(id).disabled = true;
}
$('retry').addEventListener('click', () => location.reload());

function syncPlayback() {
  $('play-icon').textContent = state.playing ? 'Ⅱ' : '▶';
  $('play-label').textContent = state.playing ? '暫停示範' : state.time >= DURATION ? '再看一次' : state.time > 0 ? '繼續播放' : '播放示範';
  $('playback-status').textContent = state.playing ? '示範播放中' : state.time >= DURATION ? '示範完成' : state.time > 0 ? '已暫停' : '準備就緒';
}
function syncTime() {
  $('seek').value = state.time;
  $('elapsed').textContent = `00:${String(Math.floor(state.time)).padStart(2, '0')}`;
  const phase = phaseAt(state.time);
  $('phase-label').textContent = state.time === 0 && !state.playing ? '站立準備' : phase.label;
  $('phase-cue').textContent = state.time === 0 && !state.playing ? '教練已正面站好，按播放開始示範。' : phase.cue;
}
$('play').addEventListener('click', () => {
  if (!state.ready) return;
  if (state.time >= DURATION) state.time = 0;
  state.playing = !state.playing;
  syncPlayback(); syncTime();
});
$('restart').addEventListener('click', () => {
  if (!state.ready) return;
  state.time = 0; state.playing = true;
  syncPlayback(); syncTime();
});
$('seek').addEventListener('input', (event) => {
  state.time = Number(event.target.value);
  if (state.time >= DURATION) state.playing = false;
  syncPlayback(); syncTime();
});
for (const button of document.querySelectorAll('[data-speed]')) {
  button.addEventListener('click', () => {
    state.speed = Number(button.dataset.speed);
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
    const verticalDistance = 2.85 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const horizontalDistance = 2.3 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const distance = Math.max(verticalDistance, horizontalDistance);
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
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('viewport').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showError('3D 畫面已暫停', '裝置暫時無法繼續顯示 3D。請重新載入後再試。');
  });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * .24;
  controls.maxPolarAngle = Math.PI * .58;
  controls.addEventListener('start', () => document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false')));
  scene.add(new THREE.HemisphereLight(0xf7fff2, 0x8d9a85, 2.5));
  const key = new THREE.DirectionalLight(0xfff6e9, 3.3);
  key.position.set(-3, 5, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -2, near: .1, far: 15 });
  key.shadow.normalBias = .035; scene.add(key);
  const fill = new THREE.DirectionalLight(0xe2f2ff, 1.6); fill.position.set(3, 3, -2); scene.add(fill);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.15, .035, 80), new THREE.MeshStandardMaterial({ color: 0xd9e5d6, roughness: .93 }));
  platform.position.y = -.025; platform.receiveShadow = true; scene.add(platform);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(.72, .018, 1.65), new THREE.MeshStandardMaterial({ color: 0x557667, roughness: .95 }));
  mat.position.y = .002; mat.receiveShadow = true; scene.add(mat);
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
    const modelURL = document.documentElement.dataset.modelUrl || './models/michelle.glb';
    response = await fetch(modelURL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    $('loading-detail').textContent = '角色已下載，正在準備材質與骨架。';
    const gltf = await new GLTFLoader().parseAsync(data, new URL('.', new URL(modelURL, location.href)).href);
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    scene.add(model);
    pose = prepareStandingCoach(model);
    state.time = 0; state.playing = false;
    setView('front');
    renderer.compile(scene, camera);
    state.ready = true;
    $('loading').hidden = true;
    for (const id of ['play', 'restart', 'seek']) $(id).disabled = false;
    syncPlayback(); syncTime();
    console.info(`Yoga2: model ready in ${((performance.now() - started) / 1000).toFixed(2)}s`);
  } finally { clearTimeout(timeout); }
}
function animate(now) {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame((time) => { framePending = false; animate(time); });
  if (document.hidden) { lastFrame = now; return; }
  const delta = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0;
  lastFrame = now;
  if (state.ready && state.playing) {
    state.time = advance(state.time, delta, state.speed);
    if (state.time >= DURATION) { state.playing = false; syncPlayback(); }
    syncTime();
  }
  const interval = 1000 / (state.powerSaving ? 24 : 60);
  if (now - lastRender < interval) return;
  lastRender = now;
  if (pose) pose(state.time);
  controls.update();
  renderer.render(scene, camera);
}
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  if (document.hidden && state.playing) { state.playing = false; syncPlayback(); }
});
init().catch((error) => {
  console.error('Yoga2 initialization failed:', error);
  showError('暫時無法載入 3D 教練', '請確認網路連線，並使用支援 WebGL 2 的新版 Safari 或 Chrome，再重新載入。');
});
