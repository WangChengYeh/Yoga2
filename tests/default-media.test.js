import test from 'node:test';
import assert from 'node:assert/strict';
import {setupDefaultMedia} from '../src/default-media.js';
function harness({hidden=false,cameraError=false,voiceError=false,voiceHooks={}}={}){
 const nodes=new Map(),events={},calls=[],errors=[];let cameraState={phase:'idle',open:false},voiceState={phase:'off',active:false};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);};
 const document={hidden,getElementById:node,addEventListener:(type,fn)=>events[type]=fn};
 const camera={get mediaStatus(){return cameraState;},start(){calls.push('camera');cameraState={phase:'requesting',open:false};if(cameraError){cameraState={phase:'error',open:false};return Promise.reject(new Error('camera blocked'));}return new Promise(()=>{});}};
 const voice={get mediaStatus(){return voiceState;},enableListening(){calls.push('voice');voiceState={phase:'starting',active:false};if(voiceError){voiceState={phase:'error',active:false};throw new Error('gesture required');}},...voiceHooks};
 const controller=setupDefaultMedia({document,camera,voice,onError:e=>errors.push(e)});
 return {controller,document,events,calls,errors,node,setCamera:s=>cameraState=s,setVoice:s=>voiceState=s,click:()=>node('media-start').listeners.click({type:'click'})};
}
test('page defaults start camera and voice synchronously, without waiting for model downloads',()=>{
 const h=harness();assert.deepEqual(h.calls,['camera','voice']);assert.equal(h.controller.attempted,true);assert.equal(h.node('media-startup').hidden,false);assert.match(h.node('media-start-status').textContent,/等待相機權限/);
 h.click();assert.deepEqual(h.calls,['camera','voice'],'pending requests must not duplicate prompts');h.controller.dispose();
});
test('granted inputs hide startup controls; manually closed inputs are never automatically reopened',()=>{
 const h=harness();h.setCamera({phase:'active',open:true});h.setVoice({phase:'listening',active:true});h.controller.refresh();assert.equal(h.node('media-startup').hidden,true);
 h.setCamera({phase:'idle',open:false});h.controller.refresh();assert.equal(h.calls.length,2);assert.equal(h.node('media-startup').hidden,false);
 h.click();assert.deepEqual(h.calls,['camera','voice','camera'],'retry only the input that is off');h.controller.dispose();
});
test('blocked camera does not prevent starting voice; errors keep click-to-enable path available',async()=>{
 const h=harness({cameraError:true,voiceError:true});await Promise.resolve();assert.deepEqual(h.calls,['camera','voice']);assert.equal(h.errors.length,2);assert.equal(h.node('media-startup').hidden,false);
 h.click();assert.deepEqual(h.calls,['camera','voice','camera','voice']);await Promise.resolve();h.controller.dispose();
});
test('initial hidden page waits until first foreground; later background returns do not restart inputs',()=>{
 const h=harness({hidden:true});assert.equal(h.calls.length,0);assert.equal(h.controller.attempted,false);
 h.document.hidden=false;h.events.visibilitychange();assert.deepEqual(h.calls,['camera','voice']);
 h.document.hidden=true;h.setCamera({phase:'idle',open:false});h.setVoice({phase:'off',active:false});h.events.visibilitychange();h.document.hidden=false;h.events.visibilitychange();assert.equal(h.calls.length,2);
 h.controller.dispose();h.click();assert.equal(h.calls.length,2);
});


test('AI defaults on once; gesture prepares output without restarting active inputs or a manually disabled AI',()=>{
 let aiStarts=0,primes=0;const h=harness({voiceHooks:{enableAI(){aiStarts++;},primeAudio(){primes++;}}});
 assert.equal(aiStarts,1);assert.equal(primes,0,'no automatic silent speech before a click');
 h.setCamera({phase:'active',open:true});h.setVoice({phase:'listening',active:true,outputBlocked:true});h.controller.refresh();assert.equal(h.node('media-startup').hidden,false);assert.match(h.node('media-start-status').textContent,/語音輸出待啟用/);
 h.click();assert.equal(primes,1);assert.equal(aiStarts,1);assert.equal(h.calls.length,2);
 h.setVoice({phase:'listening',active:true,outputBlocked:false});h.controller.refresh();assert.equal(h.node('media-startup').hidden,true);
 h.events.click();assert.equal(primes,2);h.document.hidden=true;h.events.click();assert.equal(primes,2);h.controller.dispose();
});
