import test from 'node:test';
import assert from 'node:assert/strict';
import {portraitMask} from '../src/portrait-mask.js';
import {calibrateFace,personPlacement,CutoutSession} from '../src/cutout-core.js';
const labels=['background','hair','body-skin','face-skin','clothes','others'];
function fixture(){const width=20,height=20,channels=labels.map(()=>new Float32Array(400));return {width,height,labels,channels};}
function rect(f,label,x0,y0,x1,y1,value=1){const channel=f.channels[labels.indexOf(label)];for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)channel[y*f.width+x]=value;}
test('semantic extraction keeps hair/face/clothes but excludes chair-like accessory regions and detached blobs',()=>{
  const f=fixture();rect(f,'face-skin',8,2,12,6);rect(f,'hair',7,1,13,3);rect(f,'body-skin',9,6,11,8);rect(f,'clothes',5,8,15,18);
  rect(f,'others',0,10,5,20);rect(f,'clothes',0,0,2,2);
  const r=portraitMask(f);assert.ok(r.confidence[3*20+9]>.9);assert.ok(r.confidence[12*20+9]>.9);
  assert.equal(r.confidence[15*20+2],0);assert.equal(r.confidence[0],0);assert.ok(r.face);
});
test('isolated false face pixels do not enlarge the calibration reference',()=>{
  const f=fixture();rect(f,'face-skin',8,2,12,6);rect(f,'face-skin',0,18,1,19);
  const r=portraitMask(f);assert.deepEqual(r.face,{left:.4,right:.6,top:.1,bottom:.3});
});
test('face anatomical calibration fixes the visible face size and head center, with no image stretching',()=>{
  const c=calibrateFace({left:.3,right:.7,top:.2,bottom:.6}),p=personPlacement(c,.75);
  assert.ok(Math.abs(p.height*.4-.22)<1e-9);
  assert.ok(Math.abs(p.y+(.5-.4)*p.height-1.59)<1e-9);
  assert.ok(Math.abs(p.width/p.height-.75)<1e-9);
  assert.equal(calibrateFace({left:0,right:1,top:0,bottom:NaN}),null);
});
test('raising arms, face jitter and switching body visibility never changes a locked placement',()=>{
  const frames=[],session=new CutoutSession({onFrame:(frame,c)=>frames.push(c)});
  session.setReady(true);session.setCamera(true);session.toggle();
  const data=face=>({capturedAt:100,context:session.context,landmarks:[],segmentation:{width:2,height:2,confidence:new Float32Array([0,1,0,1]),face,frame:{width:2,height:2,rgba:new Uint8ClampedArray(16).fill(255)}}});
  session.accept(data({left:.3,right:.7,top:.2,bottom:.6}),200);
  session.accept(data({left:.2,right:.8,top:.1,bottom:.8}),300);
  assert.equal(frames[0].mode,'face');assert.deepEqual(frames[0],frames[1]);
  assert.deepEqual(personPlacement(frames[0],.75),personPlacement(frames[1],.75));
});
test('semantic masks reject unknown labels and malformed array dimensions',()=>{
  assert.throws(()=>portraitMask({...fixture(),labels:['selfie']}));
  assert.throws(()=>portraitMask({...fixture(),width:21}));
});

test('reported chair case: replaying recorded semantic probabilities removes the chair without removing the face',async()=>{
  const {readFile}=await import('node:fs/promises');
  const f=JSON.parse(await readFile('tests/fixtures/semantic-chair-mask.json','utf8'));
  const channels=f.channelsRLE.map(runs=>{const values=new Float32Array(f.width*f.height);let at=0;for(let i=0;i<runs.length;i+=2){values.fill(runs[i]/255,at,at+runs[i+1]);at+=runs[i+1];}assert.equal(at,values.length);return values;});
  const r=portraitMask({...f,channels});let total=0,count=0;
  for(let y=Math.ceil(f.chairROI.top*f.height);y<Math.floor(f.chairROI.bottom*f.height);y++)for(let x=Math.ceil(f.chairROI.left*f.width);x<Math.floor(f.chairROI.right*f.width);x++){total+=r.confidence[y*f.width+x];count++;}
  assert.ok(total/count<.1);assert.ok(r.face,'the facial calibration reference must remain available');
});


test('changing only the arm silhouette cannot stretch or shift the actual human scene mesh',async()=>{
  const {createHumanLayer}=await import('../src/human-scene.js');const THREE=await import('three');
  const scene=new THREE.Scene(),canvas={width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})};
  const layer=createHumanLayer({scene,createCanvas:()=>canvas});const c=calibrateFace({left:.3,right:.7,top:.2,bottom:.6});
  const frame=bounds=>({width:4,height:6,rgba:new Uint8ClampedArray(96).fill(255),bounds});
  layer.setLayout({x:1.1,z:0,yaw:0});layer.apply(frame({left:.3,right:.7,top:.2,bottom:1}),c);
  const position=layer.mesh.position.clone(),scale=layer.mesh.scale.clone(),cropMinY=layer.cropMinY;
  layer.apply(frame({left:0,right:1,top:0,bottom:1}),c);
  assert.ok(layer.mesh.position.equals(position));assert.ok(layer.mesh.scale.equals(scale));assert.equal(layer.cropMinY,cropMinY);
  assert.ok(Math.abs(layer.mesh.scale.x/layer.mesh.scale.y-4/6)<1e-9);layer.dispose();
});
