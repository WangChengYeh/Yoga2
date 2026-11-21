export async function createDetector(config) {
  const { FilesetResolver, PoseLandmarker } = await import(config.moduleUrl);
  const files = await FilesetResolver.forVisionTasks(config.wasmRoot);
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: config.modelUrl, delegate: 'CPU' },
    runningMode: 'VIDEO', numPoses: 2,
    minPoseDetectionConfidence: .6, minPosePresenceConfidence: .6, minTrackingConfidence: .6,
    outputSegmentationMasks: false,
  });
}

// Portrait segmentation must not depend on whether pose landmarks include feet.
// The pinned Selfie Segmenter exposes one foreground label: "selfie".
export async function createPortraitSegmenter(config) {
  const { FilesetResolver, ImageSegmenter } = await import(config.moduleUrl);
  const files = await FilesetResolver.forVisionTasks(config.wasmRoot);
  const response=await fetch(config.segmentationModelUrl,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Portrait model download failed');
  const modelAssetBuffer=new Uint8Array(await response.arrayBuffer());
  const task = await ImageSegmenter.createFromOptions(files, {
    baseOptions:{modelAssetBuffer,delegate:'CPU'},
    runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false,
  });
  const foregroundIndex=task.getLabels().findIndex(label=>/^(selfie|person)$/i.test(label));
  if(foregroundIndex<0){task.close();throw new Error('Unknown portrait segmentation labels');}
  return {foregroundIndex,segmentForVideo:(...args)=>task.segmentForVideo(...args),close:()=>task.close()};
}
