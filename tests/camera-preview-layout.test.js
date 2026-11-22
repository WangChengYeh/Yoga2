import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCameraPreview,setupCameraPreviewLayout} from '../src/camera-preview-layout.js';
test('landscape/portrait video tiles fit the rail without crop or forced tall letterboxes',()=>{
 for(const [w,h] of [[300,600],[220,210],[366,200]])for(const [sw,sh] of [[1920,1080],[480,640],[640,480],[1080,1920]]){
  const fit=fitCameraPreview(w,h,sw,sh);assert.ok(fit.width<=w+.001&&fit.height<=h+.001);assert.ok(Math.abs(fit.width/fit.height-sw/sh)<1e-9);assert.ok(Math.abs(fit.width-w)<.001||Math.abs(fit.height-h)<.001);
 }
 assert.deepEqual(fitCameraPreview(300,600,1920,1080),{width:300,height:168.75});assert.equal(fitCameraPreview(0,600,1920,1080),null);assert.equal(fitCameraPreview(300,600,NaN,1080),null);
});
test('metadata, natural size and rail resize update the same camera/skeleton frame',()=>{
 let rect={width:300,height:600},callback,disconnected=false;const listeners={},frame={style:{}},video={videoWidth:1920,videoHeight:1080,addEventListener(k,v){listeners[k]=v;},removeEventListener(k){delete listeners[k];}};
 class Observer{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}}
 const layout=setupCameraPreviewLayout({preview:{getBoundingClientRect:()=>rect},frame,video,Observer});assert.equal(frame.style.height,'168.75px');video.videoWidth=480;video.videoHeight=640;listeners.loadedmetadata();assert.equal(frame.style.height,'400px');rect={width:220,height:210};callback();assert.equal(frame.style.width,'157.5px');assert.equal(frame.style.height,'210px');layout.dispose();assert.equal(disconnected,true);assert.equal(Object.keys(listeners).length,0);
});
