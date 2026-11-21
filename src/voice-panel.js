import { APP_VERSION } from './release.js?v=0.9.14';
import { AIGuidance } from './ai-guidance.js?v=0.9.14';
import { LocalCoachAI } from './local-ai.js?v=0.9.14';
import { CourseNarrator } from './guidance.js?v=0.9.14';
import { VoiceSession } from './voice-session.js?v=0.9.14';
import { respondToUtterance } from './voice-intents.js?v=0.9.14';
import { createMouthMotion, mouthAmount } from './mouth.js?v=0.9.14';

export function setupVoicePanel({ getState, dispatch, getPose, createAI=options=>new LocalCoachAI(options), onMediaState=()=>{},onRuntime=()=>{} }) {
  const $=(id)=>document.getElementById(id);
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let speaking=false, mouth, speechStart=0,answering=false,narrator,conversation=null,managedPlayback=false,aiGuidance,voicePhase='off',audioBlocked=false;
  const guidanceToggle=$('guidance-toggle'),guidanceStatus=$('guidance-status');
  const aiStatus=$('local-ai-status');
  let welcomeAttempted=false,welcomeDelivered=false,welcomeCompleted=false,welcomeEngaged=false,welcomePreparing=false,welcomeSerial=0,welcomeTextReady='';
  const welcomeText='嗨，我是 Luna。今天想先聊聊，還是一起伸展？不用急，我會陪你慢慢來。';
  const ai=createAI({onState:({phase,message})=>{
    onRuntime('ai',{phase,code:phase==='error'?ai.diagnostics?.failure?.code:'none',source:ai.diagnostics?.stage||phase});
    aiStatus.textContent=message;$('local-ai-retry').hidden=!['off','error'].includes(phase);
    $('local-ai-details').hidden=phase!=='error';
    $('local-ai-redownload').hidden=phase!=='error'||!['model','repair'].includes(ai.diagnostics?.failure?.stage);
    if(phase==='error')$('local-ai-diagnostic').textContent=JSON.stringify(ai.diagnostics,null,2);
    if(phase==='ready')queueMicrotask(()=>welcome());
    onMediaState();
  }});
  $('local-ai-redownload').addEventListener('click',()=>{aiGuidance.cancel({clearCache:true});session.cancelSpeech();void ai.enable({reset:true});});
  $('local-ai-copy').addEventListener('click',async()=>{
    const text=JSON.stringify(ai.diagnostics,null,2);$('local-ai-diagnostic').textContent=text;
    try{await navigator.clipboard.writeText(text);$('local-ai-copy-status').textContent='診斷已複製，可貼回對話。';}
    catch{$('local-ai-details').open=true;$('local-ai-copy-status').textContent='瀏覽器不允許自動複製，請長按下方診斷文字複製。';}
  });
  function conversationDispatch(action){managedPlayback=true;try{dispatch(action);}finally{managedPlayback=false;}}
  function beginConversation(){
    welcomeEngaged=true;cancelWelcome();
    if(conversation)return;
    conversation={resume:getState().playing,pose:getPose()};narrator?.suspend();$('voice-status').textContent='教練已暫停，正在聽你說話。';
    if(getState().playing)conversationDispatch({type:'pause'});
  }
  function finishConversation(){
    const resume=conversation?.resume;conversation=null;
    if(resume&&!document.hidden&&getState().ready)conversationDispatch({type:'play'});
  }
  const session=new VoiceSession({
    Recognition,Utterance:window.SpeechSynthesisUtterance,synthesis:window.speechSynthesis,
    audioEnabled:kind=>kind==='guidance'?guidanceToggle.checked:$('voice-output').checked,
    onAudioState:({blocked,message,needsGesture=false,code})=>{
      onRuntime('speech',{phase:needsGesture?'awaiting-gesture':blocked?'error':'started',code:code||'none'});
      audioBlocked=blocked;$('voice-audio-status').hidden=!blocked;$('voice-audio-status').textContent=message;
      $('audio-details').hidden=!blocked||needsGesture;if(blocked&&!needsGesture)$('audio-diagnostic').textContent=JSON.stringify(audioDiagnostic(),null,2);onMediaState();
    },
    onMicrophoneEvent:event=>{if(['error','audio-start','audio-end','speech-start'].includes(event.type))onRuntime('microphone',{phase:event.type,code:event.code||'none',source:event.outputKind||'none'});},
    onSpeechEnd:kind=>{if(kind==='welcome'){welcomeCompleted=true;welcomeTextReady='';onMediaState();}},
    onInterrupt:()=>{ai.cancelReply?.();},
    onInputStart:beginConversation,
    onReplyEnd:finishConversation,
    onInputCancel:()=>{conversation=null;},
    onText:(text)=>{
      $('voice-transcript').textContent=text;
      answering=true;
      try{const response=respondToUtterance(text,{state:getState(),pose:conversation?.pose||getPose(),now:performance.now()});
      if(response.intent==='pause'&&conversation)conversation.resume=false;
      if(response.action){
        if(['play','repeat','restart'].includes(response.action.type)){
          if(conversation)conversation.resume=true;
          if(response.action.type!=='play'){conversationDispatch(response.action);conversationDispatch({type:'pause'});}
        }else conversationDispatch(response.action);
      }
      if(['unknown','how','tips','hello'].includes(response.intent)&&ai.ready&&typeof ai.ask==='function'){
        return ai.ask(text,getState()).then(reply=>reply||response.reply);
      }
      if(response.intent==='unknown'&&!ai.ready)return ['off','error'].includes(ai.phase)?'我在這裡。目前可以陪你練習這三個動作，也可以問我動作要領；完整對話暫時還沒準備好。':'我還在準備，先慢慢來。你可以先問今天的動作，準備好時再說開始。';
      return response.reply;}finally{answering=false;}
    },
    onReply:(text,kind)=>{$('voice-reply').textContent=text;if(kind==='guidance')guidanceStatus.textContent=`${guidanceSource==='AI'?'AI 教練 · ':''}${text}`;},
    onSpeechError:kind=>{if(kind==='guidance'){narrator?.suspend();guidanceStatus.textContent='先保留帶練文字；點「重試聲音」重播這句。';}},
    onState:({phase,message,active,inputCode})=>{
      if(phase!==voicePhase||inputCode)onRuntime('voice',{phase,code:inputCode||'none'});voicePhase=phase;
      if(inputCode){$('voice-input-error').hidden=false;$('voice-input-error').textContent=`語音輸入暫停 [${inputCode}]：${message}`;}else if(phase==='listening')$('voice-input-error').hidden=true;
      $('voice-toggle').textContent=active?'關閉聆聽':'開啟聆聽';
      $('voice-toggle').setAttribute('aria-pressed',active);
      $('voice-status').textContent=message;
      $('voice-card').dataset.phase=phase;onMediaState();
    },
    onSpeaking:(value)=>{if(value&&session.speechKind==='welcome')welcomeDelivered=true;speaking=value;speechStart=performance.now()/1000;if(!value)mouth?.setAmount(0);},
  });
  function audioDiagnostic(){return {version:APP_VERSION,userAgent:window.navigator?.userAgent||globalThis.navigator?.userAgent||'unavailable',lastAudioError:session.lastAudioError||null,lastRecognitionError:session.lastRecognitionError||null,microphone:session.microphoneDiagnostics,blocked:audioBlocked,needsGesture:Boolean(session.audioNeedsGesture),engine:session.lastAudioSnapshot||null,events:session.audioEvents||[]};}
  $('audio-copy').addEventListener('click',async()=>{
    const text=JSON.stringify(audioDiagnostic(),null,2);$('audio-diagnostic').textContent=text;
    try{await navigator.clipboard.writeText(text);$('audio-copy-status').textContent='聲音診斷已複製，可貼回對話。';}
    catch{$('audio-details').open=true;$('audio-copy-status').textContent='請長按診斷文字複製。';}
  });
  let guidanceSource='基本口令';
  aiGuidance=new AIGuidance({ai,getState,speak:(text,options)=>session.speak(text,options),enabled:()=>guidanceToggle.checked,active:()=>guidanceToggle.checked,canSpeak:()=>!conversation&&!answering&&!document.hidden&&session.speechKind!=='reply'&&session.speechKind!=='welcome'&&!welcomePreparing&&(!welcomeTextReady||welcomeCompleted||welcomeEngaged),onSource:source=>{guidanceSource=source;}});
  narrator=new CourseNarrator({speak:(text,options)=>aiGuidance.say(text,options),cancel:()=>{aiGuidance.cancel();session.cancelSpeech('guidance');},canSpeak:()=>!conversation&&!answering&&!document.hidden&&session.speechKind!=='reply'&&session.speechKind!=='welcome'&&!welcomePreparing&&(!welcomeTextReady||welcomeCompleted||welcomeEngaged),enabled:guidanceToggle.checked});
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){guidanceToggle.checked=false;guidanceToggle.disabled=true;narrator.setEnabled(false);guidanceStatus.textContent='此瀏覽器不支援聲音帶練，仍可觀看示範。';}
  function startAI(){if(['off','error'].includes(ai.phase)){cancelWelcome();if(!welcomeCompleted&&!welcomeEngaged)welcomeAttempted=false;aiGuidance.cancel({clearCache:true});void ai.enable();}}
  $('local-ai-retry').addEventListener('click',startAI);
  function cancelWelcome(){
    ++welcomeSerial;const preparing=welcomePreparing;welcomePreparing=false;welcomeTextReady='';
    if(preparing)ai.cancelReply?.();
    if(!welcomeCompleted&&!welcomeEngaged)welcomeAttempted=false;
    onMediaState();
  }
  function welcomeEligible(){return !document.hidden&&!welcomeCompleted&&!welcomeEngaged&&!getState().playing&&!conversation&&!session.inputActive&&$('voice-output').checked&&(!session.speechKind||session.speechKind==='welcome');}
  function welcome({gesture=false}={}){
    if(!welcomeEligible())return false;
    if(session.speechKind==='welcome'&&speaking)return true;
    if(welcomeTextReady){
      if(session.speechKind==='welcome'){
        if(!gesture)return true;
        session.cancelSpeech('welcome');
      }
      session.speak(welcomeTextReady,{kind:'welcome',retry:gesture});return true;
    }
    if(welcomePreparing)return false;
    if(!ai.ready||welcomeAttempted)return false;
    welcomeAttempted=true;welcomePreparing=true;const serial=++welcomeSerial;
    // Download/activation must finish before an AI-generated greeting is requested.
    Promise.resolve().then(()=>{
      if(serial!==welcomeSerial||!welcomeEligible())return null;
      return ai.greet?.(getState())||Promise.resolve(welcomeText);
    }).then(text=>{
      if(serial!==welcomeSerial)return;
      welcomePreparing=false;
      if(!welcomeEligible()||!ai.ready){onMediaState();return;}
      welcomeTextReady=String(text||welcomeText).trim().slice(0,160);
      session.speak(welcomeTextReady,{kind:'welcome'});onMediaState();
    }).catch(()=>{if(serial===welcomeSerial){welcomePreparing=false;onMediaState();}});
    onMediaState();return false;
  }
  function activateAudio(){if(session.retryAudio())return;if(!welcome({gesture:true}))session.primeAudio();}
  guidanceToggle.addEventListener('change',()=>{narrator.setEnabled(guidanceToggle.checked,getState());if(!guidanceToggle.checked)guidanceStatus.textContent='帶練語音已關閉。';});
  if(!Recognition){$('voice-toggle').disabled=true;$('voice-status').textContent='此瀏覽器不支援語音辨識，仍可使用按鈕或輸入問題。';}
  $('voice-toggle').addEventListener('click',()=>{if(session.wanted){welcomeEngaged=true;session.disableListening();}else {session.enable();activateAudio();}});
  $('voice-stop').addEventListener('click',()=>{guidanceToggle.checked=false;narrator.setEnabled(false);session.stop();guidanceStatus.textContent='帶練語音已關閉。';welcomeEngaged=true;ai.cancelReply?.();});
  $('voice-output').addEventListener('change',()=>{if(!$('voice-output').checked){session.cancelSpeech('reply');session.cancelSpeech('welcome');}else activateAudio();onMediaState();});
  for(const button of document.querySelectorAll('[data-voice-text]'))button.addEventListener('click',()=>session.acceptText(button.dataset.voiceText));
  $('voice-form').addEventListener('submit',(event)=>{event.preventDefault();const text=$('voice-input').value.trim();if(text)session.acceptText(text);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){startAI();return;}if(document.hidden){cancelWelcome();narrator.suspend();session.stop();aiGuidance.cancel({clearCache:true});ai.disable();}});
  window.addEventListener('pageshow',event=>{if(event.persisted&&!document.hidden)startAI();});
  window.addEventListener('pagehide',()=>{cancelWelcome();narrator.suspend();session.stop();aiGuidance.cancel({clearCache:true});ai.disable();});
  return {
    prepareAudio(){session.primeAudio();},
    primeAudio:activateAudio,
    welcome,
    enableAI:startAI,
    enableListening(){if(!session.wanted)session.enable();},
    get mediaStatus(){return {phase:voicePhase,active:session.wanted&&voicePhase!=='starting',outputBlocked:audioBlocked,needsGesture:Boolean(session.audioNeedsGesture),activationWelcome:session.failedSpeech?.kind==='welcome',welcomePending:welcomeEligible()&&Boolean(ai.ready||welcomePreparing||welcomeTextReady),welcoming:session.speechKind==='welcome'&&speaking,welcomePreparing,audioRetry:Boolean(session.failedSpeech)&&session.audioEnabled(session.failedSpeech.kind)&&(!session.inputActive||session.audioNeedsGesture)};},
    playbackChanged(action){
      if(!managedPlayback&&!answering&&['pause','toggle','play','seek','restart','repeat'].includes(action.type)){
        if(getState().playing){welcomeEngaged=true;cancelWelcome();}
        conversation=null;session.failedSpeech=null;session.cancelInput();session.cancelSpeech();onMediaState();
      }
      narrator.update(getState(),action);
    },
    silence(){cancelWelcome();narrator.suspend();aiGuidance.cancel();session.stop(false);onMediaState();},
    get diagnostics(){return {welcomeDelivered,welcomeCompleted,welcomePreparing,welcomeEngaged,conversationPaused:Boolean(conversation),resumeAfterReply:Boolean(conversation?.resume),localAI:ai.phase,localAIDiagnostics:ai.diagnostics||null,lastAudioError:session.lastAudioError||null,lastRecognitionError:session.lastRecognitionError||null,microphone:session.microphoneDiagnostics,audioNeedsGesture:Boolean(session.audioNeedsGesture),audioBlocked,audioEngine:session.lastAudioSnapshot||null,audioEvents:session.audioEvents||[],audioRetryAvailable:Boolean(session.failedSpeech),guidanceSource,guidanceEnabled:guidanceToggle.checked,lastCue:narrator.lastKey,speaking,kind:session.speechKind||null,listening:session.wanted,recognitionAttached:Boolean(session.recognition),bargeInMode:'transcript-echo-filter',status:$('voice-status').textContent,guidanceStatus:guidanceStatus.textContent};},
    attachModel(model){mouth=createMouthMotion(model);},
    update(now){aiGuidance.update();mouth?.setAmount(mouthAmount(speaking,now/1000-speechStart));},
  };
}
