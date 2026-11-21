// Coordinates stay unmirrored through inference/compositing. Mirror exactly once
// in the scene texture; mask and RGB always describe the same captured frame.
export const MAX_FRAME_EDGE = 512;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function frameSize(width, height) {
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid frame size');
  const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function validSegmentation(value) {
  if (!value) return false;
  const { width, height, confidence, frame } = value;
  return Number.isInteger(width) && width > 0 && width <= 2048 && Number.isInteger(height) && height > 0 && height <= 2048 &&
    confidence instanceof Float32Array && confidence.length === width * height && frame &&
    Number.isInteger(frame.width) && frame.width > 0 && frame.width <= MAX_FRAME_EDGE &&
    Number.isInteger(frame.height) && frame.height > 0 && frame.height <= MAX_FRAME_EDGE &&
    frame.rgba instanceof Uint8ClampedArray && frame.rgba.length === frame.width * frame.height * 4;
}
// Bilinear confidence sampling avoids blocky edges when RGB and mask sizes differ.
export function composeCutout(value) {
  if (!validSegmentation(value)) throw new Error('Invalid segmentation');
  const { width: mw, height: mh, confidence, frame } = value;
  const { width, height } = frame;
  const rgba = new Uint8ClampedArray(frame.rgba.length);
  let foreground = 0;
  let left=width,right=0,top=height,bottom=0;
  const sample = (x, y) => { const v = confidence[y * mw + x]; return Number.isFinite(v) ? clamp(v, 0, 1) : 0; };
  for (let y = 0; y < height; y++) {
    const sy = clamp((y + .5) * mh / height - .5, 0, mh - 1), y0 = Math.floor(sy), fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = clamp((x + .5) * mw / width - .5, 0, mw - 1), x0 = Math.floor(sx), fx = sx - x0;
      const a = sample(x0, y0) * (1-fx) + sample(Math.min(x0+1,mw-1),y0) * fx;
      const b = sample(x0, Math.min(y0+1,mh-1)) * (1-fx) + sample(Math.min(x0+1,mw-1),Math.min(y0+1,mh-1)) * fx;
      const t = clamp(((a*(1-fy)+b*fy)-.35)/.4, 0, 1);
      const alpha = t*t*(3-2*t), i=(y*width+x)*4;
      rgba[i]=frame.rgba[i]; rgba[i+1]=frame.rgba[i+1]; rgba[i+2]=frame.rgba[i+2];
      rgba[i+3]=Math.round(frame.rgba[i+3]*alpha);
      if (alpha > .5) {foreground++;left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1); }
    }
  }
  return { width, height, rgba, bounds:{left:left/width,right:right/width,top:top/height,bottom:bottom/height}, coverage:foreground/(width*height) };
}
const usable = p => p && [p.x,p.y].every(Number.isFinite) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1 && (p.visibility ?? 0) >= .6;
export function calibratePerson(points) {
  if (![0,23,24,31,32].every(i=>usable(points?.[i]))) return null;
  const footY = Math.max(points[31].y,points[32].y), span=footY-points[0].y;
  if (span < .3 || span > .95) return null;
  return { mode:'full', hipX:(points[23].x+points[24].x)/2, footY, bodySpan:span*1.08 };
}
// A valid portrait mask can be displayed even when the pose model finds no
// body. Center its visible foreground without pretending missing feet exist.
export function calibratePortrait(frame) {
  let left=frame.width, right=-1, top=frame.height, bottom=-1;
  for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++)if(frame.rgba[(y*frame.width+x)*4+3]>=128){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left)return null;
  return {mode:'portrait',hipX:(left+right+1)/(2*frame.width),footY:(bottom+1)/frame.height,bodySpan:Math.max(.25,(bottom-top+1)/frame.height)};
}
// A face-size reference matches the coach's anatomical scale even for a
// half-body camera view. Freeze this reference until explicit recalibration.
export function calibrateFace(face) {
  if(!face||![face.left,face.right,face.top,face.bottom].every(Number.isFinite))return null;
  const span=face.bottom-face.top;
  if(span<.035||span>.85||face.left<0||face.right>1||face.top<0||face.bottom>1||face.right<=face.left)return null;
  return {mode:'face',anchorX:(face.left+face.right)/2,anchorY:(face.top+face.bottom)/2,faceSpan:span};
}
export function personPlacement(calibration, aspect, { x=.72, scale=1 } = {}) {
  if (!calibration || !Number.isFinite(aspect) || aspect<=0) throw new Error('Invalid placement');
  x=clamp(Number.isFinite(x)?x:.72,-1.4,1.4); scale=clamp(Number.isFinite(scale)?scale:1,.65,1.4);
  const face=calibration.mode==='face';
  const height=(face ? .22/calibration.faceSpan : 1.72/calibration.bodySpan)*scale,width=height*aspect;
  return {x:x-(.5-(face?calibration.anchorX:calibration.hipX))*width,y:face?1.59-(.5-calibration.anchorY)*height:.025+(calibration.footY-.5)*height,z:.12,width,height};
}

// Owns visibility and frame generations separately from course playback, so
// pausing/seeking a lesson never leaves an old cutout behind or blocks new video.
export class CutoutSession {
  constructor({ onFrame=()=>{}, onClear=()=>{}, onState=()=>{} }={}) {
    Object.assign(this,{onFrame,onClear,onState});
    this.enabled=false; this.cameraActive=false; this.ready=false; this.token=0;this.hasFrame=false;
  }
  emit(message) { this.onState({enabled:this.enabled,available:this.ready&&this.cameraActive,message}); }
  invalidate() { this.token++; this.calibration=null; this.aspect=null; this.onClear(); }
  setReady(ready) { this.ready=ready; if(!ready){this.enabled=false;this.invalidate();} this.emit(ready?'開啟相機即自動去背入場。':'3D 未就緒，仍可使用相機姿勢觀察。'); }
  setCamera(active) { this.cameraActive=active; if(!active){this.enabled=false;this.invalidate();} this.emit(active?'正在準備自動去背，半身也可以。':'開啟相機即自動去背入場。'); }
  toggle() {
    if(!this.ready||!this.cameraActive)return;
    this.enabled=!this.enabled;this.hasFrame=false; this.invalidate();
    this.emit(this.enabled?'正在準備精細人像去背（首次約 16 MB），完成後自動顯示。':'真人已離場。');
  }
  get context() { return { segment:this.enabled, humanToken:this.token }; }
  recalibrate() { this.invalidate(); this.emit('重新校準中，請放下手、正面看鏡頭。'); }
  stale() { this.onClear(); if(this.enabled)this.emit(this.hasFrame?'畫面未及時更新，暫時隱藏真人。':'精細去背模型準備中（首次約 16 MB），暫時隱藏真人；完成後自動顯示。'); }
  accept(data, now) {
    if(!this.enabled||!this.ready||!this.cameraActive||data.context?.humanToken!==this.token)return false;
    if(!Number.isFinite(data.capturedAt)||now-data.capturedAt<0||now-data.capturedAt>1500){this.stale();return false;}
    if(data.segmentationError){this.onClear();this.enabled=false;this.token++;this.emit('去背暫時無法使用，保留相機姿勢觀察；關閉重開相機後可再試。');return false;}
    if(data.landmarks?.length>1||!validSegmentation(data.segmentation)) { this.onClear();this.emit('等待去背畫面，請讓一人入鏡。');return false; }
    const frame = composeCutout(data.segmentation);
    if(frame.coverage<.015) {this.onClear();this.emit('去背畫面不清楚，請調整光線或背景。');return false;}
    const calibration=(data.landmarks?.length===1?calibratePerson(data.landmarks[0]):null)||calibrateFace(data.segmentation.face)||calibratePortrait(frame);
    if(!calibration){this.onClear();return false;}
    const aspect=frame.width/frame.height;
    if(!this.calibration||Math.abs(aspect-this.aspect)>.02){this.calibration=calibration;this.aspect=aspect;}
    this.hasFrame=true;this.onFrame(frame,this.calibration);this.emit(this.calibration.mode==='full'?'全身比例已鎖定 · 伸展時站位不變':this.calibration.mode==='face'?'頭肩比例已校準 · 位置與大小固定':'半身模式 · 可重新校準比例');return true;
  }
}
