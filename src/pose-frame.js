import { frameSize } from './cutout-core.js?v=0.6.0';

// Shared by Worker and main-thread fallback. Snapshot RGB before inference to
// prevent a mask from being combined with a later live-video frame.
export function createFrameProcessor({ detector, createCanvas }) {
  let canvas, ctx, masks=false, closed=false, segmentationFailed=false;
  return {
    async detect(source, timestamp, { segment=false }={}) {
      if(closed)throw new Error('Engine closed');
      const requested=segment&&!segmentationFailed;
      if(requested!==masks) {
        try { await detector.setOptions({outputSegmentationMasks:requested}); masks=requested; }
        catch(error) {
          if(!requested)throw error;
          segmentationFailed=true; masks=false;
          await detector.setOptions({outputSegmentationMasks:false});
        }
      }
      if(closed)throw new Error('Engine closed');
      let input=source;
      if(segment&&!segmentationFailed) {
        try {
          const {width,height}=frameSize(source.videoWidth||source.width,source.videoHeight||source.height);
          canvas ||= createCanvas(); ctx ||= canvas.getContext('2d',{willReadFrequently:true});
          if(!ctx)throw new Error('Canvas unavailable');
          if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
          ctx.drawImage(source,0,0,width,height); input=canvas;
        } catch { segmentationFailed=true; }
      }
      const result=detector.detectForVideo(input,timestamp);
      try {
        let segmentation=null, segmentationError=segment&&segmentationFailed;
        if(segment&&!segmentationFailed&&result.landmarks.length===1) {
          try {
            const mask=result.segmentationMasks?.length===1?result.segmentationMasks[0]:null;
            if(mask)segmentation={width:mask.width,height:mask.height,confidence:new Float32Array(mask.getAsFloat32Array()),frame:{width:canvas.width,height:canvas.height,rgba:new Uint8ClampedArray(ctx.getImageData(0,0,canvas.width,canvas.height).data)}};
            else segmentationError=true;
          } catch {segmentationFailed=true;segmentationError=true;}
        }
        return {landmarks:result.landmarks,segmentation,segmentationError};
      } finally {result.close();}
    },
    close() {if(closed)return;closed=true;detector.close();if(canvas)canvas.width=canvas.height=1;canvas=ctx=null;},
  };
}
