import {reducePlayback} from '../src/course.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setupVoicePanel} from '../src/voice-panel.js';
function harness(createAI,getPose=()=>null){
 const oldDocument=globalThis.document,oldWindow=globalThis.window,elements=new Map(),spoken=[],primers=[],events={};let microphones=0,cancelled=0;const recognitions=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{id,checked:['guidance-toggle','voice-output'].includes(id),dataset:{},value:'',listeners:{},textContent:'',addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){}});return elements.get(id);};
 globalThis.document={hidden:false,getElementById:element,querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn};
 globalThis.window={SpeechRecognition:class{constructor(){microphones++;recognitions.push(this);}start(){this.onstart?.();}abort(){}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[{lang:'zh-TW',localService:true}],speak:u=>(u.volume===0?primers:spoken).push(u),cancel:()=>cancelled++},addEventListener:(type,fn)=>events[type]=fn};
 const state={ready:true,time:0,playing:false,speed:1};let panel;
 const dispatch=action=>{Object.assign(state,reducePlayback(state,action));panel.playbackChanged(action);};
 panel=setupVoicePanel({getState:()=>state,dispatch,getPose,...(createAI?{createAI}:{})});
 return {state,panel,spoken,primers,element,events,dispatch,recognitions,get microphones(){return microphones;},get cancelled(){return cancelled;},close(){panel.silence();globalThis.document=oldDocument;globalThis.window=oldWindow;}};
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
  h.element('guidance-toggle').checked=true;h.element('guidance-toggle').listeners.change();h.spoken.at(-1).onerror();assert.equal(h.element('guidance-toggle').checked,true);assert.equal(h.panel.mediaStatus.outputBlocked,true);h.state.time=10;h.panel.playbackChanged({type:'tick'});assert.equal(h.spoken.length,2);
  h.element('guidance-toggle').checked=true;h.element('guidance-toggle').listeners.change();globalThis.document.hidden=true;h.events.visibilitychange();assert.equal(h.panel.diagnostics.kind,null);assert.equal(h.microphones,0);
 }finally{h.close();}
});


test('standard AI entry serves questions when ready while commands stay deterministic',async()=>{
 let options,requests=0,closed=0,resolve;const ai={phase:'off',get ready(){return this.phase==='ready';},enable(){this.phase='ready';options.onState({phase:'ready',message:'ready'});},disable(){closed++;this.phase='off';options.onState({phase:'off',message:'off'});},ask(){requests++;return new Promise(r=>resolve=r);}};
 const h=harness(o=>{options=o;return ai;});const ask=text=>{h.element('voice-input').value=text;h.element('voice-form').listeners.submit({preventDefault(){}});};
 try{
  assert.equal(h.element('local-ai-retry').hidden,undefined);ask('手可以彎一點嗎');assert.equal(requests,0);assert.match(h.spoken.at(-1).text,/完整對話暫時還沒準備好/);
  h.panel.enableAI();ask('暫停');assert.equal(requests,0);
  ask('手可以彎一點嗎');assert.equal(requests,1);h.state.playing=true;h.state.time=7;const count=h.spoken.length;h.panel.playbackChanged({type:'tick'});assert.equal(h.spoken.length,count);
  resolve('手臂自然伸展，不必鎖死。');await new Promise(r=>setImmediate(r));assert.match(h.spoken.at(-1).text,/不必鎖死/);
  globalThis.document.hidden=true;h.events.visibilitychange();assert.equal(closed,1);assert.equal(h.panel.diagnostics.localAI,'off');assert.equal(h.microphones,0);
  ai.phase='ready';globalThis.document.hidden=true;h.events.visibilitychange();assert.equal(ai.phase,'off');
 }finally{h.close();}
});

test('AI error exposes exact diagnostic and copy fallback never needs microphone',async()=>{
 let options;const ai={phase:'off',diagnostics:{failure:{code:'GPU_ADAPTER_NULL',stage:'adapter',error:{name:'Error',message:'returned null'}}},enable(){this.phase='error';options.onState({phase:'error',message:'GPU_ADAPTER_NULL: returned null'});},disable(){},ready:false};
 const h=harness(o=>{options=o;return ai;});
 try{
  h.panel.enableAI();assert.equal(h.element('local-ai-retry').hidden,false);assert.equal(h.element('local-ai-details').hidden,false);
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
const recognitionResult=(recognition,text,final=true)=>{const results=recognition.results||=[],index=results.at(-1)?.isFinal?results.length:Math.max(0,results.length-1);results[index]=Object.assign([{transcript:text,confidence:.9}],{isFinal:final});recognition.results=results;recognition.onresult({resultIndex:index,results});};
test('speech onset pauses before final recognition; interim words never execute a command',()=>{
 const h=harness();try{
  h.element('guidance-toggle').checked=false;h.element('guidance-toggle').listeners.change();h.state.time=9;h.dispatch({type:'play'});
  h.panel.enableListening();const r=h.recognitions.at(-1);assert.equal(h.state.playing,true,'opening microphone alone is not speech');
  r.onspeechstart();assert.equal(h.state.playing,false);assert.equal(h.panel.diagnostics.resumeAfterReply,true);
  recognitionResult(r,'暫停',false);assert.equal(h.spoken.length,0);h.dispatch({type:'tick',delta:10});assert.equal(h.state.time,9);
  recognitionResult(r,'現在做什麼');assert.equal(h.state.playing,false);h.spoken.at(-1).onend();assert.equal(h.state.playing,true);assert.equal(h.state.time,9);
 }finally{h.close();}
});
test('interim text pauses even when browser omits speechstart',()=>{
 const h=harness();try{
  h.element('guidance-toggle').checked=false;h.element('guidance-toggle').listeners.change();h.dispatch({type:'play'});h.panel.enableListening();
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

test('AI writes automatic coaching cues; a live question cancels cue generation and retains pause/resume behavior',async()=>{
 const requests=[];let pending;
 const ai={phase:'ready',diagnostics:{},get ready(){return this.phase==='ready';},get pending(){return pending;},guide(cue){this.phase='thinking';return new Promise(resolve=>{pending={kind:'guidance',resolve};requests.push({kind:'guidance',cue,resolve});});},ask(text){this.phase='thinking';return new Promise(resolve=>{pending={kind:'reply',resolve};requests.push({kind:'reply',text,resolve});});},cancelGuidance(){if(pending?.kind==='guidance'){pending.resolve(null);pending=null;this.phase='ready';}},disable(){pending?.resolve(null);pending=null;this.phase='off';}};
 const h=harness(()=>ai);
 try{
  h.dispatch({type:'play'});assert.equal(requests[0].kind,'guidance');assert.equal(h.spoken.length,0);
  ai.phase='ready';pending=null;requests[0].resolve('雙手輕輕舉高，肩膀放鬆。');await new Promise(r=>setImmediate(r));assert.equal(h.spoken.at(-1).text,'雙手輕輕舉高，肩膀放鬆。');assert.equal(h.panel.diagnostics.guidanceSource,'AI');
  h.spoken.at(-1).onend();h.panel.update(100);assert.equal(requests.at(-1).cue.key,'reach:6');const stale=requests.at(-1);
  ask(h,'關鍵要領');assert.equal(h.state.playing,false);assert.equal(requests.at(-1).kind,'reply');
  stale.resolve('肩膀放鬆，保持自然呼吸。');const answer=requests.at(-1);ai.phase='ready';pending=null;answer.resolve('手臂放鬆，不必勉強。');await new Promise(r=>setImmediate(r));assert.equal(h.spoken.at(-1).text,'手臂放鬆，不必勉強。');assert.equal(h.state.playing,false);
  h.spoken.at(-1).onend();assert.equal(h.state.playing,true);
 }finally{h.close();}
});

test('default media entry starts listening idempotently while voice output remains checked',()=>{
 const h=harness();try{
  assert.equal(h.element('voice-output').checked,true);assert.equal(h.element('guidance-toggle').checked,true);
  h.panel.enableListening();assert.equal(h.microphones,1);assert.equal(h.panel.mediaStatus.active,true);h.panel.enableListening();assert.equal(h.microphones,1);
  h.recognitions[0].onerror({error:'not-allowed'});assert.equal(h.panel.mediaStatus.active,false);assert.equal(h.panel.mediaStatus.phase,'error');assert.equal(h.microphones,1,'permission errors never auto-retry');
  h.panel.enableListening();assert.equal(h.microphones,2);
 }finally{h.close();}
});

test('spoken barge-in interrupts coach reply with microphone retained and resumes only after the latest answer',()=>{
 const h=harness();try{
  h.panel.enableListening();h.state.time=7;h.dispatch({type:'play'});const r=h.recognitions[0],cue=h.spoken.at(-1);cue.onstart();
  recognitionResult(r,'雙手肩膀放鬆',false);assert.equal(h.state.playing,false);recognitionResult(r,'現在做什麼');
  const first=h.spoken.at(-1),late=first.onend;first.onstart();assert.equal(h.panel.mediaStatus.active,true);assert.equal(h.microphones,1);
  recognitionResult(r,'等一下',false);late();assert.equal(h.state.playing,false);assert.equal(h.panel.diagnostics.speaking,false);
  recognitionResult(r,'現在還有多久');const second=h.spoken.at(-1);second.onend();assert.equal(h.state.playing,true);assert.equal(h.state.time,7);assert.equal(h.microphones,1);
 }finally{h.close();}
});
test('speech while AI thinks cancels generation before accepting a new question and ignores its old result',async()=>{
 let resolve,cancelled=0;const ai={phase:'ready',get ready(){return this.phase==='ready';},disable(){},ask(){this.phase='thinking';return new Promise(r=>resolve=r);},cancelReply(){if(this.phase==='thinking'){cancelled++;this.phase='ready';}}};
 const h=harness(()=>ai);try{
  h.panel.enableListening();h.dispatch({type:'play'});ask(h,'手肘能彎嗎');const first=resolve,r=h.recognitions[0];
  recognitionResult(r,'再問一個',false);assert.equal(cancelled,1);assert.equal(h.panel.mediaStatus.active,true);
  recognitionResult(r,'手臂能放低嗎');const second=resolve;first('舊答案');await new Promise(r=>setImmediate(r));assert.ok(h.spoken.every(u=>u.text!=='舊答案'));assert.equal(h.state.playing,false);
  ai.phase='ready';second('新答案');await new Promise(r=>setImmediate(r));assert.equal(h.spoken.at(-1).text,'新答案');h.spoken.at(-1).onend();assert.equal(h.state.playing,true);
 }finally{h.close();}
});

test('arrival welcome speaks before practice without waiting for AI; no repeated greeting after delivery',()=>{
 const h=harness();try{
  h.panel.enableListening();assert.equal(h.state.playing,false);h.panel.welcome();const greeting=h.spoken.at(-1);
  assert.match(greeting.text,/我是 Luna/);assert.match(greeting.text,/先聊聊/);assert.equal(h.panel.diagnostics.kind,'welcome');assert.equal(h.microphones,1);
  h.panel.welcome();assert.equal(h.spoken.length,1);greeting.onstart();assert.equal(h.panel.diagnostics.welcomeDelivered,true);greeting.onend();
  h.panel.primeAudio();h.panel.welcome();assert.equal(h.spoken.length,1);assert.equal(h.state.playing,false);
 }finally{h.close();}
});
test('blocked arrival speech retries audibly on a gesture without requiring course start',()=>{
 const h=harness();try{
  h.panel.enableListening();h.panel.welcome();h.spoken.at(-1).onerror({error:'not-allowed'});assert.equal(h.panel.mediaStatus.outputBlocked,true);
  h.panel.primeAudio();assert.equal(h.spoken.length,2);assert.equal(h.primers.length,0);const greeting=h.spoken.at(-1);greeting.onstart();greeting.onend();
  assert.equal(h.panel.mediaStatus.outputBlocked,false);assert.equal(h.state.playing,false);assert.equal(h.microphones,1);
 }finally{h.close();}
});
test('a person can interrupt welcome; a late welcome event cannot start practice or greet again',()=>{
 const h=harness();try{
  h.panel.enableListening();h.panel.welcome();const greeting=h.spoken.at(-1),late=greeting.onend;greeting.onstart();const r=h.recognitions[0];
  recognitionResult(r,'你好',false);assert.equal(h.panel.diagnostics.speaking,false);recognitionResult(r,'你好');assert.match(h.spoken.at(-1).text,/嗨，我在這裡/);
  late();assert.equal(h.state.playing,false);h.spoken.at(-1).onend();h.panel.primeAudio();assert.equal(h.spoken.length,2);assert.equal(h.state.playing,false);
  recognitionResult(r,'準備好了');assert.equal(h.state.playing,false);h.spoken.at(-1).onend();assert.equal(h.state.playing,true);
 }finally{h.close();}
});
test('welcome respects mute, background, ongoing practice, and an already active conversation',()=>{
 for(const reason of ['mute','background','practice','conversation']){
  const h=harness();try{
   if(reason==='mute')h.element('voice-output').checked=false;
   if(reason==='background')globalThis.document.hidden=true;
   if(reason==='practice')h.state.playing=true;
   if(reason==='conversation')ask(h,'你好');
   const count=h.spoken.length;h.panel.welcome();h.panel.primeAudio();assert.equal(h.spoken.length,count,reason);
  }finally{h.close();}
 }
});
test('AI is standard in the page; failures have retry and returning to foreground prepares it without reopening microphone',async()=>{
 const {readFile}=await import('node:fs/promises');const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="local-ai-toggle"/);assert.match(html,/id="local-ai-retry"/);
 let options,enabled=0;const ai={phase:'off',enable(){enabled++;this.phase='error';options.onState({phase:'error',message:'specific failure'});},disable(){this.phase='off';},cancelReply(){}};
 const h=harness(o=>{options=o;return ai;});try{
  h.panel.enableAI();assert.equal(enabled,1);assert.equal(h.element('local-ai-retry').hidden,false);assert.match(h.element('local-ai-status').textContent,/specific failure/);
  h.element('local-ai-retry').listeners.click();assert.equal(enabled,2);
  globalThis.document.hidden=true;h.events.visibilitychange();globalThis.document.hidden=false;h.events.visibilitychange();assert.equal(enabled,3);assert.equal(h.microphones,0);
 }finally{h.close();}
});
