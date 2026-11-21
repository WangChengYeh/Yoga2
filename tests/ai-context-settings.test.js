import test from 'node:test';
import assert from 'node:assert/strict';
import {contextPreference,normalizeContextWindow} from '../src/ai-context-settings.js';
test('context defaults to 4K, remembers 16K, and rejects unsupported or malformed stored values',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const p=contextPreference(()=>storage);assert.equal(p.value,4096);p.set(16384);assert.equal(contextPreference(()=>storage).value,16384);p.set(4096);assert.equal(contextPreference(()=>storage).value,4096);
 for(const v of ['bad',8192,0,null,Infinity])assert.equal(normalizeContextWindow(v),4096);
});
test('blocked storage leaves a working in-memory choice and cannot break startup',()=>{
 const p=contextPreference(()=>{throw Error('blocked');});assert.equal(p.value,4096);p.set(16384);assert.equal(p.value,16384);assert.equal(p.persistent,false);
});
