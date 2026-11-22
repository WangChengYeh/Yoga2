import test from 'node:test';import assert from 'node:assert/strict';import {cameraPreferences} from '../src/camera-settings.js';
test('camera defaults and allowed rates persist independently with safe malformed fallback',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},p=cameraPreferences(()=>storage);assert.equal(p.value.cameraFPS,20);assert.equal(p.value.analysisFPS,3);p.set({cameraFPS:60,analysisFPS:10});const q=cameraPreferences(()=>storage);assert.equal(q.value.cameraFPS,60);assert.equal(q.value.analysisFPS,10);q.set({cameraFPS:999,analysisFPS:0});assert.equal(q.value.cameraFPS,20);assert.equal(q.value.analysisFPS,3);
});
test('denied storage keeps choices in memory without blocking camera use',()=>{const p=cameraPreferences(()=>{throw Error('denied');});p.set({cameraFPS:5});assert.equal(p.value.cameraFPS,5);assert.equal(p.value.persistent,false);});
