import { CAMERA_FPS } from './camera-settings.js?v=0.9.37';
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
  constructor({ scheduler=null,requestedFPS=20,onFPS=()=>{},onTiming=()=>{},onSourceFrame=()=>{},video, mediaDevices, createEngine, onState = () => {}, onResult = () => {}, onStale = () => {}, getContext = () => ({}), measureLight = () => null, now = () => performance.now(), requestFrame = (fn) => requestAnimationFrame(fn), cancelFrame = (id) => cancelAnimationFrame(id), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), secure = true, minInterval = () => 180 }) {
    Object.assign(this, { scheduler,requestedFPS,onFPS,onTiming,onSourceFrame,video, mediaDevices, createEngine, onState, onResult, onStale, getContext, measureLight, now, requestFrame, cancelFrame, setTimer, clearTimer, secure, minInterval });
    this.fpsStatus='next-start';this.fpsSerial=0;this.waitingSince=null;this.jobAbort=null;this.phase = 'idle';this.attempts=0;this.accepted=0;this.slow=0;this.inFlightSince=null;this.lastAcceptedAt=null;this.activeAt=null;this.lastError=null; this.epoch = 0; this.stream = null; this.engine = null; this.handle = null;
  }
  emit(phase, message) { this.phase = phase; this.onState({ phase, message, preview: Boolean(this.stream) }); }
  async start() {
    if (['requesting', 'loading', 'active'].includes(this.phase)) return;
    const token = ++this.epoch;this.lastError=null;this.jobAbort=new AbortController();
    try {
      if (!this.secure) throw Object.assign(new Error(), { name: 'SecurityError' });
      if (!this.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'UnsupportedError' });
      this.emit('requesting', '請在瀏覽器允許相機；不需要麥克風。');
      const stream = await this.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 480 }, height: { ideal: 640 }, frameRate: { ideal: this.requestedFPS, max: this.requestedFPS } } });
      if (token !== this.epoch) { stopTracks(stream); return; }
      this.stream = stream; this.video.srcObject = stream;this.fpsStatus='negotiated';this.onFPS(this.fpsDiagnostics);
      for (const track of stream.getVideoTracks()) track.addEventListener?.('ended', () => { if (token === this.epoch) this.stop('相機連線已中斷，請重新開啟。'); }, { once: true });
      this.emit('loading', '相機已開啟，正在下載並準備本機辨識模型。');
      await this.video.play();
      this.observeSourceFrames(token);
      if (token !== this.epoch) return;
      const engine = this.scheduler?await this.scheduler.run('vision-load',()=>this.createEngine(this.jobAbort.signal),{signal:this.jobAbort.signal}):await this.createEngine(this.jobAbort.signal);
      if (token !== this.epoch) { engine.close(); return; }
      this.engine = engine;this.activeAt=this.now();this.lastAcceptedAt=null;this.lastInferenceMs=null;this.attempts=this.accepted=this.slow=0;this.inFlightSince=null; this.lastVideoTime = -1; this.lastResult = this.now(); this.nextAt = 0; this.stale = false;
      this.emit('active', '相機已開啟，請讓頭、雙手與雙腳完整入鏡。');
      this.schedule(token);
    } catch (error) {
      if (token !== this.epoch) return;
      this.lastError=error?.code||error?.name||'CameraError';this.stop(); this.emit('error', cameraMessage(error));
    }
  }
  observeSourceFrames(token){if(token!==this.epoch||!this.stream||!this.video.requestVideoFrameCallback)return;try{this.videoFrameHandle=this.video.requestVideoFrameCallback(()=>{if(token!==this.epoch||!this.stream)return;try{this.onSourceFrame();}catch{/* Optional telemetry. */}this.observeSourceFrames(token);});}catch{/* Unsupported frame callbacks cannot stop the camera. */}}
  schedule(token) { this.handle = this.requestFrame(() => { this.handle = null; return this.step(token); }); }
  async step(token) {
    if(!this.scheduler)return this.processFrame(token);
    if(token!==this.epoch||this.phase!=='active')return;
    const now=this.now();if(now-this.lastResult>1500&&!this.stale){this.stale=true;this.onStale();}if(this.video.readyState<2||this.video.currentTime===this.lastVideoTime||now<this.nextAt){this.schedule(token);return;}
    const controller=this.jobAbort;this.waitingSince=now;let release;
    const waitTimer=this.setTimer(()=>{if(token===this.epoch&&this.phase==='active'){this.stale=true;this.onStale();}},1500);
    try{release=await this.scheduler.acquire('vision-frame',{signal:controller.signal,key:'latest-pose',ttlMs:1000});this.clearTimer(waitTimer);if(token===this.epoch){this.lastScheduleWaitMs=this.now()-this.waitingSince;this.waitingSince=null;}if(token===this.epoch&&this.phase==='active')await this.processFrame(token);}
    catch(error){if(token===this.epoch&&this.phase==='active'){if(error.name==='AbortError'){if(error.code==='WORK_EXPIRED'||error.code==='WORK_REPLACED'){this.dropped=(this.dropped||0)+1;this.nextAt=this.now()+this.minInterval();this.schedule(token);}return;}this.lastError=error.name;this.stop();this.emit('error',cameraMessage(error));}}
    finally{this.clearTimer(waitTimer);if(token===this.epoch)this.waitingSince=null;release?.();}
  }
  async processFrame(token) {
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
      const result = await this.engine.detect(this.video, stamp, { segment:Boolean(context.segment),maxSide:context.maxSide });
      if (token !== this.epoch || this.phase !== 'active') return;
      const finished = this.now();
      this.onTiming({durationMs:finished-stamp,waitMs:this.lastScheduleWaitMs||0,timings:result.timings||{},accepted:finished-stamp<=1500});this.lastInferenceMs=finished-stamp;
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
    return {fps:this.fpsDiagnostics,waitingForSchedule:this.waitingSince!==null,scheduleWaitMs:age(this.waitingSince),lastScheduleWaitMs:this.lastScheduleWaitMs??null,attemptFPSAverage:age(this.activeAt)>=1000?Math.round(this.attempts*100000/age(this.activeAt))/100:null,acceptedFPSAverage:age(this.activeAt)>=1000?Math.round(this.accepted*100000/age(this.activeAt))/100:null,attempts:this.attempts,accepted:this.accepted,slow:this.slow,dropped:this.dropped||0,inFlight:this.inFlightSince!==null,inFlightAgeMs:age(this.inFlightSince),activeAgeMs:age(this.activeAt),lastAcceptedAgeMs:age(this.lastAcceptedAt),lastInferenceMs:this.lastInferenceMs??null,lastVideoTime:this.lastVideoTime??null,videoCurrentTime:Number.isFinite(this.video.currentTime)?this.video.currentTime:null,videoPaused:Boolean(this.video.paused),lastError:this.lastError,engine:this.engine?.diagnostics||null,tracks:this.stream?.getVideoTracks().map(t=>({readyState:t.readyState||null,muted:Boolean(t.muted),enabled:t.enabled??null}))||[]};
  }
  get fpsDiagnostics(){const track=this.stream?.getVideoTracks?.()[0];let settings={};try{settings=track?.getSettings?.()||{};}catch{/* unavailable */}return {requested:this.requestedFPS,negotiated:settings.frameRate??null,status:this.fpsStatus,error:this.fpsError||null};}
  setFPS(value){
    if(!CAMERA_FPS.includes(Number(value)))return Promise.resolve(false);this.requestedFPS=Number(value);const serial=++this.fpsSerial,token=this.epoch,track=this.stream?.getVideoTracks?.()[0];this.fpsError=null;
    if(!track){this.fpsStatus='next-start';this.onFPS(this.fpsDiagnostics);return Promise.resolve(true);}
    this.fpsStatus='applying';this.onFPS(this.fpsDiagnostics);
    this.fpsUpdates=(this.fpsUpdates||Promise.resolve()).catch(()=>{}).then(async()=>{
      if(serial!==this.fpsSerial||token!==this.epoch)return false;
      if(!track.applyConstraints){this.fpsStatus='unsupported';this.onFPS(this.fpsDiagnostics);return false;}
      try{await track.applyConstraints({frameRate:{ideal:this.requestedFPS,max:this.requestedFPS}});if(serial!==this.fpsSerial||token!==this.epoch)return false;this.fpsStatus='negotiated';this.onFPS(this.fpsDiagnostics);return true;}
      catch(error){if(serial===this.fpsSerial&&token===this.epoch){this.fpsStatus='failed';this.fpsError=error?.name||'ConstraintError';this.onFPS(this.fpsDiagnostics);}return false;}
    });return this.fpsUpdates;
  }
  stop(message = '相機已關閉，可隨時重新開啟。') {
    ++this.epoch;if(this.videoFrameHandle!=null)try{this.video.cancelVideoFrameCallback?.(this.videoFrameHandle);}catch{/* Optional observer. */}this.videoFrameHandle=null;this.jobAbort?.abort();this.jobAbort=null;this.waitingSince=null;this.fpsStatus='next-start';
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
