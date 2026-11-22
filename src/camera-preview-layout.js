// Fit the image itself inside a reserved debug rail; unused rail area is the
// studio background, not a tall dark video container. Never crop source pixels.
export function fitCameraPreview(width,height,sourceWidth,sourceHeight){
 if(![width,height,sourceWidth,sourceHeight].every(n=>Number.isFinite(n)&&n>0))return null;
 const scale=Math.min(width/sourceWidth,height/sourceHeight);
 return {width:sourceWidth*scale,height:sourceHeight*scale};
}
export function setupCameraPreviewLayout({preview,frame,video,Observer=globalThis.ResizeObserver}){
 function update(){
  if(!frame)return;
  const box=preview.getBoundingClientRect?.();if(!box)return;
  const fit=fitCameraPreview(box.width,box.height,video.videoWidth||3,video.videoHeight||4);if(!fit)return;
  frame.style.width=`${fit.width}px`;frame.style.height=`${fit.height}px`;
 }
 const observer=Observer?new Observer(update):null;observer?.observe(preview);
 video.addEventListener('loadedmetadata',update);video.addEventListener('resize',update);update();
 return {update,dispose(){observer?.disconnect();video.removeEventListener?.('loadedmetadata',update);video.removeEventListener?.('resize',update);}};
}
