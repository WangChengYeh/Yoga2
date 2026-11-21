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

// Semantic person segmentation separates hair/skin/clothes from scene objects.
export async function createPortraitSegmenter(config) {
  const { FilesetResolver, ImageSegmenter } = await import(config.moduleUrl);
  const files = await FilesetResolver.forVisionTasks(config.wasmRoot);
  const response=await fetch(config.segmentationModelUrl,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('Portrait model download failed');
  const modelAssetBuffer=new Uint8Array(await response.arrayBuffer());
  const task = await ImageSegmenter.createFromOptions(files, {
    baseOptions:{modelAssetBuffer,delegate:'CPU'},
    runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false,
  });
  const labels=task.getLabels();
  if(!['background','hair','body-skin','face-skin','clothes','others'].every(label=>labels.includes(label))){task.close();throw new Error('Unknown semantic segmentation labels');}
  return {labels,segmentForVideo:(...args)=>task.segmentForVideo(...args),close:()=>task.close()};
}
