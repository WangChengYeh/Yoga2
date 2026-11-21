import {reducePlayback} from '../src/course.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setupVoicePanel} from '../src/voice-panel.js';
function harness(createAI,getPose=()=>null){
 const oldDocument=globalThis.document,oldWindow=globalThis.window,elements=new Map(),spoken=[],events={};let microphones=0,cancelled=0;const recognitions=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{id,checked:['guidance-toggle','voice-output'].includes(id),dataset:{},value:'',listeners:{},textContent:'',addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){}});return elements.get(id);};
 globalThis.document={hidden:false,getElementById:element,querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn};
 globalThis.window={SpeechRecognition:class{constructor(){microphones++;recognitions.push(this);}start(){this.onstart?.();}abort(){}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[{lang:'zh-TW',localService:true}],speak:u=>spoken.push(u),cancel:()=>cancelled++},addEventListener:(type,fn)=>events[type]=fn};
 const state={ready:true,time:0,playing:false,speed:1};let panel;
 const dispatch=action=>{Object.assign(state,reducePlayback(state,action));panel.playbackChanged(action);};
 panel=setupVoicePanel({getState:()=>state,dispatch,getPose,...(createAI?{createAI}:{})});
 return {state,panel,spoken,element,events,dispatch,recognitions,get microphones(){return microphones;},get cancelled(){return cancelled;},close(){panel.silence();globalThis.document=oldDocument;globalThis.window=oldWindow;}};
}
test('playback wiring speaks movement names without microphone, pauses immediately and resumes current cue',()=>{
 const h=harness();try{
  assert.equal(h.spoken.length,0);h.state.playing=true;h.panel.playbackChanged({type:'toggle'});assert.match(h.spoken.at(-1).text,/站姿上舉伸展/);assert.equal(h.microphones,0);
  h.state.time=7;h.panel.playbackChanged({type:'tick'});assert.match(h.spoken.at(-1).text,/肩膀/);h.state.playing=false;h.panel.playbackChanged({type:'pause'});assert.equal(h.panel.diagnostics.kind,null);
  h.state.playing=true;h.panel.playbackChanged({type:'play'});assert.match(h.spoken.at(-1).text,/自然呼吸/);
 }finally{h.close();}
});
test('question freezes the course and resumes from the same time only after the spoken answer ends',()=>{
 const h=harness();try{
  h.state.time=7;h.dispatch({type:'play'});const time=h.state.time;
  h.element('voice-input').value='關鍵要領';h.element('voice-form').listeners.submit({preventDefault(){}});
  assert.equal(h.state.playing,false);assert.match(h.spoken.at(-1).text,/不必勉強/);const reply=h.spoken.at(-1),count=h.spoken.length;
  h.dispatch({type:'tick',delta:12});assert.equal(h.state.time,time);assert.equal(h.spoken.length,count);
  reply.onend();assert.equal(h.state.playing,true);assert.equal(h.state.time,time);assert.match(h.spoken.at(-1).text,/肩膀放鬆/);
  h.dispatch({type:'tick',delta:1});assert.equal(h.state.time,8);
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

test('AI error exposes exact diagnostic and copy fallback never needs microphone',async()=>{
 let options;const ai={phase:'off',diagnostics:{failure:{code:'GPU_ADAPTER_NULL',stage:'adapter',error:{name:'Error',message:'returned null'}}},enable(){this.phase='error';options.onState({phase:'error',message:'GPU_ADAPTER_NULL: returned null'});},disable(){},ready:false};
 const h=harness(o=>{options=o;return ai;});
 try{
  h.element('local-ai-toggle').checked=true;h.element('local-ai-toggle').listeners.change();assert.equal(h.element('local-ai-toggle').checked,false);assert.equal(h.element('local-ai-details').hidden,false);
  assert.match(h.element('local-ai-diagnostic').textContent,/GPU_ADAPTER_NULL/);
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  try{
   let copied;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied=text}}});
   await h.element('local-ai-copy').listeners.click();assert.match(copied,/GPU_ADAPTER_NULL/);assert.match(h.element('local-ai-copy-status').textContent,/已複製/);
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});await h.element('local-ai-copy').listeners.click();assert.equal(h.element('local-ai-details').open,true);assert.match(h.element('local-ai-copy-status').textContent,/長按/);assert.equal(h.microphones,0);
  }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
 }finally{h.close();}
});

const ask=(h,text)=>{h.element('voice-input').value=text;h.element('voice-form').listeners.submit({preventDefault(){}});};
const recognitionResult=(recognition,text,final=true)=>recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:text,confidence:.9}],{isFinal:final})]});
test('speech onset pauses before final recognition; interim words never execute a command',()=>{
 const h=harness();try{
  h.element('guidance-toggle').checked=false;h.element('guidance-toggle').listeners.change();h.state.time=9;h.dispatch({type:'play'});
  h.element('voice-toggle').listeners.click();const r=h.recognitions.at(-1);assert.equal(h.state.playing,true,'opening microphone alone is not speech');
  r.onspeechstart();assert.equal(h.state.playing,false);assert.equal(h.panel.diagnostics.resumeAfterReply,true);
  recognitionResult(r,'暫停',false);assert.equal(h.spoken.length,0);h.dispatch({type:'tick',delta:10});assert.equal(h.state.time,9);
  recognitionResult(r,'現在做什麼');assert.equal(h.state.playing,false);h.spoken.at(-1).onend();assert.equal(h.state.playing,true);assert.equal(h.state.time,9);
 }finally{h.close();}
});
test('interim text pauses even when browser omits speechstart',()=>{
 const h=harness();try{
  h.element('guidance-toggle').checked=false;h.element('guidance-toggle').listeners.change();h.dispatch({type:'play'});h.element('voice-toggle').listeners.click();
  const r=h.recognitions.at(-1);recognitionResult(r,'關鍵',false);assert.equal(h.state.playing,false);assert.equal(h.spoken.length,0);
  recognitionResult(r,'關鍵要領');h.spoken.at(-1).onend();assert.equal(h.state.playing,true);
 }finally{h.close();}
});
test('already paused and explicit pause remain paused; resume and replay wait for answer completion',()=>{
 for(const [initial,text,shouldResume] of [[false,'關鍵要領',false],[true,'暫停',false],[false,'繼續',true],[true,'再一次',true]]){
  const h=harness();try{
   h.state.time=10;if(initial)h.dispatch({type:'play'});ask(h,text);assert.equal(h.state.playing,false,text);
   const time=h.state.time;h.dispatch({type:'tick',delta:10});assert.equal(h.state.time,time);
   h.spoken.at(-1).onend();assert.equal(h.state.playing,shouldResume,text);
   if(text==='再一次')assert.equal(h.state.time,0);
  }finally{h.close();}
 }
});
test('AI thinking and full spoken reply keep motion paused; answer resumes original playback',async()=>{
 let resolve;const ai={phase:'ready',ready:true,diagnostics:{},disable(){},ask:()=>new Promise(r=>resolve=r)};
 const h=harness(()=>ai);try{
  h.state.time=20;h.dispatch({type:'play'});ask(h,'手肘要稍微彎嗎？');assert.equal(h.state.playing,false);h.dispatch({type:'tick',delta:20});assert.equal(h.state.time,20);
  resolve('手肘自然伸直，不要鎖死。');await new Promise(r=>setImmediate(r));assert.equal(h.state.playing,false);assert.match(h.spoken.at(-1).text,/不要鎖死/);
  h.spoken.at(-1).onend();assert.equal(h.state.playing,true);assert.equal(h.state.time,20);
 }finally{h.close();}
});
test('stop, manual pause/seek, background and speech errors cancel any automatic resume',()=>{
 for(const outcome of ['stop','pause','seek','background','error']){
  const h=harness();try{
   h.dispatch({type:'play'});ask(h,'關鍵要領');const reply=h.spoken.at(-1),lateEnd=reply.onend;
   if(outcome==='stop')h.element('voice-stop').listeners.click();
   if(outcome==='pause')h.dispatch({type:'pause'});
   if(outcome==='seek')h.dispatch({type:'seek',time:30,pause:true});
   if(outcome==='background'){globalThis.document.hidden=true;h.events.visibilitychange();}
   if(outcome==='error')reply.onerror();
   lateEnd();assert.equal(h.state.playing,false,outcome);assert.equal(h.panel.diagnostics.resumeAfterReply,false);
  }finally{h.close();}
 }
});
test('muted replies release the pause after text appears; newer question preserves original resume intent',()=>{
 const h=harness();try{
  h.element('voice-output').checked=false;h.dispatch({type:'play'});ask(h,'現在做什麼');assert.equal(h.state.playing,true);assert.match(h.element('voice-reply').textContent,/站姿上舉/);
  h.element('voice-output').checked=true;ask(h,'關鍵要領');const lateEnd=h.spoken.at(-1).onend;ask(h,'還有多久');assert.equal(h.state.playing,false);
  lateEnd();assert.equal(h.state.playing,false);h.spoken.at(-1).onend();assert.equal(h.state.playing,true);
 }finally{h.close();}
});


test('auto-pause preserves the fresh pre-pause observation for posture questions',()=>{
 let h;h=harness(undefined,()=>h.state.playing?{active:true,valid:true,message:'雙手已上舉。',updatedAt:performance.now()}:{active:true,valid:false});
 try{h.dispatch({type:'play'});ask(h,'我的姿勢如何');assert.equal(h.state.playing,false);assert.match(h.spoken.at(-1).text,/雙手已上舉/);h.spoken.at(-1).onend();assert.equal(h.state.playing,true);}finally{h.close();}
});
