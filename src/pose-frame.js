import { portraitMask } from './portrait-mask.js?v=0.8.3';
import { frameSize } from './cutout-core.js?v=0.8.3';

// The same snapshot supplies pose, portrait segmentation and RGB, including when
// there are no usable body landmarks. Frames never leave the browser.
export function createFrameProcessor({ detector, createCanvas, createSegmenter }) {
  let canvas,ctx,segmenter,closed=false,segmentationFailed=false;
  const releasePortrait=()=>{segmenter?.close();segmenter=null;if(canvas)canvas.width=canvas.height=1;canvas=ctx=null;};
  return {
    async detect(source,timestamp,{segment=false}={}) {
      if(closed)throw new Error('Engine closed');
      if(!segment){releasePortrait();segmentationFailed=false;}
      if(segment&&!segmentationFailed&&!segmenter) {
        try {
          const loaded=await createSegmenter();
          if(closed){loaded.close();throw new Error('Engine closed');}
          segmenter=loaded;
        }catch(error){if(closed)throw error;segmentationFailed=true;}
      }
      let input=source;
      if(segment&&!segmentationFailed) {
        try {
          const {width,height}=frameSize(source.videoWidth||source.width,source.videoHeight||source.height);
          canvas ||= createCanvas();ctx ||= canvas.getContext('2d',{willReadFrequently:true});
          if(!ctx)throw new Error('Canvas unavailable');
          if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
          ctx.drawImage(source,0,0,width,height);input=canvas;
        }catch{segmentationFailed=true;releasePortrait();}
      }
      const result=detector.detectForVideo(input,timestamp);
      try {
        let segmentation=null,segmentationError=segment&&segmentationFailed;
        if(segment&&!segmentationFailed&&result.landmarks.length<=1) {
          let portrait;
          try {
            portrait=segmenter.segmentForVideo(input,timestamp);
            const masks=portrait.confidenceMasks;
            if(!masks?.length)throw new Error('Semantic masks missing');
            const semantic=portraitMask({width:masks[0].width,height:masks[0].height,labels:segmenter.labels,channels:masks.map(mask=>mask.getAsFloat32Array())});
            segmentation={...semantic,frame:{width:canvas.width,height:canvas.height,rgba:new Uint8ClampedArray(ctx.getImageData(0,0,canvas.width,canvas.height).data)}};
          }catch{segmentationFailed=true;segmentationError=true;}
          finally{portrait?.close();if(segmentationFailed)releasePortrait();}
        }
        return {landmarks:result.landmarks,segmentation,segmentationError};
      }finally{result.close();}
    },
    close(){if(closed)return;closed=true;detector.close();releasePortrait();},
  };
}
