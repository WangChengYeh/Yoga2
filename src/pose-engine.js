import { createFrameProcessor } from './pose-frame.js?v=0.10.0';
import { createDetector, createPortraitSegmenter } from './pose-core.js?v=0.10.0';

async function workerEngine(config,observe=()=>{},signal) {
  if(signal?.aborted)throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
  const worker = new Worker(new URL('./pose-worker.js?v=0.10.0', import.meta.url));
  let nextId = 0, closed = false, portraitRequested=false,stage='initializing',lastError=null,resources=null;
  const pending = new Map();
  const fail = () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Pose worker unavailable')); }
    pending.clear();
  };
  worker.onerror = (event) => { event.preventDefault(); fail(); };
  worker.onmessage = ({ data }) => {
    if(closed)return;
    if(data.type==='pose-stage'){stage=data.stage;if(data.resources)resources=data.resources;observe(stage,resources);return;}
    const entry = pending.get(data.id); if (!entry) return;
    pending.delete(data.id); clearTimeout(entry.timer);if(data.resources)resources=data.resources;
    if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data);
  };
  function send(message, transfer = [], timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (closed) { reject(new Error('Engine closed')); return; }
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error('Pose inference timed out'),{code:'POSE_REQUEST_TIMEOUT'})); }, timeout);
      pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ ...message, id }, transfer); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  const close = () => { if (!closed) { closed = true;stage='closed';signal?.removeEventListener('abort',close); worker.terminate(); fail(); } };
  signal?.addEventListener('abort',close,{once:true});
  try { await send({ type: 'init', config }, [], 45000); }
  catch (error) { close(); throw error; }
  return {
    mode: 'worker', close,get diagnostics(){return {stage,lastError,pending:pending.size,resources};},
    async detect(video, timestamp, options) {
      let bitmap;stage='capture-frame';
      try{
        bitmap=await createImageBitmap(video);
        if(closed)throw new Error('Engine closed');
        stage='worker-inference';
        const timeout=options?.segment&&!portraitRequested?90000:10000;
        portraitRequested=Boolean(options?.segment);
        return await send({type:'frame',bitmap,timestamp,options},[bitmap],timeout);
      }catch(error){lastError=error?.code||error?.name||'PoseError';if(!closed)stage='error';throw error;}
      finally{bitmap?.close();if(!closed&&stage!=='error')stage='idle';}
    },
  };
}

export function portraitMemoryObserver(notify=()=>{}){
 let loading=false;return (stage,resources)=>{try{if(stage==='portrait-loading'&&!loading){loading=true;notify({phase:'portrait-load-before'});}else if(stage==='closed')loading=false;else if(loading&&stage==='pose-inference'){loading=false;notify({phase:resources?.portraitLoaded?'portrait-load-after':'error',code:resources?.portraitLoaded?undefined:'PORTRAIT_LOAD_FAILED'});}}catch{/* Observation must not affect detection. */}};
}
export async function createPoseEngine(config,{onMemoryEvent=()=>{},signal}={}) {
  const observe=portraitMemoryObserver(onMemoryEvent);
  if (typeof Worker !== 'undefined' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
    try { return await workerEngine(config,observe,signal); }
    catch { if(signal?.aborted)throw Object.assign(new Error('Cancelled'),{name:'AbortError'}); /* Fall back once for browsers without worker/WASM canvas support. */ }
  }
  if(signal?.aborted)throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
  const detector = await createDetector(config);
  if(signal?.aborted){detector.close();throw Object.assign(new Error('Cancelled'),{name:'AbortError'});}
  const processor=createFrameProcessor({detector,createCanvas:()=>document.createElement('canvas'),createSegmenter:()=>createPortraitSegmenter(config),onStage:stage=>observe(stage,processor?.diagnostics)});
  return {mode:'main',detect:(...args)=>processor.detect(...args),close:()=>processor.close(),get diagnostics(){return processor.diagnostics;}};
}
