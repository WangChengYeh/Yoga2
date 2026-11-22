import test from 'node:test';
import assert from 'node:assert/strict';
import { frameSize, composeCutout, calibratePerson, personPlacement, CutoutSession } from '../src/cutout-core.js';
import { createFrameProcessor } from '../src/pose-frame.js';
import { createHumanLayer } from '../src/human-scene.js';
import * as THREE from 'three';

const points=()=>Array.from({length:33},(_,i)=>({x:i===23?.4:i===24?.6:.5,y:i===0?.15:i===31||i===32?.9:.5,visibility:1}));
const segmentation=()=>({width:2,height:2,confidence:new Float32Array([0,1,0,1]),frame:{width:2,height:2,rgba:new Uint8ClampedArray([12,24,36,255,42,54,66,255,72,84,96,255,102,114,126,255])}});
function sessionHarness() {
  const frames=[],states=[];let clears=0;
  const s=new CutoutSession({onFrame:(frame,c)=>frames.push({frame,c}),onState:x=>states.push(x),onClear:()=>clears++});
  const data=()=>({landmarks:[points()],segmentation:segmentation(),capturedAt:100,context:{...s.context,key:'reach'}});
  return {s,frames,states,data,get clears(){return clears;},start(){s.setReady(true);s.setCamera(true);s.toggle();}};
}
test('cutout frame budget preserves portrait and landscape aspect without upscaling',()=>{
  assert.deepEqual(frameSize(1080,1920),{width:288,height:512});
  assert.deepEqual(frameSize(1920,1080),{width:512,height:288});
  assert.deepEqual(frameSize(320,240),{width:320,height:240});
  assert.throws(()=>frameSize(0,640));
});
test('cutout alpha removes background, preserves foreground colors and never mutates input',()=>{
  const input=segmentation(), original=input.frame.rgba.slice();
  const result=composeCutout(input);
  assert.equal(result.rgba[3],0);assert.equal(result.rgba[7],255);assert.equal(result.coverage,.5);
  assert.deepEqual(result.rgba.slice(4,7),original.slice(4,7));assert.deepEqual(input.frame.rgba,original);
});
test('mask resampling has a soft transition, handles nonfinite confidence and differing dimensions',()=>{
  const input=segmentation();input.frame.width=8;input.frame.rgba=new Uint8ClampedArray(8*2*4).fill(255);
  const result=composeCutout(input);
  assert.equal(result.rgba[3],0);assert.ok(result.rgba[15]>0&&result.rgba[15]<result.rgba[19]&&result.rgba[19]<255);assert.equal(result.rgba[31],255);
  input.confidence.fill(NaN);assert.equal(composeCutout(input).coverage,0);
  assert.throws(()=>composeCutout({...input,confidence:new Float32Array(1)}));
  assert.throws(()=>composeCutout({...input,width:1e9}));
});
test('calibration requires visible head, hips and feet; position is mirrored once and feet meet the floor',()=>{
  const p=points(),c=calibratePerson(p),placement=personPlacement(c,.75);
  assert.equal(placement.x,.72);
  const mappedFoot=placement.y+(.5-c.footY)*placement.height;
  assert.ok(Math.abs(mappedFoot-.025)<1e-10);
  const shifted=personPlacement({...c,hipX:.7},.75,{x:1,scale:1.2});
  assert.ok(shifted.x>1);assert.ok(Math.abs(shifted.height/placement.height-1.2)<1e-10);
  p[31].visibility=.2;assert.equal(calibratePerson(p),null);
  assert.equal(calibratePerson([]),null);
});
test('placement bounds prevent invalid/oversized transforms',()=>{
  const c=calibratePerson(points());
  assert.deepEqual(personPlacement(c,.75,{x:Infinity,scale:NaN}),personPlacement(c,.75));
  assert.deepEqual(personPlacement(c,.75,{x:100,scale:100}),personPlacement(c,.75,{x:1.4,scale:1.4}));
});
test('human is opt-in, requires camera and 3D, and course changes do not block current video',()=>{
  const h=sessionHarness();h.s.toggle();assert.equal(h.s.enabled,false);assert.equal(h.s.context.segment,false);
  h.s.setReady(true);h.s.toggle();assert.equal(h.s.enabled,false);
  h.s.setCamera(true);h.s.toggle();const data=h.data();data.context.key='another-course:paused';
  assert.equal(h.s.accept(data,200),true);assert.equal(h.frames.length,1);
  assert.equal(h.s.context.segment,true);
});
test('switching off/on or recalibrating rejects old in-flight cutouts',()=>{
  const h=sessionHarness();h.start();const old=h.data();h.s.toggle();h.s.toggle();
  assert.equal(h.s.accept(old,200),false);assert.equal(h.frames.length,0);
  const next=h.data();h.s.recalibrate();assert.equal(h.s.accept(next,200),false);
  assert.equal(h.s.accept(h.data(),200),true);
});
test('camera stop/background and lost 3D hide the cutout and require explicit re-entry',()=>{
  for(const stop of [s=>s.setCamera(false),s=>s.setReady(false)]) {
    const h=sessionHarness();h.start();h.s.accept(h.data(),200);const before=h.clears;stop(h.s);
    assert.equal(h.s.enabled,false);assert.ok(h.clears>before);assert.equal(h.s.accept(h.data(),200),false);
    h.s.setReady(true);h.s.setCamera(true);assert.equal(h.s.enabled,false);
  }
});
test('multiple detected people, invalid masks and stale frames clear the human',()=>{
  const mutations=[d=>d.landmarks.push(points()),d=>d.segmentation=null,d=>d.capturedAt=-1500,d=>d.capturedAt=500];
  for(const mutate of mutations){const h=sessionHarness();h.start();const d=h.data();mutate(d);const n=h.clears;assert.equal(h.s.accept(d,200),false);assert.ok(h.clears>n);}
  for(const confidence of [0]) {const h=sessionHarness();h.start();const d=h.data();d.segmentation.confidence.fill(confidence);assert.equal(h.s.accept(d,200),false);}
});
test('watchdog hides stale images immediately and a fresh frame can restore them',()=>{
  const h=sessionHarness();h.start();h.s.accept(h.data(),200);const n=h.clears;
  h.s.stale();assert.ok(h.clears>n);assert.equal(h.s.enabled,true);assert.equal(h.s.accept(h.data(),300),true);
});
test('calibration is stable during movement, resets on rotation and explicit alignment',()=>{
  const h=sessionHarness();h.start();h.s.accept(h.data(),200);const first=h.frames[0].c;
  const moved=h.data();moved.landmarks[0][0].y=.3;h.s.accept(moved,300);assert.deepEqual(h.frames[1].c,first);
  const rotated=h.data();rotated.landmarks[0][0].y=.3;rotated.segmentation.frame.width=4;rotated.segmentation.frame.rgba=new Uint8ClampedArray(32).fill(255);
  h.s.accept(rotated,400);assert.notDeepEqual(h.frames[2].c,first);
  h.s.recalibrate();h.s.accept(h.data(),500);assert.deepEqual(h.frames[3].c,first);
});
test('unsupported segmentation exits human mode while retaining the camera',()=>{
  const h=sessionHarness();h.start();const d=h.data();d.segmentationError=true;
  assert.equal(h.s.accept(d,200),false);assert.equal(h.s.enabled,false);assert.equal(h.s.cameraActive,true);
  assert.match(h.states.at(-1).message,/保留相機/);
});
function processorHarness() {
  const events=[],poseInputs=[],portraitInputs=[];let resultsClosed=0,portraitResultsClosed=0,detectorsClosed=0,portraitsClosed=0,loads=0;
  const rgba=segmentation().frame.rgba;
  const ctx={drawImage:()=>events.push('snapshot'),getImageData:()=>({data:rgba})};
  const canvas={width:1,height:1,getContext:()=>ctx};
  const detector={detectForVideo:input=>{events.push('detect');poseInputs.push(input);return {landmarks:[points()],close:()=>resultsClosed++};},close:()=>detectorsClosed++};
  const portrait={labels:['background','hair','body-skin','face-skin','clothes','others'],segmentForVideo:input=>{events.push('portrait');portraitInputs.push(input);const values=new Float32Array([0,1,0,1]);return {confidenceMasks:Array.from({length:6},(_,i)=>({width:2,height:2,getAsFloat32Array:()=>i===4?values:new Float32Array(4)})),close:()=>{portraitResultsClosed++;values.fill(0);}};},close:()=>portraitsClosed++};
  const processor=createFrameProcessor({detector,createCanvas:()=>canvas,createSegmenter:async()=>{loads++;return portrait;}});
  return {processor,detector,portrait,canvas,events,poseInputs,portraitInputs,source:{width:2,height:2},get loads(){return loads;},get resultsClosed(){return resultsClosed;},get portraitResultsClosed(){return portraitResultsClosed;},get detectorsClosed(){return detectorsClosed;},get portraitsClosed(){return portraitsClosed;}};
}
test('shared processor captures matching RGB for pose and portrait and copies masks before closing',async()=>{
  const h=processorHarness(),r=await h.processor.detect(h.source,100,{segment:true});
  assert.deepEqual(h.events,['snapshot','detect','portrait']);assert.equal(h.loads,1);
  assert.equal(h.poseInputs[0],h.portraitInputs[0]);assert.equal(h.poseInputs[0],h.canvas);
  assert.deepEqual([...r.segmentation.confidence],[0,1,0,1]);assert.equal(h.resultsClosed,1);assert.equal(h.portraitResultsClosed,1);
  assert.deepEqual(r.segmentation.frame.rgba,segmentation().frame.rgba);
  h.processor.close();assert.equal(h.detectorsClosed,1);assert.equal(h.portraitsClosed,1);assert.equal(h.canvas.width,1);
});
test('portrait task is lazy, reused while on, released when off and reloadable on re-entry',async()=>{
  const h=processorHarness();let r=await h.processor.detect(h.source,100);
  assert.equal(r.segmentation,null);assert.deepEqual(h.events,['detect']);assert.equal(h.loads,0);
  await h.processor.detect(h.source,200,{segment:true});await h.processor.detect(h.source,300,{segment:true});assert.equal(h.loads,1);
  await h.processor.detect(h.source,400);assert.equal(h.portraitsClosed,1);
  await h.processor.detect(h.source,500,{segment:true});assert.equal(h.loads,2);
  h.processor.close();h.processor.close();assert.equal(h.detectorsClosed,1);assert.equal(h.portraitsClosed,2);
  await assert.rejects(h.processor.detect(h.source,600),/closed/);
});
test('portrait download failure preserves pose observations and permits retry after leaving',async()=>{
  let attempts=0;
  const processor=createFrameProcessor({detector:{detectForVideo:()=>({landmarks:[points()],close(){}}),close(){}},createCanvas:()=>{throw Error('must not capture');},createSegmenter:async()=>{attempts++;throw Error('download');}});
  for(let i=0;i<2;i++){const r=await processor.detect({},i,{segment:true});assert.equal(r.segmentationError,true);assert.equal(r.landmarks.length,1);}
  assert.equal(attempts,1);await processor.detect({},3);await processor.detect({},4,{segment:true});assert.equal(attempts,2);processor.close();
});
test('unreadable portrait masks close their results before closing the task',async()=>{
  const h=processorHarness(),order=[];
  h.portrait.segmentForVideo=()=>({confidenceMasks:[{getAsFloat32Array:()=>{throw Error('unreadable');}}],close:()=>order.push('result')});
  h.portrait.close=()=>order.push('task');
  const r=await h.processor.detect(h.source,100,{segment:true});assert.equal(r.segmentation,null);assert.equal(r.segmentationError,true);assert.deepEqual(order,['result','task']);assert.equal(h.resultsClosed,1);
});
test('closing during pending portrait loading cannot publish a late frame or leak the task',async()=>{
  let resolve,closed=0;
  const processor=createFrameProcessor({detector:{close(){}},createCanvas:()=>{},createSegmenter:()=>new Promise(r=>resolve=r)});
  const pending=processor.detect({},100,{segment:true});processor.close();resolve({close:()=>closed++});
  await assert.rejects(pending,/closed/);assert.equal(closed,1);
});
test('portrait segmentation still runs when the pose detector returns no body landmarks',async()=>{
  const h=processorHarness();h.detector.detectForVideo=()=>({landmarks:[],close(){}});
  const r=await h.processor.detect(h.source,100,{segment:true});assert.deepEqual(r.landmarks,[]);assert.ok(r.segmentation);assert.equal(r.segmentationError,false);assert.equal(h.portraitInputs.length,1);h.processor.close();
});
test('scene uses a mirrored transparent plane, supports positioning/billboarding and releases GPU resources',()=>{
  const scene=new THREE.Scene(),canvas={width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})};
  const layer=createHumanLayer({scene,createCanvas:()=>canvas});const frame=composeCutout(segmentation()),alignment=calibratePerson(points());
  layer.apply(frame,alignment);const mesh=layer.mesh,map=mesh.material.map;
  assert.ok(scene.children.includes(mesh));assert.equal(map.repeat.x,-1);assert.equal(map.offset.x,1);assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.material.transparent,true);
  assert.equal(mesh.material.toneMapped,false);const height=mesh.scale.y;
  layer.setPlacement({x:1,scale:1.2});assert.equal(mesh.position.x,1);assert.ok(Math.abs(mesh.scale.y/height-1.2)<1e-10);
  layer.update({position:new THREE.Vector3(4,2,3)});assert.ok(mesh.rotation.y>0);
  let disposed=0;for(const resource of [mesh.geometry,mesh.material,map])resource.addEventListener('dispose',()=>disposed++);
  layer.clear();assert.equal(disposed,3);assert.equal(scene.children.length,0);assert.equal(canvas.width,1);
  layer.apply(frame,alignment);assert.equal(scene.children.length,1);layer.dispose();assert.equal(scene.children.length,0);
  layer.apply(frame,alignment);assert.equal(scene.children.length,0);
});

test('regression: close-up/no feet can enter with portrait segmentation independently of pose feedback',()=>{
  for(const landmarks of [[],[points().map(p=>({...p,visibility:0}))]]) {
    const h=sessionHarness();h.start();const d=h.data();d.landmarks=landmarks;
    assert.equal(h.s.accept(d,200),true);assert.equal(h.frames[0].c.mode,'portrait');
    assert.match(h.states.at(-1).message,/半身模式/);assert.equal(h.s.enabled,true);
  }
});
test('calibration stays locked when pose visibility changes until explicit recalibration',()=>{
  const h=sessionHarness();h.start();const close=h.data();close.landmarks=[];h.s.accept(close,200);
  assert.equal(h.frames[0].c.mode,'portrait');h.s.accept(h.data(),300);
  assert.equal(h.frames[1].c.mode,'portrait');h.s.recalibrate();h.s.accept(h.data(),400);assert.equal(h.frames[2].c.mode,'full');
});
test('close-up can occupy almost the entire frame without being incorrectly rejected',()=>{
  const h=sessionHarness();h.start();const d=h.data();d.landmarks=[];d.segmentation.confidence.fill(1);
  assert.equal(h.s.accept(d,200),true);assert.equal(h.frames[0].c.mode,'portrait');
});

test('frame processor exposes portrait load stage without retaining frames or hiding close state',async()=>{
 let resolve;const stages=[];const processor=createFrameProcessor({detector:{close(){}},createCanvas:()=>{},createSegmenter:()=>new Promise(r=>resolve=r),onStage:s=>stages.push(s)});
 const pending=processor.detect({},1,{segment:true});assert.equal(processor.diagnostics.stage,'portrait-loading');assert.deepEqual(Object.keys(processor.diagnostics).sort(),['allocatorBytes','canvas','portraitLoaded','portraitModelBytes','segmentationFailed','stage']);processor.close();assert.equal(processor.diagnostics.stage,'closed');resolve({close(){}});await assert.rejects(pending,/closed/);assert.deepEqual(stages,['portrait-loading','closed']);
});
