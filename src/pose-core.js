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
