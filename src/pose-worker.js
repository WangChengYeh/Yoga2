// Classic worker: the SDK's WASM loader may use importScripts. Only local
// ImageBitmaps cross this boundary; frames never leave the browser.
let detector;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { createDetector } = await import('./pose-core.js?v=m3-1');
      detector = await createDetector(data.config);
      self.postMessage({ id: data.id, ready: true });
    } else if (data.type === 'frame') {
      const result = detector.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ id: data.id, landmarks: result.landmarks });
    }
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message || error) }); }
  finally { data.bitmap?.close(); }
};
