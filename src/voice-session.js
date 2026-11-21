export function recognitionMessage(code) {
  return ({ 'not-allowed':'未取得麥克風權限，請在瀏覽器允許，或使用下方按鈕。', 'service-not-allowed':'瀏覽器未允許語音服務，請使用下方按鈕。', network:'語音服務連線失敗，請重試或使用下方按鈕。', 'audio-capture':'找不到可用麥克風，請確認其他 App 沒有占用。', 'language-not-supported':'這個瀏覽器暫不支援中文辨識，請使用下方按鈕。' })[code] || '語音聆聽已停止，請再按一次開啟，或使用下方按鈕。';
}

export class VoiceSession {
  constructor({ Recognition, Utterance, synthesis, onText = () => '', onState = () => {}, onReply = () => {}, onSpeaking = () => {}, onSpeechError = () => {}, onInputStart = () => {}, onReplyEnd = () => {}, onInputCancel = () => {}, onAudioState = () => {}, onSpeechEnd = () => {}, onMicrophoneEvent = () => {}, onInterrupt = () => {}, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), audioEnabled = () => true, getActivation = () => globalThis.navigator?.userActivation, refreshRecognitionAfterSpeech = false }) {
    Object.assign(this,{ Recognition, Utterance, synthesis, onText, onState, onReply, onSpeaking, onSpeechError, onInputStart, onReplyEnd, onInputCancel, onAudioState, onSpeechEnd, onMicrophoneEvent, onInterrupt, setTimer, clearTimer, audioEnabled, getActivation, refreshRecognitionAfterSpeech });
    this.wanted = false; this.epoch = 0; this.recognition = null; this.utterance = null; this.speaking = false; this.emptyTurns = 0;
    this.timers = new Set();this.inputHistory=[];this.inputLastEvents={};this.inputPhase='off';this.inputObserved={audioActive:null,soundActive:null,speechActive:null};this.inputCounts={starts:0,audioStarts:0,soundStarts:0,speechStarts:0,resultEvents:0,acceptedFinals:0,echoResults:0,manualInputs:0,noMatches:0,errors:0,reconnects:0};
  }
  inputEvent(type,{native=false,code,final}={}){
    const derived=['echo-result','accepted-final'].includes(type),at=new Date().toISOString(),entry={at,type,origin:derived?'recognition-result':native?'browser-event':'controller',outputKind:this.speechKind||null,whileSpeaking:this.speaking};
    if(code)entry.code=code;if(typeof final==='boolean')entry.final=final;
    if(native&&!derived)this.lastNativeInputAt=at;this.inputLastEvents[type]=at;
    const counter={started:'starts','audio-start':'audioStarts','sound-start':'soundStarts','speech-start':'speechStarts',result:'resultEvents','accepted-final':'acceptedFinals','echo-result':'echoResults','manual-input':'manualInputs','no-match':'noMatches',error:'errors',reconnect:'reconnects'}[type];if(counter)this.inputCounts[counter]++;
    if(type==='audio-start')this.inputObserved.audioActive=true;
    if(type==='audio-end')this.inputObserved.audioActive=false;
    if(type==='sound-start')this.inputObserved.soundActive=true;
    if(type==='sound-end')this.inputObserved.soundActive=false;
    if(type==='speech-start')this.inputObserved.speechActive=true;
    if(type==='speech-end')this.inputObserved.speechActive=false;
    if(type==='ended')this.inputObserved={audioActive:false,soundActive:false,speechActive:false};
    if(['detached','disabled','stopped','error'].includes(type))this.inputObserved={audioActive:null,soundActive:null,speechActive:null};
    if(['starting','started','audio-start','audio-end','sound-start','sound-end','speech-start','speech-end','detached','ended','disabled','stopped','error'].includes(type))this.inputPhase=type;
    this.inputHistory=this.inputHistory.concat(entry).slice(-24);this.onMicrophoneEvent(entry);
  }
  get microphoneDiagnostics(){return {wanted:this.wanted,recognitionAttached:Boolean(this.recognition),phase:this.inputPhase,observed:{...this.inputObserved},counts:{...this.inputCounts},eventHandlersExposed:this.inputCapabilities||null,lastNativeEventAt:this.lastNativeInputAt||null,lastEvents:{...this.inputLastEvents},lastError:this.lastRecognitionError||null,history:this.inputHistory.map(e=>({...e})),note:'Recognition events only; no microphone waveform, level meter, recording or transcript. Missing events do not prove silence or a working microphone.'};}
  primeAudio(){
    // A zero-volume utterance is not proof of audible readiness and can occupy
    // the native queue. Only warm the voice list/resume; real speech confirms start.
    if((!this.audioEnabled('reply')&&!this.audioEnabled('guidance'))||!this.synthesis||!this.Utterance)return;
    try{this.synthesis.getVoices?.();if(this.synthesis.paused)this.synthesis.resume?.();}catch{/* Real speech reports errors. */}
  }
  audioSnapshot(event,utterance=this.utterance){
    let voices=[];try{voices=this.synthesis?.getVoices?.()||[];}catch{/* diagnostics must not throw */}
    const activation=this.getActivation();
    const snapshot={event,at:new Date().toISOString(),userActivation:activation?{active:Boolean(activation.isActive),hasBeenActive:Boolean(activation.hasBeenActive)}:null,requestedVoiceLanguage:utterance?.voice?.lang||null,language:utterance?.lang||null,paused:Boolean(this.synthesis?.paused),speaking:Boolean(this.synthesis?.speaking),pending:Boolean(this.synthesis?.pending),voiceCount:voices.length,voiceMode:this.systemVoice?'system-default':'preferred-local',recognitionAttached:Boolean(this.recognition),wanted:this.wanted,kind:this.speechKind||null,characters:String(utterance?.text||'').length};
    this.audioEvents=(this.audioEvents||[]).concat(snapshot).slice(-12);return snapshot;
  }
  retryAudio(){
    if(this.utterance)return Boolean(this.failedSpeech);
    if(!this.failedSpeech||(this.inputActive&&!this.audioNeedsGesture)||!this.audioEnabled(this.failedSpeech.kind))return false;
    const failed=this.failedSpeech;this.audioSnapshot('manual-retry');
    this.speak(failed.text,{kind:failed.kind,rate:failed.rate,retry:true});return true;
  }
  audioFailure(code){
    this.audioBlocked=true;this.audioPrimed=false;this.lastAudioError=code;
    const reason=code==='not-allowed'?'瀏覽器尚未允許發聲':code==='start-timeout'?'10 秒內未收到開始播放事件；尚不能確定是播放限制、語音佇列或裝置音訊問題':code==='playback-timeout'?'語音播放超過 60 秒仍未結束':`瀏覽器回報 ${code}`;
    const message=`語音播放未完成 [${code}]：${reason}。文字已保留；請點「重試聲音」重播這句。`;
    this.onAudioState({blocked:true,code,message});return message;
  }
  rememberSpeech(text){
    if(this.echoTimer)this.cancelTimer(this.echoTimer);
    this.echoTimer=null;this.echoText=String(text).replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  }
  expireEcho(){
    if(this.echoTimer)this.cancelTimer(this.echoTimer);
    this.echoTimer=this.timer(()=>{this.echoText='';this.echoTimer=null;},1200);
  }
  isEcho(text){
    const value=String(text).replace(/[^\p{L}\p{N}]/gu,'').toLowerCase(),spoken=this.echoText;
    // Text-only echo filtering is conservative: do not discard a distinct short command.
    const command=/^(暫停|停|停止|等一下|繼續|再一次|慢一點)$/.test(value);
    return Boolean(value&&spoken&&(value===spoken||!command&&value.length>=2&&(spoken.includes(value)||value.includes(spoken))));
  }
  interruptForInput(){
    if(this.utterance||this.speechKind==='reply'){
      this.cancelSpeech(undefined,{preserveInput:true});this.onInterrupt();
    }
    this.beginInput();
  }
  beginInput(){this.failedSpeech=null;if(!this.inputActive){this.inputActive=true;this.onInputStart();}}
  finishInput(reason){if(this.inputActive){this.inputActive=false;this.onReplyEnd({reason});}}
  cancelInput(){if(this.inputActive){this.inputActive=false;this.onInputCancel();}}
  emit(phase,message) { this.onState({phase,message,active:this.wanted}); }
  timer(fn,ms) { const id=this.setTimer(()=>{this.timers.delete(id);fn();},ms);this.timers.add(id);return id; }
  cancelTimer(id) { this.clearTimer(id);this.timers.delete(id); }
  detachRecognition() {
    const recognition=this.recognition;this.recognition=null;
    if(recognition){recognition.onaudiostart=recognition.onaudioend=recognition.onsoundstart=recognition.onsoundend=recognition.onspeechend=recognition.onnomatch=null;recognition.onspeechstart=null;recognition.onresult=null;recognition.onend=null;recognition.onerror=null;recognition.onstart=null;try{recognition.abort();}catch{/* already ended */}this.inputEvent('detached');}
    if(this.listenTimer){this.cancelTimer(this.listenTimer);this.listenTimer=null;}
  }
  enable() {
    if(this.wanted&&this.recognition)return;
    this.detachRecognition();
    if(!this.Recognition){this.wanted=false;this.emit('unsupported','這個瀏覽器不支援語音辨識，可用下方按鈕或文字問答。');return;}
    this.wanted=true;this.emptyTurns=0;this.listen();
  }
  disableListening(announce=true){
    this.wanted=false;this.detachRecognition();this.cancelInput();this.inputEvent('disabled');
    if(announce)this.emit('off','聆聽已關閉；教練仍可發聲。');
  }
  failListening(code,message,native=false){
    this.lastRecognitionError={code,at:new Date().toISOString()};
    this.disableListening(false);this.inputEvent('error',{native,code});this.onState({phase:'error',message,active:false,inputCode:code});
  }
  stop(announce=true) {
    ++this.epoch;this.wanted=false;this.cancelInput();
    for(const id of this.timers)this.clearTimer(id);this.timers.clear();
    this.speechTimer=null;this.echoTimer=null;this.echoText='';this.failedSpeech=null;
    this.detachRecognition();
    const utterance=this.utterance;this.utterance=null;
    if(utterance){utterance.onstart=null;utterance.onend=null;utterance.onerror=null;this.synthesis?.cancel();}
    this.speaking=false;this.speechKind=null;this.onSpeaking(false);this.inputEvent('stopped');
    if(announce)this.emit('off','語音已關閉。觸控與文字問答仍可使用。');
  }
  refreshListeningAfterOutput(kind) {
    // Some native continuous recognizers stop producing callbacks after TTS,
    // without firing onend/error. Rotate the input session at turn boundaries.
    // Never suspend input during speech or reopen input the user switched off.
    if(!this.refreshRecognitionAfterSpeech||!['welcome','reply'].includes(kind)||!this.wanted||!this.recognition||this.utterance)return;
    this.inputEvent('reconnect',{code:'output-ended'});
    this.detachRecognition();this.listen();
  }
  scheduleListen() {
    if(this.recognition)return;
    const token=this.epoch;
    if(this.wanted)this.timer(()=>{if(token===this.epoch&&this.wanted)this.listen();},150);
    else this.emit('off','可以再開啟語音，或使用下方按鈕。');
  }
  listen() {
    if(!this.wanted||this.recognition)return;
    const token=this.epoch;let recognition;const finals=new Set();
    try{recognition=new this.Recognition();}catch{this.failListening('recognition-create-error','瀏覽器無法建立語音辨識；教練仍可發聲，可使用文字問答。');return;}
    this.recognition=recognition;this.inputObserved={audioActive:null,soundActive:null,speechActive:null};this.inputCapabilities=Object.fromEntries(['onaudiostart','onaudioend','onsoundstart','onsoundend','onspeechstart','onspeechend','onnomatch','onresult'].map(key=>[key,key in recognition]));
    recognition.lang='zh-TW';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
    const current=()=>token===this.epoch&&this.recognition===recognition&&this.wanted;
    const empty=(ended=true)=>{
      if(!current())return;
      if(ended)this.inputEvent('ended',{native:true});this.detachRecognition();
      if(this.utterance||this.speechKind==='reply'){this.scheduleListen();return;}
      if(this.inputActive){this.speak('我沒有聽清楚，請再說一次。');this.scheduleListen();return;}
      this.emptyTurns++;
      this.emit('waiting','仍在聆聽，隨時可以說話。');this.scheduleListen();
    };
    recognition.onstart=()=>{if(current()){this.inputEvent('started',{native:true});if(this.lastRecognitionError)this.lastRecognitionError={...this.lastRecognitionError,recoveredAt:new Date().toISOString()};if(this.listenTimer)this.cancelTimer(this.listenTimer);this.listenTimer=null;this.emit('listening','正在聽，請說一句指令或課程問題。');}};
    recognition.onspeechstart=()=>{if(!current())return;this.inputEvent('speech-start',{native:true});if(!this.utterance&&!this.echoText)this.interruptForInput();};
    for(const [handler,type] of Object.entries({onaudiostart:'audio-start',onaudioend:'audio-end',onsoundstart:'sound-start',onsoundend:'sound-end',onspeechend:'speech-end',onnomatch:'no-match'}))recognition[handler]=()=>{if(current())this.inputEvent(type,{native:true});};
    recognition.onend=()=>empty(true);
    recognition.onerror=(event)=>{
      if(!current())return;
      if(event.error==='no-speech'||event.error==='aborted'){this.inputEvent('error',{native:true,code:event.error});empty(false);return;}
      this.failListening(event.error||'recognition-error',recognitionMessage(event.error),true);
    };
    recognition.onresult=(event)=>{
      if(!current())return;
      const results=event.results;this.inputEvent('result',{native:true,final:Array.from(results).slice(event.resultIndex||0).some(result=>result.isFinal)});
      for(let index=event.resultIndex||0;index<results.length;index++){
        const result=results[index],alternative=result?.[0],text=String(alternative?.transcript||'').trim();
        if(!text||finals.has(index))continue;
        if(this.isEcho(text)){this.inputEvent('echo-result',{native:true,final:Boolean(result.isFinal)});if(result.isFinal)finals.add(index);continue;}
        if(alternative.confidence>0&&alternative.confidence<.55){
          if(result.isFinal){finals.add(index);if(!this.utterance&&!this.speechKind){this.interruptForInput();this.speak('我沒有聽清楚，請再說一次。');}}
          continue;
        }
        this.interruptForInput();
        if(!result.isFinal)continue;
        finals.add(index);this.emptyTurns=0;this.inputEvent('accepted-final',{native:true});this.acceptText(text,{source:'recognition'});
      }
    };
    this.inputEvent('starting');this.emit('starting','正在開啟語音，請允許瀏覽器使用麥克風。');
    try{
      this.listenTimer=this.timer(()=>{if(current()){this.failListening('recognition-start-timeout','語音辨識在 12 秒內未啟動，請點擊重新啟用；教練仍可發聲。');}},12000);
      recognition.start();
    }catch{this.failListening('recognition-start-error','瀏覽器無法啟動聆聽，請再點一次；教練仍可發聲。');}
  }
  acceptText(text,{source='manual'}={}) {
    if(source!=='recognition')this.inputEvent('manual-input');
    this.cancelSpeech(undefined,{preserveInput:true});
    this.onInterrupt();
    this.beginInput();
    const turn=this.turn=(this.turn||0)+1,epoch=this.epoch;
    let reply;
    try{reply=this.onText(String(text).slice(0,300));}
    catch{reply='暫時無法處理這句話，請使用觸控操作。';}
    if(reply&&typeof reply.then==='function'){
      this.speechKind='reply';this.emit('thinking','正在準備 AI 回覆，仍可說話打斷。');this.listen();
      Promise.resolve(reply).then(text=>{
        if(this.epoch===epoch&&this.turn===turn)this.speak(text||'AI 暫時無法回覆，請使用基本指令。');
      },()=>{if(this.epoch===epoch&&this.turn===turn)this.speak('AI 暫時無法回覆，請使用基本指令。');});
    }else this.speak(reply);
  }
  cancelSpeech(kind,{preserveInput=false}={}) {
    if(!this.utterance){if(this.speechKind==='reply'&&(!kind||kind==='reply')){++this.turn;this.speechKind=null;if(!preserveInput)this.cancelInput();this.scheduleListen();return true;}return false;}
    if(kind&&this.speechKind!==kind)return false;
    if(this.failedSpeech&&(!kind||this.failedSpeech.kind===kind))this.failedSpeech=null;
    if(this.speechTimer){this.cancelTimer(this.speechTimer);this.speechTimer=null;}
    const utterance=this.utterance;this.utterance=null;const cancelledKind=this.speechKind;this.speechKind=null;
    if(cancelledKind==='reply'&&!preserveInput)this.cancelInput();
    utterance.onstart=utterance.onend=utterance.onerror=null;this.expireEcho();
    try{this.synthesis?.cancel();}catch{/* Already stopped by the browser. */}
    this.speaking=false;this.onSpeaking(false);this.scheduleListen();return true;
  }
  speak(text,{kind='reply',rate=.95,retry=false}={}) {
    if(retry){this.audioBlocked=false;if(this.audioNeedsGesture||this.lastAudioError==='start-timeout')this.systemVoice=true;this.audioNeedsGesture=false;}
    if(kind==='guidance'&&this.utterance&&this.speechKind==='reply')return false;
    if(this.speechTimer){this.cancelTimer(this.speechTimer);this.speechTimer=null;}
    if(this.utterance){this.utterance.onend=null;this.utterance.onerror=null;this.utterance.onstart=null;this.utterance=null;this.synthesis?.cancel();}
    this.speaking=false;this.onSpeaking(false);
    this.speechKind=kind;this.onReply(text,kind);
    if(this.audioBlocked||!this.audioEnabled(kind)||!this.synthesis||!this.Utterance){
      if(this.audioBlocked&&this.audioEnabled(kind))this.failedSpeech={text:String(text),kind,rate};
      this.speechKind=null;if(kind==='reply')this.finishInput('text');this.emit('text','已顯示文字回覆。');this.scheduleListen();return;
    }
    const activation=this.getActivation();
    if(!retry&&activation?.hasBeenActive===false){
      this.failedSpeech={text:String(text),kind,rate};this.audioBlocked=true;this.audioNeedsGesture=true;this.speechKind=null;
      this.audioSnapshot('awaiting-gesture');
      const message=kind==='welcome'?'Luna 已準備好，點「和 Luna 打招呼」就能開始說話。':'點「開啟聲音」就能播放教練的回覆。';
      this.onAudioState({blocked:true,needsGesture:true,code:'activation-required',message});this.emit('awaiting-gesture',message);return;
    }
    const token=this.epoch,utterance=new this.Utterance(String(text));this.utterance=utterance;this.rememberSpeech(text);
    utterance.lang='zh-TW';utterance.rate=Math.max(.8,Math.min(1.25,rate));
    let voices=[];try{voices=this.synthesis.getVoices?.()||[];}catch{/* Let the browser choose its default voice. */}
    utterance.volume=1;utterance.pitch=1;
    utterance.voice=this.systemVoice?null:voices.find((voice)=>voice.lang==='zh-TW'&&voice.localService)||voices.find((voice)=>voice.lang?.startsWith('zh')&&voice.localService)||voices.find((voice)=>voice.lang==='zh-TW')||voices.find((voice)=>voice.lang?.startsWith('zh'))||null;
    const current=()=>token===this.epoch&&this.utterance===utterance;
    const fail=code=>{
      if(!current())return;const failedKind=this.speechKind;
      this.lastAudioSnapshot=this.audioSnapshot(code,utterance);
      const failed={text:String(text),kind:failedKind,rate};
      this.cancelSpeech(failedKind);this.failedSpeech=failed;const message=this.audioFailure(code);
      this.onSpeechError(failedKind,{code,message});this.emit('error',message);
    };
    let watchdog=this.timer(()=>fail('start-timeout'),10000);this.speechTimer=watchdog;
    utterance.onstart=()=>{
      if(!current())return;
      this.cancelTimer(watchdog);watchdog=this.timer(()=>fail('playback-timeout'),60000);this.speechTimer=watchdog;
      this.failedSpeech=null;this.audioBlocked=false;this.audioPrimed=true;this.onAudioState({blocked:false,message:'語音播放已準備好。'});
      this.audioSnapshot('started',utterance);this.speaking=true;this.onSpeaking(true);this.emit('speaking',this.wanted?'教練回話中，仍在聆聽，可直接說話打斷。':'教練回話中；語音輸入未啟用，可用文字互動。');
    };
    utterance.onend=()=>{
      if(!current())return;
      this.cancelTimer(watchdog);this.speechTimer=null;this.utterance=null;this.speechKind=null;this.speaking=false;this.onSpeaking(false);
      this.audioSnapshot('ended',utterance);this.expireEcho();this.onSpeechEnd(kind);this.emit('waiting','教練回覆完畢，仍在聆聽。');this.refreshListeningAfterOutput(kind);if(kind==='reply')this.finishInput('ended');if(this.wanted)this.scheduleListen();
    };
    utterance.onerror=event=>fail(event?.error||'synthesis-error');
    this.listen();this.emit('replying',this.wanted?'正在準備教練回覆，仍可說話打斷。':'正在準備教練回覆；可用文字互動。');
    if(!current())return;
    try{
      // A previous native utterance may have lost its end event. Clear only an
      // orphan queue, keeping the microphone attached and no synthetic primer.
      if(this.synthesis.pending||this.synthesis.speaking){this.audioSnapshot('reset-orphan-queue',utterance);this.synthesis.cancel();}
      this.synthesis.resume?.();this.audioSnapshot('speak-request',utterance);this.synthesis.speak(utterance);}catch(error){fail(error.name||'speak-error');}
  }
}
