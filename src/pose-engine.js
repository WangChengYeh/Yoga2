import { createDetector } from './pose-core.js?v=m3-1';

async function workerEngine(config) {
  const worker = new Worker(new URL('./pose-worker.js?v=m3-1', import.meta.url));
  let nextId = 0, closed = false;
  const pending = new Map();
  const fail = () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Pose worker unavailable')); }
    pending.clear();
  };
  worker.onerror = (event) => { event.preventDefault(); fail(); };
  worker.onmessage = ({ data }) => {
    const entry = pending.get(data.id); if (!entry) return;
    pending.delete(data.id); clearTimeout(entry.timer);
    if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data);
  };
  function send(message, transfer = [], timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (closed) { reject(new Error('Engine closed')); return; }
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Pose inference timed out')); }, timeout);
      pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ ...message, id }, transfer); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  const close = () => { if (!closed) { closed = true; worker.terminate(); fail(); } };
  try { await send({ type: 'init', config }, [], 45000); }
  catch (error) { close(); throw error; }
  return {
    mode: 'worker', close,
    async detect(video, timestamp) {
      const bitmap = await createImageBitmap(video);
      if (closed) { bitmap.close(); throw new Error('Engine closed'); }
      try { return await send({ type: 'frame', bitmap, timestamp }, [bitmap]); }
      finally { bitmap.close(); }
    },
  };
}

export async function createPoseEngine(config) {
  if (typeof Worker !== 'undefined' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
    try { return await workerEngine(config); }
    catch { /* Fall back once for browsers without worker/WASM canvas support. */ }
  }
  const detector = await createDetector(config);
  return { mode: 'main', close: () => detector.close(), detect: async (video, timestamp) => ({ landmarks: detector.detectForVideo(video, timestamp).landmarks }) };
}
