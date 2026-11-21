import test from 'node:test';
import assert from 'node:assert/strict';
import {setupVoicePanel} from '../src/voice-panel.js';
function harness(createAI){
 const oldDocument=globalThis.document,oldWindow=globalThis.window,elements=new Map(),spoken=[],events={};let microphones=0,cancelled=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{id,checked:['guidance-toggle','voice-output'].includes(id),dataset:{},value:'',listeners:{},textContent:'',addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){}});return elements.get(id);};
 globalThis.document={hidden:false,getElementById:element,querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn};
 globalThis.window={SpeechRecognition:class{constructor(){microphones++;}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[{lang:'zh-TW',localService:true}],speak:u=>spoken.push(u),cancel:()=>cancelled++},addEventListener:(type,fn)=>events[type]=fn};
 const state={ready:true,time:0,playing:false,speed:1};let panel;
 const dispatch=action=>{if(action.type==='pause')state.playing=false;if(action.type==='play')state.playing=true;panel.playbackChanged(action);};
 panel=setupVoicePanel({getState:()=>state,dispatch,getPose:()=>null,...(createAI?{createAI}:{})});
 return {state,panel,spoken,element,events,get microphones(){return microphones;},get cancelled(){return cancelled;},close(){panel.silence();globalThis.document=oldDocument;globalThis.window=oldWindow;}};
}
test('playback wiring speaks movement names without microphone, pauses immediately and resumes current cue',()=>{
 const h=harness();try{
  assert.equal(h.spoken.length,0);h.state.playing=true;h.panel.playbackChanged({type:'toggle'});assert.match(h.spoken.at(-1).text,/站姿上舉伸展/);assert.equal(h.microphones,0);
  h.state.time=7;h.panel.playbackChanged({type:'tick'});assert.match(h.spoken.at(-1).text,/肩膀/);h.state.playing=false;h.panel.playbackChanged({type:'pause'});assert.equal(h.panel.diagnostics.kind,null);
  h.state.playing=true;h.panel.playbackChanged({type:'play'});assert.match(h.spoken.at(-1).text,/自然呼吸/);
 }finally{h.close();}
});
test('asking key points suppresses automatic speech until reply ends, then only fresh cues play',()=>{
 const h=harness();try{
  h.state.playing=true;h.panel.playbackChanged({type:'play'});h.element('voice-input').value='關鍵要領';h.element('voice-form').listeners.submit({preventDefault(){}});assert.match(h.spoken.at(-1).text,/不必勉強/);const reply=h.spoken.at(-1),count=h.spoken.length;
  h.state.time=6;h.panel.playbackChanged({type:'tick'});assert.equal(h.spoken.length,count);reply.onend();h.state.time=7;h.panel.playbackChanged({type:'tick'});assert.equal(h.spoken.length,count);h.state.time=10;h.panel.playbackChanged({type:'tick'});assert.match(h.spoken.at(-1).text,/放下/);
 }finally{h.close();}
});
test('mute, background and output failure stop guidance and never start microphone',()=>{
 const h=harness();try{
  h.state.playing=true;h.panel.playbackChanged({type:'play'});h.element('guidance-toggle').checked=false;h.element('guidance-toggle').listeners.change();h.state.time=6;h.panel.playbackChanged({type:'tick'});assert.equal(h.spoken.length,1);
  h.element('guidance-toggle').checked=true;h.element('guidance-toggle').listeners.change();h.spoken.at(-1).onerror();assert.equal(h.element('guidance-toggle').checked,false);h.state.time=10;h.panel.playbackChanged({type:'tick'});assert.equal(h.spoken.length,2);
  h.element('guidance-toggle').checked=true;h.element('guidance-toggle').listeners.change();globalThis.document.hidden=true;h.events.visibilitychange();assert.equal(h.panel.diagnostics.kind,null);assert.equal(h.microphones,0);
 }finally{h.close();}
});


test('AI is optional: known commands bypass model; unknown questions use it only when ready',async()=>{
 let options,requests=0,closed=0,resolve;const ai={phase:'off',get ready(){return this.phase==='ready';},enable(){this.phase='ready';options.onState({phase:'ready',message:'ready'});},disable(){closed++;this.phase='off';options.onState({phase:'off',message:'off'});},ask(){requests++;return new Promise(r=>resolve=r);}};
 const h=harness(o=>{options=o;return ai;});const ask=text=>{h.element('voice-input').value=text;h.element('voice-form').listeners.submit({preventDefault(){}});};
 try{
  assert.equal(h.element('local-ai-toggle').checked,false);ask('手可以彎一點嗎');assert.equal(requests,0);assert.match(h.spoken.at(-1).text,/沒聽懂/);
  h.element('local-ai-toggle').checked=true;h.element('local-ai-toggle').listeners.change();ask('暫停');assert.equal(requests,0);
  ask('手可以彎一點嗎');assert.equal(requests,1);h.state.playing=true;h.state.time=7;const count=h.spoken.length;h.panel.playbackChanged({type:'tick'});assert.equal(h.spoken.length,count);
  resolve('手臂自然伸展，不必鎖死。');await new Promise(r=>setImmediate(r));assert.match(h.spoken.at(-1).text,/不必鎖死/);
  h.element('local-ai-toggle').checked=false;h.element('local-ai-toggle').listeners.change();assert.equal(closed,1);assert.equal(h.panel.diagnostics.localAI,'off');assert.equal(h.microphones,0);
  ai.phase='ready';globalThis.document.hidden=true;h.events.visibilitychange();assert.equal(ai.phase,'off');
 }finally{h.close();}
});
