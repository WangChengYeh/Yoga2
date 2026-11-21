import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSession } from '../src/voice-session.js';

function harness(extra={}) {
  const instances=[],utterances=[],states=[],texts=[],replies=[],mouth=[],timers=new Map();let next=0,cancelled=0;
  class Recognition{
    constructor(){instances.push(this);this.aborted=false;this.results=[];}
    start(){this.onstart?.();}
    abort(){this.aborted=true;this.onend?.();}
    result(text,confidence=.9,isFinal=true){const index=this.results.at(-1)?.isFinal?this.results.length:Math.max(0,this.results.length-1);this.results[index]=Object.assign([{transcript:text,confidence}],{isFinal});this.onresult?.({resultIndex:index,results:this.results});}
  }
  class Utterance{constructor(text){this.text=text;}}
  const synthesis={getVoices:()=>[{lang:'zh-TW',localService:true,name:'test'}],speak:(utterance)=>{assert.ok(!session.wanted||session.recognition,'enabled microphone must stay attached during output');utterances.push(utterance);},cancel:()=>cancelled++};
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
  recognizer.result('暫停');recognizer.onresult({resultIndex:0,results:recognizer.results});assert.deepEqual(h.texts,['暫停']);recognizer.result('繼續');assert.deepEqual(h.texts,['暫停','繼續']);h.session.stop();
});
test('low confidence requests a repeat without executing a command; zero confidence is unspecified',()=>{
  const h=harness();h.session.enable();h.instances[0].result('暫停',.2);assert.equal(h.texts.length,0);assert.match(h.replies[0],/聽清楚/);h.session.stop();
  h.session.enable();h.instances.at(-1).result('暫停',0);assert.equal(h.texts.length,1);h.session.stop();
});
test('microphone stays active through guidance and reply; echo cannot answer itself',()=>{
  const h=harness();h.session.enable();const r=h.instances[0];
  h.session.speak('雙手慢慢向上伸展。',{kind:'guidance'});const cue=h.utterances.at(-1);cue.onstart();
  assert.equal(r.aborted,false);assert.equal(r.continuous,true);r.onspeechstart();
  r.result('雙手',.9,false);r.result('雙手慢慢',.9,false);r.result('雙手慢慢向上伸展。');assert.equal(h.texts.length,0);assert.equal(h.session.utterance,cue);
  r.result('我想問問題',.9,false);assert.equal(h.session.utterance,null);assert.equal(h.mouth.at(-1),false);
  r.result('我想問問題');assert.deepEqual(h.texts,['我想問問題']);const reply=h.utterances.at(-1);reply.onstart();
  r.result('好，已處理。');assert.equal(h.texts.length,1);r.result('暫停');assert.deepEqual(h.texts,['我想問問題','暫停']);assert.equal(r.aborted,false);h.session.stop();
});
test('permission/network/microphone failures stop listening without retry loops',()=>{
  for(const error of ['not-allowed','service-not-allowed','network','audio-capture','language-not-supported']){
    const h=harness();h.session.enable();h.instances[0].onerror({error});assert.equal(h.session.wanted,false);assert.equal(h.states.at(-1).phase,'error');assert.equal(h.timers.size,0);
  }
});
test('idle recognition endings restart without disabling the microphone',()=>{
  const h=harness();h.session.enable();
  for(let i=0;i<3;i++){h.instances.at(-1).onend();h.run(150);}
  assert.equal(h.instances.length,4);assert.equal(h.session.wanted,true);h.session.stop();assert.equal(h.timers.size,0);
});
test('stop cancels microphone, queued speech, mouth animation and delayed restarts',()=>{
  const h=harness();h.session.enable();h.instances[0].result('再一次');const utterance=h.utterances[0];utterance.onstart();const lateEnd=utterance.onend;
  h.session.stop();lateEnd();h.run(150);assert.equal(h.instances.length,1);assert.equal(h.mouth.at(-1),false);assert.equal(h.cancelled,1);assert.equal(h.timers.size,0);
});
test('speech service failure keeps the written reply and closes the mouth',()=>{
  const h=harness();h.session.enable();h.instances[0].result('再一次');h.utterances[0].onstart();h.utterances[0].onerror();
  assert.equal(h.replies[0],'好，已處理。');assert.equal(h.states.at(-1).phase,'error');assert.equal(h.mouth.at(-1),false);assert.equal(h.session.wanted,true);assert.equal(h.session.audioBlocked,true);h.session.stop();
});
test('missing or muted synthesis preserves commands and text without opening mouth',()=>{
  for(const options of [{synthesis:null},{audioEnabled:()=>false}]){
    const h=harness(options);h.session.enable();h.instances[0].result('暫停');assert.equal(h.texts.length,1);assert.equal(h.replies.length,1);assert.equal(h.mouth.includes(true),false);h.session.stop();
  }
});
test('hanging recognition and synthesis expire; recognizer construction/start errors are recoverable',()=>{
  const h=harness({Recognition:class{start(){}abort(){}}});h.session.enable();h.run(12000);assert.match(h.states.at(-1).message,/12 秒/);assert.equal(h.session.wanted,false);h.session.stop();
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
 const h=harness();h.session.enable();h.session.speak('換邊。',{kind:'guidance'});h.session.cancelSpeech('guidance');assert.equal(h.session.wanted,true);h.run(150);assert.equal(h.instances.length,1);h.session.stop();
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
test('async AI answer keeps microphone while thinking and speaking',async()=>{
 const spoken=[];let resolve,microphones=0;const session=new VoiceSession({Recognition:class{constructor(){microphones++;}start(){}abort(){}},onText:()=>new Promise(r=>resolve=r),Utterance:class{constructor(text){this.text=text;}},synthesis:{cancel(){},speak:u=>spoken.push(u),getVoices:()=>[]}});
 session.acceptText('AI');session.wanted=true;session.listen();assert.equal(microphones,1);
 resolve('肩膀放鬆');await Promise.resolve();await Promise.resolve();assert.equal(spoken[0].text,'肩膀放鬆');session.stop();
});

test('input starts once on speechstart/interim/final, and finishes only after reply, never for guidance',()=>{
 const events=[],h=harness({onInputStart:()=>events.push('start'),onReplyEnd:()=>events.push('end'),onInputCancel:()=>events.push('cancel')});
 h.session.enable();const r=h.instances[0];r.onspeechstart();r.onspeechstart();r.result('關鍵',.9,false);assert.deepEqual(events,['start']);
 r.result('關鍵要領');assert.deepEqual(events,['start']);h.utterances.at(-1).onend();assert.deepEqual(events,['start','end']);
 h.session.speak('雙手上舉',{kind:'guidance'});h.utterances.at(-1).onend();assert.deepEqual(events,['start','end']);h.session.stop();
});
test('speech with no final text asks for clarification and finishes after prompt; stale events cannot pause',()=>{
 const events=[],h=harness({onInputStart:()=>events.push('start'),onReplyEnd:()=>events.push('end'),onInputCancel:()=>events.push('cancel')});
 h.session.enable();const r=h.instances[0],late=r.onspeechstart;r.onspeechstart();r.onend();assert.match(h.replies.at(-1),/聽清楚/);assert.deepEqual(events,['start']);
 h.utterances.at(-1).onend();assert.deepEqual(events,['start','end']);h.session.stop();late();assert.deepEqual(events,['start','end']);
});

test('blocked speech retains microphone and replays the failed AI answer audibly on explicit retry',async()=>{
 let resolve;const audio=[],h=harness({onText:()=>new Promise(r=>resolve=r),onAudioState:s=>audio.push(s)});
 h.session.enable();h.instances[0].result('問題');resolve('AI 的回答');await Promise.resolve();await Promise.resolve();
 h.utterances[0].onerror({error:'not-allowed'});assert.equal(h.session.wanted,true);assert.equal(h.session.audioBlocked,true);assert.match(audio.at(-1).message,/重試聲音/);
 h.session.primeAudio();assert.equal(h.utterances.length,1);assert.equal(h.session.audioBlocked,true,'warming cannot claim playback succeeded');
 assert.equal(h.session.retryAudio(),true);const retried=h.utterances.at(-1);assert.equal(retried.text,'AI 的回答');assert.equal(retried.volume,1);retried.onstart();retried.onend();assert.equal(h.session.audioBlocked,false);assert.equal(h.instances.length,1);
 h.instances[0].result('下一個問題');resolve('新的 AI 回答');await Promise.resolve();await Promise.resolve();assert.equal(h.utterances.at(-1).text,'新的 AI 回答');h.session.stop();
});
test('start timeout retry uses browser default voice; playback timeout stays distinct and mute forbids retry',()=>{
 const h=harness();h.session.acceptText('問題');const old=h.utterances.at(-1),lateStart=old.onstart;h.run(10000);assert.equal(h.session.lastAudioError,'start-timeout');
 assert.equal(h.session.retryAudio(),true);const retry=h.utterances.at(-1);assert.equal(retry.voice,null);lateStart();assert.equal(h.session.speaking,false);retry.onstart();h.run(60000);assert.equal(h.session.lastAudioError,'playback-timeout');h.session.stop();
 const muted=harness();muted.session.speak('話');muted.run(10000);muted.session.audioEnabled=()=>false;muted.session.primeAudio();assert.equal(muted.session.retryAudio(),false);assert.equal(muted.utterances.length,1);muted.session.stop();
});
test('preparation never creates zero-volume utterances, marks readiness or adds timers',()=>{
 const h=harness();h.session.enable();for(let i=0;i<4;i++)h.session.primeAudio();assert.equal(h.utterances.length,0);assert.equal(h.session.audioPrimed,undefined);assert.equal(h.timers.size,0);assert.equal(h.instances[0].aborted,false);h.session.stop();
});
test('local Chinese voice is preferred to an unavailable network voice',()=>{
 const remote={lang:'zh-TW',localService:false},local={lang:'zh-CN',localService:true};const h=harness();h.session.synthesis.getVoices=()=>[remote,local];h.session.acceptText('問題');assert.equal(h.utterances.at(-1).voice,local);h.session.stop();
});

test('barge-in cancels stale answer completion and preserves one conversation until the new answer ends',()=>{
 const events=[],h=harness({onInputStart:()=>events.push('start'),onReplyEnd:()=>events.push('end'),onInputCancel:()=>events.push('cancel')});
 h.session.enable();const r=h.instances[0];r.result('問題一');const first=h.utterances.at(-1),late=first.onend;first.onstart();
 r.result('等一下',.9,false);assert.equal(h.session.utterance,null);assert.equal(r.aborted,false);late();assert.deepEqual(events,['start']);
 r.result('問題二');h.utterances.at(-1).onend();assert.deepEqual(events,['start','end']);assert.deepEqual(h.texts,['問題一','問題二']);h.session.stop();
});
test('continuous recognition restarts during coach speech and ignores callbacks from the ended recognizer',()=>{
 const h=harness();h.session.enable();h.session.speak('保持自然呼吸',{kind:'guidance'});const r=h.instances[0],late=r.onresult,cue=h.utterances.at(-1);
 r.onend();h.run(150);assert.equal(h.instances.length,2);assert.equal(h.session.utterance,cue);assert.equal(h.session.wanted,true);
 late({resultIndex:0,results:[Object.assign([{transcript:'暫停',confidence:.9}],{isFinal:true})]});assert.equal(h.texts.length,0);
 h.instances[1].result('暫停');assert.deepEqual(h.texts,['暫停']);h.session.stop();
});
test('echo tail expires so a deliberate repetition is accepted; watchdog does not abort active coach speech',()=>{
 const h=harness();h.session.enable();const r=h.instances[0];h.session.speak('放鬆肩膀',{kind:'guidance'});const cue=h.utterances.at(-1);cue.onstart();
 h.run(12000);assert.equal(r.aborted,false);cue.onend();r.result('放鬆肩膀');assert.equal(h.texts.length,0);
 h.run(1200);r.result('放鬆肩膀');assert.deepEqual(h.texts,['放鬆肩膀']);h.session.stop();assert.equal(h.timers.size,0);
});

test('browser-aborted recognition reconnects without cancelling coach output or disabling listening',()=>{
 const h=harness();h.session.enable();h.session.speak('自然呼吸',{kind:'guidance'});const cue=h.utterances.at(-1);cue.onstart();
 h.instances[0].onerror({error:'aborted'});assert.equal(h.session.wanted,true);assert.equal(h.session.utterance,cue);h.run(150);assert.equal(h.instances.length,2);h.session.stop();
});

test('failed microphone startup during reconnect cannot leave orphan coach audio playing',()=>{
 const h=harness({Recognition:class{start(){throw new Error('not allowed');}abort(){}}});h.session.wanted=true;
 h.session.speak('歡迎',{kind:'welcome'});assert.equal(h.session.wanted,false);assert.equal(h.utterances.length,0);assert.equal(h.timers.size,0);
});

test('orphan native queue is cancelled before speech without detaching the enabled microphone',()=>{
 const h=harness();h.session.enable();let resets=0;h.session.synthesis.pending=true;h.session.synthesis.speaking=false;
 h.session.synthesis.cancel=()=>{resets++;h.session.synthesis.pending=false;};h.session.synthesis.speak=u=>{assert.equal(h.session.synthesis.pending,false);h.utterances.push(u);};
 h.session.speak('你好',{kind:'welcome'});assert.equal(resets,1);assert.equal(h.instances[0].aborted,false);assert.equal(h.utterances.length,1);assert.equal(h.session.audioEvents.at(-2).event,'reset-orphan-queue');h.session.stop();
});
test('timeout diagnostics retain engine state, not spoken text; warming voices can safely fail',()=>{
 const h=harness();h.session.enable();h.session.speak('私人問題的回答');h.session.synthesis.pending=true;h.session.synthesis.paused=true;h.run(10000);
 assert.equal(h.session.lastAudioSnapshot.pending,true);assert.equal(h.session.lastAudioSnapshot.paused,true);assert.equal(h.session.lastAudioSnapshot.recognitionAttached,true);assert.equal(h.session.lastAudioSnapshot.voiceCount,1);assert.doesNotMatch(JSON.stringify(h.session.audioEvents),/私人/);
 h.session.synthesis.getVoices=()=>{throw new Error('voice list unavailable');};h.session.primeAudio();h.session.retryAudio();assert.equal(h.utterances.at(-1).voice,null);assert.equal(h.instances.length,1);h.session.stop();
});
test('new user input and manual stop discard failed speech; duplicate retries do not restart pending speech',()=>{
 const h=harness();h.session.enable();h.session.speak('舊回答');h.run(10000);h.session.retryAudio();const count=h.utterances.length;h.session.retryAudio();assert.equal(h.utterances.length,count);
 h.session.beginInput();h.session.cancelSpeech(undefined,{preserveInput:true});assert.equal(h.session.retryAudio(),false);h.session.stop();assert.equal(h.session.failedSpeech,null);assert.equal(h.timers.size,0);
});

test('a newer text answer during blocked output replaces the retry target instead of reviving an old answer',()=>{
 const h=harness({onText:text=>'回答：'+text});h.session.enable();h.session.speak('舊回答');h.run(10000);
 h.instances[0].result('新問題');assert.equal(h.utterances.length,1);assert.equal(h.session.failedSpeech.text,'回答：新問題');assert.equal(h.session.inputActive,false);
 h.session.retryAudio();assert.equal(h.utterances.at(-1).text,'回答：新問題');h.session.stop();
});
