// Classic worker: the SDK's WASM loader may use importScripts. Only local
// ImageBitmaps cross this boundary; frames never leave the browser.
let processor;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { createDetector, createPortraitSegmenter } = await import('./pose-core.js?v=0.8.2');
      const { createFrameProcessor } = await import('./pose-frame.js?v=0.8.2');
      processor = createFrameProcessor({detector:await createDetector(data.config),createCanvas:()=>new OffscreenCanvas(1,1),createSegmenter:()=>createPortraitSegmenter(data.config)});
      self.postMessage({ id: data.id, ready: true });
    } else if (data.type === 'frame') {
      const result = await processor.detect(data.bitmap, data.timestamp, data.options);
      const transfer=result.segmentation?[result.segmentation.confidence.buffer,result.segmentation.frame.rgba.buffer]:[];
      self.postMessage({ id: data.id, ...result }, transfer);
    }
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message || error) }); }
  finally { data.bitmap?.close(); }
};
