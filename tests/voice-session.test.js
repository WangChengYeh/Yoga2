import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSession } from '../src/voice-session.js';

function harness(extra={}) {
  const instances=[],utterances=[],states=[],texts=[],replies=[],mouth=[],timers=new Map();let next=0,cancelled=0;
  class Recognition{
    constructor(){instances.push(this);this.aborted=false;}
    start(){this.onstart?.();}
    abort(){this.aborted=true;this.onend?.();}
    result(text,confidence=.9,isFinal=true){this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:text,confidence}],{isFinal})]});}
  }
  class Utterance{constructor(text){this.text=text;}}
  const synthesis={getVoices:()=>[{lang:'zh-TW',localService:true,name:'test'}],speak:(utterance)=>{assert.ok(instances.every((instance)=>instance.aborted),'microphone must be detached before any speech output');utterances.push(utterance);},cancel:()=>cancelled++};
  const session=new VoiceSession({Recognition,Utterance,synthesis,onText:(text)=>{texts.push(text);return '好，已處理。';},onState:(state)=>states.push(state),onReply:(reply)=>replies.push(reply),onSpeaking:(value)=>mouth.push(value),
    setTimer:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimer:(id)=>timers.delete(id),...extra});
  return {session,instances,utterances,states,texts,replies,mouth,timers,get cancelled(){return cancelled;},run(ms){for(const [id,timer] of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}}};
}
test('microphone is opt-in and unsupported browsers retain text replies',()=>{
  const h=harness();assert.equal(h.instances.length,0);h.session.acceptText('現在做什麼');assert.equal(h.instances.length,0);
  h.session.stop();const unsupported=harness({Recognition:null});unsupported.session.enable();assert.equal(unsupported.states.at(-1).phase,'unsupported');
  unsupported.session.acceptText('怎麼做');assert.equal(unsupported.replies.length,1);unsupported.session.stop();
});
test('recognition only acts on final results and executes one final result once',()=>{
  const h=harness();h.session.enable();const recognizer=h.instances[0];
  recognizer.result('暫停',.9,false);assert.equal(h.texts.length,0);
  recognizer.result('暫停');recognizer.result('繼續');assert.deepEqual(h.texts,['暫停']);h.session.stop();
});
test('low confidence requests a repeat without executing a command; zero confidence is unspecified',()=>{
  const h=harness();h.session.enable();h.instances[0].result('暫停',.2);assert.equal(h.texts.length,0);assert.match(h.replies[0],/聽清楚/);h.session.stop();
  h.session.enable();h.instances.at(-1).result('暫停',0);assert.equal(h.texts.length,1);h.session.stop();
});
test('echo prevention: old recognition events and microphone restarts are blocked during speech',()=>{
  const h=harness();h.session.enable();const recognizer=h.instances[0],late=recognizer.onresult;
  recognizer.result('暫停');const utterance=h.utterances[0];utterance.onstart();
  late({resultIndex:0,results:[Object.assign([{transcript:'繼續',confidence:.99}],{isFinal:true})]});
  h.session.listen();assert.equal(h.instances.length,1);assert.equal(h.texts.length,1);assert.equal(h.mouth.at(-1),true);
  utterance.onend();assert.equal(h.mouth.at(-1),false);assert.equal(h.instances.length,1);
  h.run(800);assert.equal(h.instances.length,2);h.session.stop();
});
test('permission/network/microphone failures stop listening without retry loops',()=>{
  for(const error of ['not-allowed','service-not-allowed','network','audio-capture','language-not-supported']){
    const h=harness();h.session.enable();h.instances[0].onerror({error});assert.equal(h.session.wanted,false);assert.equal(h.states.at(-1).phase,'error');assert.equal(h.timers.size,0);
  }
});
test('three empty recognition sessions stop automatically instead of endlessly requesting speech',()=>{
  const h=harness();h.session.enable();
  for(let i=0;i<3;i++){h.instances.at(-1).onend();h.run(800);}
  assert.equal(h.instances.length,3);assert.equal(h.session.wanted,false);assert.equal(h.timers.size,0);
});
test('stop cancels microphone, queued speech, mouth animation and delayed restarts',()=>{
  const h=harness();h.session.enable();h.instances[0].result('再一次');const utterance=h.utterances[0];utterance.onstart();const lateEnd=utterance.onend;
  h.session.stop();lateEnd();h.run(800);assert.equal(h.instances.length,1);assert.equal(h.mouth.at(-1),false);assert.equal(h.cancelled,1);assert.equal(h.timers.size,0);
});
test('speech service failure keeps the written reply and closes the mouth',()=>{
  const h=harness();h.session.enable();h.instances[0].result('再一次');h.utterances[0].onstart();h.utterances[0].onerror();
  assert.equal(h.replies[0],'好，已處理。');assert.equal(h.states.at(-1).phase,'error');assert.equal(h.mouth.at(-1),false);assert.equal(h.session.wanted,false);
});
test('missing or muted synthesis preserves commands and text without opening mouth',()=>{
  for(const options of [{synthesis:null},{audioEnabled:()=>false}]){
    const h=harness(options);h.session.enable();h.instances[0].result('暫停');assert.equal(h.texts.length,1);assert.equal(h.replies.length,1);assert.equal(h.mouth.includes(true),false);h.session.stop();
  }
});
test('hanging recognition and synthesis expire; recognizer construction/start errors are recoverable',()=>{
  const h=harness();h.session.enable();h.run(12000);assert.match(h.states.at(-1).message,/清楚/);h.session.stop();
  const speech=harness();speech.session.acceptText('暫停');speech.run(10000);assert.equal(speech.states.at(-1).phase,'error');assert.equal(speech.mouth.at(-1),false);
  for(const Recognition of [class{constructor(){throw new Error();}},class{start(){throw new Error();}abort(){}}]){
    const failed=harness({Recognition});failed.session.enable();assert.equal(failed.states.at(-1).phase,'error');assert.equal(failed.session.wanted,false);
  }
});
test('automatic guidance uses synthesis without ever opening microphone',()=>{
 const h=harness();h.session.speak('肩膀放鬆。',{kind:'guidance',rate:1.1});assert.equal(h.instances.length,0);assert.equal(h.utterances[0].rate,1.1);assert.equal(h.session.speechKind,'guidance');h.session.stop();
});
test('manual replies preempt guidance, and automatic cues cannot interrupt a reply',()=>{
 const h=harness();h.session.speak('上舉。',{kind:'guidance'});const old=h.utterances[0],oldEnd=old.onend;h.session.acceptText('現在做什麼');assert.equal(h.cancelled,1);assert.equal(h.session.speechKind,'reply');h.session.speak('放下。',{kind:'guidance'});assert.equal(h.utterances.length,2);oldEnd();assert.equal(h.session.speechKind,'reply');assert.equal(h.session.cancelSpeech('guidance'),false);h.session.stop();
});
test('guidance-only cancellation preserves enabled listening, while muted replies do not block future cues',()=>{
 const h=harness();h.session.enable();h.session.speak('換邊。',{kind:'guidance'});h.session.cancelSpeech('guidance');assert.equal(h.session.wanted,true);h.run(800);assert.equal(h.instances.length,2);h.session.stop();
 const muted=harness({audioEnabled:kind=>kind==='guidance'});muted.session.acceptText('要領');assert.equal(muted.session.speechKind,null);muted.session.speak('自然呼吸。',{kind:'guidance'});assert.equal(muted.utterances.length,1);muted.session.stop();
});
test('synthesis failure reports the failed channel so guidance can stop retrying automatically',()=>{
 const failed=[],h=harness({onSpeechError:kind=>failed.push(kind)});h.session.speak('自然呼吸。',{kind:'guidance'});h.utterances[0].onerror();assert.deepEqual(failed,['guidance']);assert.equal(h.session.utterance,null);assert.equal(h.session.speechKind,null);h.session.stop();
});

test('async AI reply is cancelled by stop, newer command and seek-style cancellation',async()=>{
 for(const action of ['stop','newer','cancel']){
  const spoken=[];let resolve;const session=new VoiceSession({onText:text=>text==='AI'?new Promise(r=>resolve=r):'已暫停',Utterance:class{constructor(text){this.text=text;}},synthesis:{cancel(){},speak:u=>spoken.push(u),getVoices:()=>[]}});
  session.acceptText('AI');assert.equal(session.speechKind,'reply');assert.equal(session.listenTimer,undefined);
  if(action==='stop')session.stop();else if(action==='cancel')session.cancelSpeech();else session.acceptText('暫停');
  resolve('過時回覆');await Promise.resolve();await Promise.resolve();assert.ok(spoken.every(u=>u.text!=='過時回覆'));session.stop();
 }
});
test('async AI answer speaks normally and blocks microphone while thinking',async()=>{
 const spoken=[];let resolve,microphones=0;const session=new VoiceSession({Recognition:class{constructor(){microphones++;}},onText:()=>new Promise(r=>resolve=r),Utterance:class{constructor(text){this.text=text;}},synthesis:{cancel(){},speak:u=>spoken.push(u),getVoices:()=>[]}});
 session.acceptText('AI');session.wanted=true;session.listen();assert.equal(microphones,0);
 resolve('肩膀放鬆');await Promise.resolve();await Promise.resolve();assert.equal(spoken[0].text,'肩膀放鬆');session.stop();
});
