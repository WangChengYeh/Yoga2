export function recognitionMessage(code) {
  return ({ 'not-allowed':'未取得麥克風權限，請在瀏覽器允許，或使用下方按鈕。', 'service-not-allowed':'瀏覽器未允許語音服務，請使用下方按鈕。', network:'語音服務連線失敗，請重試或使用下方按鈕。', 'audio-capture':'找不到可用麥克風，請確認其他 App 沒有占用。', 'language-not-supported':'這個瀏覽器暫不支援中文辨識，請使用下方按鈕。' })[code] || '語音聆聽已停止，請再按一次開啟，或使用下方按鈕。';
}

export class VoiceSession {
  constructor({ Recognition, Utterance, synthesis, onText = () => '', onState = () => {}, onReply = () => {}, onSpeaking = () => {}, onSpeechError = () => {}, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), audioEnabled = () => true }) {
    Object.assign(this,{ Recognition, Utterance, synthesis, onText, onState, onReply, onSpeaking, onSpeechError, setTimer, clearTimer, audioEnabled });
    this.wanted = false; this.epoch = 0; this.recognition = null; this.utterance = null; this.speaking = false; this.emptyTurns = 0;
    this.timers = new Set();
  }
  emit(phase,message) { this.onState({phase,message,active:this.wanted}); }
  timer(fn,ms) { const id=this.setTimer(()=>{this.timers.delete(id);fn();},ms);this.timers.add(id);return id; }
  cancelTimer(id) { this.clearTimer(id);this.timers.delete(id); }
  detachRecognition() {
    const recognition=this.recognition;this.recognition=null;
    if(recognition){recognition.onresult=null;recognition.onend=null;recognition.onerror=null;recognition.onstart=null;try{recognition.abort();}catch{/* already ended */}}
    if(this.listenTimer){this.cancelTimer(this.listenTimer);this.listenTimer=null;}
  }
  enable() {
    this.stop(false);
    if(!this.Recognition){this.emit('unsupported','這個瀏覽器不支援語音辨識，可用下方按鈕或文字問答。');return;}
    this.wanted=true;this.emptyTurns=0;this.listen();
  }
  stop(announce=true) {
    ++this.epoch;this.wanted=false;
    for(const id of this.timers)this.clearTimer(id);this.timers.clear();
    this.speechTimer=null;
    this.detachRecognition();
    const utterance=this.utterance;this.utterance=null;
    if(utterance){utterance.onstart=null;utterance.onend=null;utterance.onerror=null;this.synthesis?.cancel();}
    this.speaking=false;this.speechKind=null;this.onSpeaking(false);
    if(announce)this.emit('off','語音已關閉。觸控與文字問答仍可使用。');
  }
  scheduleListen() {
    const token=this.epoch;
    if(this.wanted)this.timer(()=>{if(token===this.epoch&&this.wanted&&!this.utterance)this.listen();},800);
    else this.emit('off','可以再開啟語音，或使用下方按鈕。');
  }
  listen() {
    if(!this.wanted||this.utterance||this.recognition)return;
    const token=this.epoch;let recognition;
    try{recognition=new this.Recognition();}catch{this.stop(false);this.emit('error','瀏覽器無法建立語音辨識，請使用按鈕或文字問答。');return;}
    this.recognition=recognition;
    recognition.lang='zh-TW';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
    const current=()=>token===this.epoch&&this.recognition===recognition&&this.wanted&&!this.utterance;
    const empty=()=>{
      if(!current())return;
      this.detachRecognition();this.emptyTurns++;
      if(this.emptyTurns>=3){this.stop(false);this.emit('error','連續幾次沒聽到，已停止聆聽。想說話時再開啟。');}
      else{this.emit('waiting','沒聽清楚，請再說一次。');this.scheduleListen();}
    };
    recognition.onstart=()=>{if(current())this.emit('listening','正在聽，請說一句指令或課程問題。');};
    recognition.onend=empty;
    recognition.onerror=(event)=>{
      if(!current())return;
      if(event.error==='no-speech'){empty();return;}
      this.stop(false);this.emit('error',recognitionMessage(event.error));
    };
    recognition.onresult=(event)=>{
      if(!current())return;
      const results=event.results;
      let alternative;
      for(let index=event.resultIndex||0;index<results.length;index++){if(results[index].isFinal){alternative=results[index][0];break;}}
      if(!alternative)return;
      this.detachRecognition();this.emptyTurns=0;
      const text=String(alternative.transcript||'').trim();
      // Safari may report zero when confidence is not supplied.
      if(!text||(alternative.confidence>0&&alternative.confidence<.55)){this.speak('我沒有聽清楚，請再說一次。');return;}
      this.acceptText(text);
    };
    this.emit('starting','正在開啟語音，請允許瀏覽器使用麥克風。');
    try{
      recognition.start();
      this.listenTimer=this.timer(()=>{if(current())empty();},12000);
    }catch{this.stop(false);this.emit('error','瀏覽器無法啟動聆聽，請再點一次，或使用下方按鈕。');}
  }
  acceptText(text) {
    this.detachRecognition();
    let reply;
    try{reply=this.onText(String(text).slice(0,300));}
    catch{reply='暫時無法處理這句話，請使用觸控操作。';}
    this.speak(reply);
  }
  cancelSpeech(kind) {
    if(!this.utterance||(kind&&this.speechKind!==kind))return false;
    if(this.speechTimer){this.cancelTimer(this.speechTimer);this.speechTimer=null;}
    const utterance=this.utterance;this.utterance=null;this.speechKind=null;
    utterance.onstart=utterance.onend=utterance.onerror=null;
    try{this.synthesis?.cancel();}catch{/* Already stopped by the browser. */}
    this.speaking=false;this.onSpeaking(false);this.scheduleListen();return true;
  }
  speak(text,{kind='reply',rate=.95}={}) {
    if(kind==='guidance'&&this.utterance&&this.speechKind==='reply')return false;
    this.detachRecognition();
    if(this.speechTimer){this.cancelTimer(this.speechTimer);this.speechTimer=null;}
    if(this.utterance){this.utterance.onend=null;this.utterance.onerror=null;this.utterance.onstart=null;this.utterance=null;this.synthesis?.cancel();}
    this.speaking=false;this.onSpeaking(false);
    this.speechKind=kind;this.onReply(text,kind);
    if(!this.audioEnabled(kind)||!this.synthesis||!this.Utterance){this.speechKind=null;this.emit('text','已顯示文字回覆。');this.scheduleListen();return;}
    const token=this.epoch,utterance=new this.Utterance(String(text));this.utterance=utterance;
    utterance.lang='zh-TW';utterance.rate=Math.max(.8,Math.min(1.25,rate));
    const voices=this.synthesis.getVoices?.()||[];
    utterance.voice=voices.find((voice)=>voice.lang==='zh-TW'&&voice.localService)||voices.find((voice)=>voice.lang==='zh-TW')||voices.find((voice)=>voice.lang?.startsWith('zh'))||null;
    const current=()=>token===this.epoch&&this.utterance===utterance;
    const fail=()=>{if(!current())return;const failedKind=this.speechKind;this.stop(false);this.onSpeechError(failedKind);this.emit('error','語音播放失敗，已保留文字回覆；觸控操作仍可使用。');};
    let watchdog=this.timer(fail,10000);this.speechTimer=watchdog;
    utterance.onstart=()=>{
      if(!current())return;
      this.cancelTimer(watchdog);watchdog=this.timer(fail,60000);this.speechTimer=watchdog;
      this.speaking=true;this.onSpeaking(true);this.emit('speaking','教練回話中，暫停聆聽。');
    };
    utterance.onend=()=>{
      if(!current())return;
      this.cancelTimer(watchdog);this.speechTimer=null;this.utterance=null;this.speechKind=null;this.speaking=false;this.onSpeaking(false);
      this.emit('waiting','教練回覆完畢。');this.scheduleListen();
    };
    utterance.onerror=fail;
    this.emit('replying','正在準備教練回覆，暫停聆聽。');
    try{this.synthesis.speak(utterance);}catch{fail();}
  }
}
