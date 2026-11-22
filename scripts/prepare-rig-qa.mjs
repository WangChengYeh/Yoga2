// Production markup, actual GLBs and retarget/panel modules with synthetic input.
// No camera/microphone/LLM initialization or real-device accuracy claim.
import {readFile,writeFile} from 'node:fs/promises';
const html=(await readFile('src/index.html','utf8')).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(whole,attrs)=>attrs.includes('importmap')?whole:'');
const samples=(await readFile('tests/helpers/pose-samples.js','utf8')).replace(/^import .*\n/,'').replace('export function','function');
const world=(await readFile('tests/helpers/world-pose-samples.js','utf8')).replace(/^import .*\n/gm,'').replace('export function','function');
const script=`import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {setupStudentPanel} from './student-panel.js';
import {prepareStandingCoach} from './rig.js';
import {practiceLayout} from './practice-layout.js';
import {courseFrame,motionAt} from './course.js';
import {setupFullscreenTools} from './fullscreen-tools.js';
import {setupFullscreen} from './fullscreen.js';
${samples}\n${world}
const $=id=>document.getElementById(id),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,100);let renderer,gpu=true;
try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:false});}catch{gpu=false;const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');renderer={domElement:canvas,setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#087c71';ctx.lineWidth=3;scene.traverse(o=>{if(!o.isBone||!o.parent?.isBone)return;const a=o.getWorldPosition(new THREE.Vector3()).project(camera),b=o.parent.getWorldPosition(new THREE.Vector3()).project(camera);ctx.beginPath();ctx.moveTo((a.x+1)*canvas.width/2,(1-a.y)*canvas.height/2);ctx.lineTo((b.x+1)*canvas.width/2,(1-b.y)*canvas.height/2);ctx.stroke();});}};}
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;$('viewport').appendChild(renderer.domElement);document.body.dataset.webgl=String(gpu);
scene.add(new THREE.HemisphereLight(0xffffff,0x80998b,2.5));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,4,4);scene.add(light);
const loader=new GLTFLoader(),coach=(await loader.loadAsync('./models/luna-v1.glb')).scene,student=(await loader.loadAsync('./models/student-v1.glb')).scene;const pose=prepareStandingCoach(coach),base=coach.position.clone();scene.add(coach);const panel=setupStudentPanel({document});panel.attach(scene,student);panel.cameraState(true);
$('loading').hidden=true;$('update-status').textContent=gpu?'合成骨架驗證，非真人驗收':'WebGL 無法啟用；CPU 骨架／校正驗證';$('media-startup').hidden=true;$('camera-feedback').textContent='本頁僅驗證實際 GLB 與骨架映射；沒有使用相機。';
const tools=setupFullscreenTools({document});setupFullscreen({document,window,onChange:active=>{tools.setActive(active);resize();}});
function resize(){const r=$('viewport').getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;const fit=practiceLayout({aspect:camera.aspect,paired:true});camera.position.set(0,fit.targetY,fit.distance);camera.lookAt(0,fit.targetY,0);camera.updateProjectionMatrix();coach.position.x=base.x+fit.coachX;panel.setLayout({x:fit.humanX});}
new ResizeObserver(resize).observe($('viewport'));resize();let last=-Infinity,source=-Infinity,active=true;
$('human-calibrate').addEventListener('click',()=>{const start=performance.now();for(let i=0;i<5;i++){const at=start+i*200,data=worldSample(at,{yaw:.4});data.context=panel.context;panel.accept(data,at);panel.update(camera,at);}source=start+800;});
$('camera-toggle').textContent='停止合成骨架';$('camera-toggle').addEventListener('click',()=>{active=!active;panel.cameraState(active);$('camera-toggle').textContent=active?'停止合成骨架':'啟動合成骨架';});
function tick(now){requestAnimationFrame(tick);if(now-last<33)return;last=now;if(active&&now-source>=200){const data=worldSample(now,{yaw:.4});data.context=panel.context;panel.accept(data,now);source=now;}pose(0);panel.update(camera,now);renderer.render(scene,camera);const c=panel.calibration;document.body.dataset.calibration=c?.status||'none';document.body.dataset.rig=String(panel.diagnostics.retarget.rig.compatible);}
requestAnimationFrame(tick);`;
await writeFile('dist/rig-qa.html',html.replace('</body>',`<script type="module">${script}</script></body>`));
console.log('Prepared production GLB/panel rig QA: dist/rig-qa.html');
