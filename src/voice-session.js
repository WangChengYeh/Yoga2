export function recognitionMessage(code) {
  return ({ 'not-allowed':'未取得麥克風權限，請在瀏覽器允許，或使用下方按鈕。', 'service-not-allowed':'瀏覽器未允許語音服務，請使用下方按鈕。', network:'語音服務連線失敗，請重試或使用下方按鈕。', 'audio-capture':'找不到可用麥克風，請確認其他 App 沒有占用。', 'language-not-supported':'這個瀏覽器暫不支援中文辨識，請使用下方按鈕。' })[code] || '語音聆聽已停止，請再按一次開啟，或使用下方按鈕。';
}

export class VoiceSession {
  constructor({ Recognition, Utterance, synthesis, onText = () => '', onState = () => {}, onReply = () => {}, onSpeaking = () => {}, onSpeechError = () => {}, onInputStart = () => {}, onReplyEnd = () => {}, onInputCancel = () => {}, onAudioState = () => {}, onSpeechEnd = () => {}, onInterrupt = () => {}, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), audioEnabled = () => true }) {
    Object.assign(this,{ Recognition, Utterance, synthesis, onText, onState, onReply, onSpeaking, onSpeechError, onInputStart, onReplyEnd, onInputCancel, onAudioState, onSpeechEnd, onInterrupt, setTimer, clearTimer, audioEnabled });
    this.wanted = false; this.epoch = 0; this.recognition = null; this.utterance = null; this.speaking = false; this.emptyTurns = 0;
    this.timers = new Set();
  }
  cancelPrimer(){
    if(this.primerTimer){this.cancelTimer(this.primerTimer);this.primerTimer=null;}
    const primer=this.primer;this.primer=null;
    if(primer){primer.onstart=primer.onend=primer.onerror=null;if(!this.utterance)try{this.synthesis?.cancel();}catch{/* already stopped */}}
  }
  primeAudio(){
    if((!this.audioEnabled('reply')&&!this.audioEnabled('guidance'))||!this.synthesis||!this.Utterance)return;
    try{this.synthesis.resume?.();}catch{/* retry speak still reports its own error */}
    if(this.utterance||this.primer||this.audioPrimed&&!this.audioBlocked)return;
    try{
      this.audioBlocked=false;const primer=new this.Utterance('準備好了');primer.lang='zh-TW';primer.volume=0;this.primer=primer;
      primer.onstart=()=>{if(this.primer===primer){if(this.primerTimer)this.cancelTimer(this.primerTimer);this.primerTimer=null;this.audioPrimed=true;this.audioBlocked=false;this.onAudioState({blocked:false,message:'語音播放已準備好。'});}};
      primer.onend=()=>{if(this.primer===primer){if(this.primerTimer)this.cancelTimer(this.primerTimer);this.primerTimer=null;this.primer=null;this.audioPrimed=true;this.audioBlocked=false;this.onAudioState({blocked:false,message:'語音播放已準備好。'});}};
      primer.onerror=event=>{if(this.primer===primer){if(this.primerTimer)this.cancelTimer(this.primerTimer);this.primerTimer=null;this.primer=null;this.audioFailure(event?.error||'prime-failed');}};
      this.primerTimer=this.timer(()=>{if(this.primer===primer){this.cancelPrimer();this.audioFailure('prime-timeout');}},10000);
      this.synthesis.speak(primer);
    }catch(error){this.cancelPrimer();this.audioFailure(error.name||'prime-failed');}
  }
  audioFailure(code){
    this.audioBlocked=true;this.audioPrimed=false;this.lastAudioError=code;
    const reason=code==='not-allowed'?'瀏覽器尚未允許發聲':code==='start-timeout'?'語音在 10 秒內沒有開始':code==='playback-timeout'?'語音播放超過 60 秒仍未結束':`瀏覽器回報 ${code}`;
    const message=`語音播放未完成 [${code}]：${reason}。文字已保留；請點「啟用相機與語音」後重試。`;
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
  beginInput(){if(!this.inputActive){this.inputActive=true;this.onInputStart();}}
  finishInput(reason){if(this.inputActive){this.inputActive=false;this.onReplyEnd({reason});}}
  cancelInput(){if(this.inputActive){this.inputActive=false;this.onInputCancel();}}
  emit(phase,message) { this.onState({phase,message,active:this.wanted}); }
  timer(fn,ms) { const id=this.setTimer(()=>{this.timers.delete(id);fn();},ms);this.timers.add(id);return id; }
  cancelTimer(id) { this.clearTimer(id);this.timers.delete(id); }
  detachRecognition() {
    const recognition=this.recognition;this.recognition=null;
    if(recognition){recognition.onspeechstart=null;recognition.onresult=null;recognition.onend=null;recognition.onerror=null;recognition.onstart=null;try{recognition.abort();}catch{/* already ended */}}
    if(this.listenTimer){this.cancelTimer(this.listenTimer);this.listenTimer=null;}
  }
  enable() {
    this.stop(false);
    if(!this.Recognition){this.emit('unsupported','這個瀏覽器不支援語音辨識，可用下方按鈕或文字問答。');return;}
    this.wanted=true;this.emptyTurns=0;this.listen();
  }
  stop(announce=true) {
    ++this.epoch;this.wanted=false;this.cancelInput();this.cancelPrimer();
    for(const id of this.timers)this.clearTimer(id);this.timers.clear();
    this.speechTimer=null;this.echoTimer=null;this.echoText='';
    this.detachRecognition();
    const utterance=this.utterance;this.utterance=null;
    if(utterance){utterance.onstart=null;utterance.onend=null;utterance.onerror=null;this.synthesis?.cancel();}
    this.speaking=false;this.speechKind=null;this.onSpeaking(false);
    if(announce)this.emit('off','語音已關閉。觸控與文字問答仍可使用。');
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
    try{recognition=new this.Recognition();}catch{this.stop(false);this.emit('error','瀏覽器無法建立語音辨識，請使用按鈕或文字問答。');return;}
    this.recognition=recognition;
    recognition.lang='zh-TW';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
    const current=()=>token===this.epoch&&this.recognition===recognition&&this.wanted;
    const empty=()=>{
      if(!current())return;
      this.detachRecognition();
      if(this.utterance||this.speechKind==='reply'){this.scheduleListen();return;}
      if(this.inputActive){this.speak('我沒有聽清楚，請再說一次。');this.scheduleListen();return;}
      this.emptyTurns++;
      this.emit('waiting','仍在聆聽，隨時可以說話。');this.scheduleListen();
    };
    recognition.onstart=()=>{if(current()){if(this.listenTimer)this.cancelTimer(this.listenTimer);this.listenTimer=null;this.emit('listening','正在聽，請說一句指令或課程問題。');}};
    recognition.onspeechstart=()=>{if(current()&&!this.utterance&&!this.echoText)this.interruptForInput();};
    recognition.onend=empty;
    recognition.onerror=(event)=>{
      if(!current())return;
      if(event.error==='no-speech'||event.error==='aborted'){empty();return;}
      this.stop(false);this.emit('error',recognitionMessage(event.error));
    };
    recognition.onresult=(event)=>{
      if(!current())return;
      const results=event.results;
      for(let index=event.resultIndex||0;index<results.length;index++){
        const result=results[index],alternative=result?.[0],text=String(alternative?.transcript||'').trim();
        if(!text||finals.has(index))continue;
        if(this.isEcho(text)){if(result.isFinal)finals.add(index);continue;}
        if(alternative.confidence>0&&alternative.confidence<.55){
          if(result.isFinal){finals.add(index);if(!this.utterance&&!this.speechKind){this.interruptForInput();this.speak('我沒有聽清楚，請再說一次。');}}
          continue;
        }
        this.interruptForInput();
        if(!result.isFinal)continue;
        finals.add(index);this.emptyTurns=0;this.acceptText(text);
      }
    };
    this.emit('starting','正在開啟語音，請允許瀏覽器使用麥克風。');
    try{
      this.listenTimer=this.timer(()=>{if(current()){this.stop(false);this.emit('error','語音辨識在 12 秒內未啟動，請點擊重新啟用。');}},12000);
      recognition.start();
    }catch{this.stop(false);this.emit('error','瀏覽器無法啟動聆聽，請再點一次，或使用下方按鈕。');}
  }
  acceptText(text) {
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
    if(this.speechTimer){this.cancelTimer(this.speechTimer);this.speechTimer=null;}
    const utterance=this.utterance;this.utterance=null;const cancelledKind=this.speechKind;this.speechKind=null;
    if(cancelledKind==='reply'&&!preserveInput)this.cancelInput();
    utterance.onstart=utterance.onend=utterance.onerror=null;this.expireEcho();
    try{this.synthesis?.cancel();}catch{/* Already stopped by the browser. */}
    this.speaking=false;this.onSpeaking(false);this.scheduleListen();return true;
  }
  speak(text,{kind='reply',rate=.95,retry=false}={}) {
    this.cancelPrimer();
    if(retry)this.audioBlocked=false;
    if(kind==='guidance'&&this.utterance&&this.speechKind==='reply')return false;
    if(this.speechTimer){this.cancelTimer(this.speechTimer);this.speechTimer=null;}
    if(this.utterance){this.utterance.onend=null;this.utterance.onerror=null;this.utterance.onstart=null;this.utterance=null;this.synthesis?.cancel();}
    this.speaking=false;this.onSpeaking(false);
    this.speechKind=kind;this.onReply(text,kind);
    if(this.audioBlocked||!this.audioEnabled(kind)||!this.synthesis||!this.Utterance){this.speechKind=null;this.emit('text','已顯示文字回覆。');if(kind==='reply')this.finishInput('text');this.scheduleListen();return;}
    const token=this.epoch,utterance=new this.Utterance(String(text));this.utterance=utterance;this.rememberSpeech(text);
    utterance.lang='zh-TW';utterance.rate=Math.max(.8,Math.min(1.25,rate));
    const voices=this.synthesis.getVoices?.()||[];
    utterance.voice=voices.find((voice)=>voice.lang==='zh-TW'&&voice.localService)||voices.find((voice)=>voice.lang?.startsWith('zh')&&voice.localService)||voices.find((voice)=>voice.lang==='zh-TW')||voices.find((voice)=>voice.lang?.startsWith('zh'))||null;
    const current=()=>token===this.epoch&&this.utterance===utterance;
    const fail=code=>{
      if(!current())return;const failedKind=this.speechKind;
      this.cancelSpeech(failedKind);const message=this.audioFailure(code);
      this.onSpeechError(failedKind,{code,message});this.emit('error',message);
    };
    let watchdog=this.timer(()=>fail('start-timeout'),10000);this.speechTimer=watchdog;
    utterance.onstart=()=>{
      if(!current())return;
      this.cancelTimer(watchdog);watchdog=this.timer(()=>fail('playback-timeout'),60000);this.speechTimer=watchdog;
      this.audioBlocked=false;this.audioPrimed=true;this.onAudioState({blocked:false,message:'語音播放已準備好。'});
      this.speaking=true;this.onSpeaking(true);this.emit('speaking','教練回話中，仍在聆聽，可直接說話打斷。');
    };
    utterance.onend=()=>{
      if(!current())return;
      this.cancelTimer(watchdog);this.speechTimer=null;this.utterance=null;this.speechKind=null;this.speaking=false;this.onSpeaking(false);
      this.expireEcho();this.onSpeechEnd(kind);this.emit('waiting','教練回覆完畢，仍在聆聽。');if(kind==='reply')this.finishInput('ended');this.scheduleListen();
    };
    utterance.onerror=event=>fail(event?.error||'synthesis-error');
    this.listen();this.emit('replying','正在準備教練回覆，仍可說話打斷。');
    if(!current())return;
    try{this.synthesis.resume?.();this.synthesis.speak(utterance);}catch(error){fail(error.name||'speak-error');}
  }
}
