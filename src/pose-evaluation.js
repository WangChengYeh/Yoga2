import { motionAt } from './course.js?v=0.9.27';
import { observePose, feedbackWindow, feedbackKey, REQUIRED_POINTS } from './pose-rules.js?v=0.9.27';

// Deterministic frontal image-plane comparison against the same course motion
// parameters that drive Luna. No rendered avatar, WebLLM or world-depth claims.
export const POSE_TTL_MS = 1500;
const deg = 180 / Math.PI;
const round = n => Math.round(n * 10) / 10;
const midpoint = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const vector = (a,b,aspect) => [(b.x-a.x)*aspect,b.y-a.y];
function angle(u,v) {
  const length=Math.hypot(...u)*Math.hypot(...v);
  return length>1e-8 ? Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/length)))*deg : null;
}
export const jointAngle2D = (a,b,c,aspect=1) => angle(vector(b,a,aspect),vector(b,c,aspect));
export function coursePoseTarget(frame) {
  const phase=feedbackWindow(frame),motion=motionAt(frame.lesson.id,frame.localTime);
  return {lesson:frame.lesson.id,phase,armElevation:round(motion.armAngle*deg),elbow:180,
    torsoLean:round(motion.lean*deg),symmetry:0,coordinates:'frontal-image-2d',depthEvaluated:false};
}
const unknown = (code,message,now) => ({schema:1,source:'original-mediapipe',status:'unknown',code,message,kind:'setup',valid:false,confidence:0,capturedAt:null,evaluatedAt:now,expiresAt:null,target:null,metrics:null,hints:[]});
export function evaluatePose(data,frame,{now,playing=false,aspect=1,activeCodes=new Set()}={}) {
  if(!Number.isFinite(now)||!Number.isFinite(data?.capturedAt)||data.capturedAt>now||now-data.capturedAt>POSE_TTL_MS)
    return unknown('stale','相機關節資料已過期，等待新的觀察。',now);
  if(!Number.isFinite(aspect)||aspect<=0)return unknown('invalid-aspect','相機尺寸尚未就緒，暫停動作判斷。',now);
  if(!frame?.lesson||!Number.isFinite(frame.localTime)||!['reach','side','open'].includes(frame.lesson.id))
    return unknown('invalid-target','課程目標尚未就緒。',now);
  // Shared conservative framing/person/confidence gates; do not depend on its
  // old movement heuristics. All required joints must be visible, even for arms.
  const gate=observePose(data.landmarks,frame,{playing:false,aspect,brightness:data.brightness});
  if(!gate.valid)return {...unknown(gate.code,gate.message,now),capturedAt:data.capturedAt};
  const points=data.landmarks[0],shoulder=midpoint(points[11],points[12]),hip=midpoint(points[23],points[24]);
  const down=vector(shoulder,hip,aspect),rightSign=Math.sign(points[12].x-points[11].x);
  const metrics={
    leftArmElevation:angle(down,vector(points[11],points[13],aspect)),
    rightArmElevation:angle(down,vector(points[12],points[14],aspect)),
    leftElbow:jointAngle2D(points[11],points[13],points[15],aspect),
    rightElbow:jointAngle2D(points[12],points[14],points[16],aspect),
    leftKnee:jointAngle2D(points[23],points[25],points[27],aspect),
    rightKnee:jointAngle2D(points[24],points[26],points[28],aspect),
    torsoLean:Math.atan2((shoulder.x-hip.x)*aspect*rightSign,hip.y-shoulder.y)*deg,
  };
  if(Object.values(metrics).some(v=>v===null||!Number.isFinite(v)))return unknown('degenerate','部分骨段無法量測，暫停動作判斷。',now);
  metrics.armAsymmetry=Math.abs(metrics.leftArmElevation-metrics.rightArmElevation);
  const confidence=Math.min(...REQUIRED_POINTS.map(i=>Math.min(points[i].visibility,points[i].presence??1)));
  const target=coursePoseTarget(frame),base={schema:1,source:'original-mediapipe',inputMirrored:Boolean(data.mirrored),confidence:Math.min(1,confidence),capturedAt:data.capturedAt,evaluatedAt:now,
    expiresAt:data.capturedAt+POSE_TTL_MS,target,metrics:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,round(v)])),hints:[]};
  if(!playing||frame.complete)return {...base,status:'paused',code:'positioned',message:gate.message,kind:'info',valid:false};
  if(target.phase.endsWith('transition'))return {...base,status:'transition',code:'transition',message:'動作銜接中，停留時再比較。',kind:'info',valid:false};
  const hints=[];
  const add=(code,joint,measured,expected,error,enter,exit,message)=>{
    const tolerance=activeCodes.has(code)?exit:enter;
    if(error>tolerance)hints.push({code,joint,severity:'correction',confidence,measured:round(measured),target:expected,error:round(error),tolerance,
      ttlMs:Math.max(0,base.expiresAt-now),expiresAt:base.expiresAt,message});
  };
  for(const side of ['left','right']){
    const label=side==='left'?'左':'右',elevation=metrics[side+'ArmElevation'],elbow=metrics[side+'Elbow'];
    add(`${side}-elbow-bent`,`${side}Elbow`,elbow,180,180-elbow,35,25,`畫面中${label}肘較彎；可在舒適範圍內伸展。`);
    add(`${side}-arm-elevation`,`${side}Shoulder`,elevation,target.armElevation,Math.abs(elevation-target.armElevation),25,18,`留意你的${label}上臂高度，跟隨教練並維持舒適幅度。`);
  }
  add('arm-asymmetry','shoulders',metrics.armAsymmetry,0,metrics.armAsymmetry,25,18,'畫面中雙臂高度有落差，請留意左右手。');
  add('torso-direction','torso',metrics.torsoLean,target.torsoLean,Math.abs(metrics.torsoLean-target.torsoLean),12,8,
    target.phase.startsWith('side-')?`目前目標是向你的${target.torsoLean>0?'右':'左'}側輕輕伸展。`:'畫面中身體有側傾，請留意回到舒適站姿。');
  const first=hints[0];
  return {...base,status:first?'correction':'matched',valid:true,code:first?.code||`${frame.lesson.id}-matched`,kind:first?'hint':'observed',
    message:first?.message||(frame.lesson.id==='open'?'影像平面的展臂接近課程目標；無法確認向後開胸。':'影像平面的動作接近課程目標，維持自然呼吸。'),hints};
}

// Require independent samples, not render frames. No old correction/praise is
// shown during a changed candidate, unknown sample, pause, transition or expiry.
export class PoseEvaluationEngine {
  constructor(){this.reset();}
  reset(){this.key=null;this.lastCapture=-Infinity;this.lastSample=-Infinity;this.candidate=null;this.count=0;this.since=0;this.confirmed=[];this.latest=null;this.raw=null;}
  update(data,frame,options={}) {
    const {now,playing=false}=options,key=frame?.lesson?feedbackKey(frame,playing):'invalid-target';
    if(this.key!==key||now<this.lastSample||now-this.lastSample>1200){this.reset();this.key=key;}
    if(Number.isFinite(data?.capturedAt)&&data.capturedAt<=this.lastCapture){
      this.reset();this.key=key;return this.latest=unknown('duplicate','等待新的相機關節資料。',now);
    }
    this.lastCapture=data?.capturedAt;this.lastSample=now;
    const raw=evaluatePose(data,frame,{...options,activeCodes:new Set(this.confirmed)});this.raw=raw;
    if(!raw.valid){this.candidate=null;this.count=0;this.confirmed=[];return this.latest=raw;}
    const signature=raw.hints.map(h=>h.code).join('|')||raw.code;
    if(signature!==this.candidate){this.candidate=signature;this.count=1;this.since=now;}else this.count++;
    if(this.count>=3&&now-this.since>=450){this.confirmed=raw.hints.map(h=>h.code);return this.latest=raw;}
    return this.latest={...raw,status:'stabilizing',code:'stabilizing',kind:'info',valid:false,message:'正在確認動作，畫面穩定後再提供觀察。',hints:[]};
  }
  snapshot(now){
    if(!this.latest||!Number.isFinite(now)||now<this.latest.capturedAt||now>=this.latest.expiresAt)
      return unknown('unavailable-or-stale','等待新的相機關節資料。',now);
    const copy=structuredClone(this.latest);copy.hints=copy.hints.map(h=>({...h,ttlMs:Math.max(0,h.expiresAt-now)}));return copy;
  }
}
