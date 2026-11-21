export function cameraMessage(error) {
  const messages = {
    NotAllowedError: '未取得相機權限。請在瀏覽器允許相機，或繼續使用不開相機的帶練。',
    NotFoundError: '找不到可用相機，仍可使用一般帶練。',
    NotReadableError: '相機可能正被其他 App 使用，請關閉後再試。',
    OverconstrainedError: '相機無法使用這個設定，請換新版瀏覽器再試。',
    SecurityError: '相機需要 HTTPS 安全網頁，請用正式網站開啟。',
    UnsupportedError: '這個瀏覽器無法開啟相機，請改用 Safari 或 Chrome。',
  };
  return messages[error?.name] || '姿勢觀察無法啟動或已中斷，請重試；一般帶練仍可使用。';
}
const stopTracks = (stream) => stream?.getTracks().forEach((track) => track.stop());

export class CameraSession {
  constructor({ video, mediaDevices, createEngine, onState = () => {}, onResult = () => {}, onStale = () => {}, getContext = () => ({}), measureLight = () => null, now = () => performance.now(), requestFrame = (fn) => requestAnimationFrame(fn), cancelFrame = (id) => cancelAnimationFrame(id), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), secure = true, minInterval = () => 180 }) {
    Object.assign(this, { video, mediaDevices, createEngine, onState, onResult, onStale, getContext, measureLight, now, requestFrame, cancelFrame, setTimer, clearTimer, secure, minInterval });
    this.phase = 'idle';this.attempts=0;this.accepted=0;this.slow=0;this.inFlightSince=null;this.lastAcceptedAt=null;this.activeAt=null;this.lastError=null; this.epoch = 0; this.stream = null; this.engine = null; this.handle = null;
  }
  emit(phase, message) { this.phase = phase; this.onState({ phase, message, preview: Boolean(this.stream) }); }
  async start() {
    if (['requesting', 'loading', 'active'].includes(this.phase)) return;
    const token = ++this.epoch;this.lastError=null;
    try {
      if (!this.secure) throw Object.assign(new Error(), { name: 'SecurityError' });
      if (!this.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'UnsupportedError' });
      this.emit('requesting', '請在瀏覽器允許相機；不需要麥克風。');
      const stream = await this.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 480 }, height: { ideal: 640 }, frameRate: { ideal: 15, max: 24 } } });
      if (token !== this.epoch) { stopTracks(stream); return; }
      this.stream = stream; this.video.srcObject = stream;
      for (const track of stream.getVideoTracks()) track.addEventListener?.('ended', () => { if (token === this.epoch) this.stop('相機連線已中斷，請重新開啟。'); }, { once: true });
      this.emit('loading', '相機已開啟，正在下載並準備本機辨識模型。');
      await this.video.play();
      if (token !== this.epoch) return;
      const engine = await this.createEngine();
      if (token !== this.epoch) { engine.close(); return; }
      this.engine = engine;this.activeAt=this.now();this.lastAcceptedAt=null;this.lastInferenceMs=null;this.attempts=this.accepted=this.slow=0;this.inFlightSince=null; this.lastVideoTime = -1; this.lastResult = this.now(); this.nextAt = 0; this.stale = false;
      this.emit('active', '相機已開啟，請讓頭、雙手與雙腳完整入鏡。');
      this.schedule(token);
    } catch (error) {
      if (token !== this.epoch) return;
      this.lastError=error?.code||error?.name||'CameraError';this.stop(); this.emit('error', cameraMessage(error));
    }
  }
  schedule(token) { this.handle = this.requestFrame(() => { this.handle = null; return this.step(token); }); }
  async step(token) {
    if (token !== this.epoch || this.phase !== 'active') return;
    const stamp = this.now();
    if (stamp - this.lastResult > 1500 && !this.stale) { this.stale = true; this.onStale(); }
    if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime || stamp < this.nextAt) { this.schedule(token); return; }
    this.lastVideoTime = this.video.currentTime;
    const context = this.getContext();this.attempts++;this.inFlightSince=stamp;
    const watchdog = this.setTimer(() => { if (token === this.epoch && this.phase === 'active') { this.stale = true; this.onStale(); } }, 1500);
    this.watchdog = watchdog;
    try {
      const brightness = this.measureLight();
      const result = await this.engine.detect(this.video, stamp, { segment:Boolean(context.segment) });
      if (token !== this.epoch || this.phase !== 'active') return;
      const finished = this.now();this.lastInferenceMs=finished-stamp;
      this.nextAt = finished + Math.max(this.minInterval(), (finished - stamp) * .5);
      if (finished - stamp <= 1500) {
        this.lastResult = finished;this.lastAcceptedAt=finished;this.accepted++; this.stale = false;
        this.onResult({ ...result, brightness, context, capturedAt: stamp }, finished);
      } else { this.slow++;this.stale = true; this.onStale(); }
      this.schedule(token);
    } catch (error) {
      if (token !== this.epoch) return;
      this.lastError=error?.code||error?.name||'CameraError';this.stop(); this.emit('error', cameraMessage(error));
    } finally {if(token===this.epoch)this.inFlightSince=null; this.clearTimer(watchdog); if (this.watchdog === watchdog) this.watchdog = null; }
  }
  get diagnostics(){
    const stamp=this.now(),age=value=>Number.isFinite(value)?Math.max(0,stamp-value):null;
    return {attempts:this.attempts,accepted:this.accepted,slow:this.slow,inFlight:this.inFlightSince!==null,inFlightAgeMs:age(this.inFlightSince),activeAgeMs:age(this.activeAt),lastAcceptedAgeMs:age(this.lastAcceptedAt),lastInferenceMs:this.lastInferenceMs??null,lastVideoTime:this.lastVideoTime??null,videoCurrentTime:Number.isFinite(this.video.currentTime)?this.video.currentTime:null,videoPaused:Boolean(this.video.paused),lastError:this.lastError,engine:this.engine?.diagnostics||null,tracks:this.stream?.getVideoTracks().map(t=>({readyState:t.readyState||null,muted:Boolean(t.muted),enabled:t.enabled??null}))||[]};
  }
  stop(message = '相機已關閉，可隨時重新開啟。') {
    ++this.epoch;
    if (this.handle !== null) this.cancelFrame(this.handle);
    this.handle = null;this.inFlightSince=null;
    this.clearTimer(this.watchdog); this.watchdog = null;
    stopTracks(this.stream); this.stream = null;
    try { this.engine?.close(); } catch { /* already closed */ }
    this.engine = null;
    this.video.pause(); this.video.srcObject = null;
    this.emit('idle', message);
  }
}
