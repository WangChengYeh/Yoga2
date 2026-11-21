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
test('missing/multiple people, low confidence, invalid masks and stale frames clear the human',()=>{
  const mutations=[d=>d.landmarks=[],d=>d.landmarks.push(points()),d=>d.landmarks[0][0].visibility=.1,d=>d.segmentation=null,d=>d.capturedAt=-1500,d=>d.capturedAt=500];
  for(const mutate of mutations){const h=sessionHarness();h.start();const d=h.data();mutate(d);const n=h.clears;assert.equal(h.s.accept(d,200),false);assert.ok(h.clears>n);}
  for(const confidence of [0,1]) {const h=sessionHarness();h.start();const d=h.data();d.segmentation.confidence.fill(confidence);assert.equal(h.s.accept(d,200),false);}
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
  const events=[],options=[],maskData=new Float32Array([0,1,0,1]);let resultsClosed=0,detectorsClosed=0;
  const rgba=segmentation().frame.rgba;
  const ctx={drawImage:()=>events.push('snapshot'),getImageData:()=>({data:rgba})};
  const canvas={width:1,height:1,getContext:()=>ctx};
  const detector={setOptions:async o=>options.push(o),detectForVideo:input=>{events.push('detect');return {landmarks:[points()],segmentationMasks:[{width:2,height:2,getAsFloat32Array:()=>maskData}],close:()=>{resultsClosed++;maskData.fill(0);}};},close:()=>detectorsClosed++};
  const processor=createFrameProcessor({detector,createCanvas:()=>canvas});
  return {processor,detector,canvas,events,options,source:{width:2,height:2},get resultsClosed(){return resultsClosed;},get detectorsClosed(){return detectorsClosed;}};
}
test('worker/main shared processor captures matching RGB before inference and copies masks before closing',async()=>{
  const h=processorHarness(),r=await h.processor.detect(h.source,100,{segment:true});
  assert.deepEqual(h.events,['snapshot','detect']);assert.deepEqual(h.options,[{outputSegmentationMasks:true}]);
  assert.deepEqual([...r.segmentation.confidence],[0,1,0,1]);assert.equal(h.resultsClosed,1);
  assert.deepEqual(r.segmentation.frame.rgba,segmentation().frame.rgba);
  h.processor.close();assert.equal(h.detectorsClosed,1);assert.equal(h.canvas.width,1);
});
test('no segmentation capture or allocation when off; options toggle only when needed',async()=>{
  const h=processorHarness();let r=await h.processor.detect(h.source,100);
  assert.equal(r.segmentation,null);assert.deepEqual(h.events,['detect']);assert.equal(h.options.length,0);
  await h.processor.detect(h.source,200,{segment:true});await h.processor.detect(h.source,300,{segment:true});
  await h.processor.detect(h.source,400);assert.deepEqual(h.options,[{outputSegmentationMasks:true},{outputSegmentationMasks:false}]);
  assert.equal(h.resultsClosed,4);h.processor.close();h.processor.close();assert.equal(h.detectorsClosed,1);
  await assert.rejects(h.processor.detect(h.source,500),/closed/);
});
test('segmentation option failure downgrades once without losing pose observation',async()=>{
  const h=processorHarness();let attempts=0;h.detector.setOptions=async o=>{if(o.outputSegmentationMasks){attempts++;throw Error('unsupported');}};
  for(let i=0;i<2;i++){const r=await h.processor.detect(h.source,i,{segment:true});assert.equal(r.segmentationError,true);assert.equal(r.landmarks.length,1);}
  assert.equal(attempts,1);assert.equal(h.resultsClosed,2);
});
test('unreadable masks are closed and downgrade without leaking raw frames',async()=>{
  const h=processorHarness();let closed=0;
  h.detector.detectForVideo=()=>({landmarks:[points()],segmentationMasks:[{getAsFloat32Array:()=>{throw Error('unreadable');}}],close:()=>closed++});
  const r=await h.processor.detect(h.source,100,{segment:true});assert.equal(r.segmentation,null);assert.equal(r.segmentationError,true);assert.equal(closed,1);
});
test('closing during pending model options cannot publish a late frame',async()=>{
  const h=processorHarness();let resolve;h.detector.setOptions=()=>new Promise(r=>resolve=r);
  const pending=h.processor.detect(h.source,100,{segment:true});h.processor.close();resolve();
  await assert.rejects(pending,/closed/);assert.equal(h.events.length,0);
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
