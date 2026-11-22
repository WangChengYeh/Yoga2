import { sensorText } from './coach-context.js?v=0.9.31';
import { GUIDANCE, guidanceAt } from './guidance.js?v=0.9.31';
import { LESSONS, COURSE_DURATION, courseFrame, lessonStart } from './course.js?v=0.9.31';
const cues=LESSONS.flatMap((lesson,index)=>GUIDANCE[lesson.id].map(([time])=>guidanceAt(lessonStart(index)+time))).concat(guidanceAt(COURSE_DURATION));
export const nextGuidance=time=>cues.find(cue=>cue.at>time);
export function guidanceMessages(cue,state,context=null,contextWindow=4096){
 const frame=courseFrame(cue.at);
 return [{role:'system',content:'你是瑜伽教練 Luna。只輸出一句繁體中文帶練口令，最多 24 個中文字，不要解釋、引號、清單或自我介紹。保留提供的核心口令意思，不得換動作、提前換邊或新增方向。附有當下感知及骨架；預備口令的目標階段可能在未來，不得把當下骨架當成未來真人動作。不宣稱姿勢正確，不提供醫療建議。'},
 {role:'user',content:`動作：${frame.lesson.name}。階段：${frame.complete?'完成休息':frame.label}。核心口令：${cue.text}。請用溫柔自然的一句話帶練。\n${sensorText(context,contextWindow)}`}];
}
const required={
 'reach:0':/上舉|舉高|抬高|舉起|往上/,'reach:6':/呼吸/,'reach:10':/放下|放回|收回/,
 'side:0':/上舉|舉高|抬高|舉起|往上/,'side:4':/側彎|側伸|側身|彎身/,'side:8':/呼吸/,'side:12':/中間|回正|直立/,'side:16':/換邊|另一側|另外一側/,'side:20':/呼吸|憋氣/,'side:24':/中間|回正|直立/,'side:28':/放下|放回|收回/,
 'open:0':/打開|展臂|展開|開胸/,'open:6':/打開|展臂|展開|胸口/,'open:10':/呼吸|聳肩/,'open:14':/收手|收回|放回|放下/,'complete':/完成|休息|放鬆/,
};
export function validGuidance(text,cue){
 const value=String(text||'').trim();
 if(value.length<4||value.length>48||/[{}<>`\n]|作為|诊断|診斷|治療|治愈|疼痛|你做得|姿勢正確/.test(value)||!required[cue.key]?.test(value))return null;
 // Only the switch-side phase may introduce switching sides. Do not contradict raise/lower phases.
 if(cue.key!=='side:16'&&/換邊|另一側|另外一側/.test(value))return null;
 if(['reach:0','side:0'].includes(cue.key)&&/放下|收回|側彎/.test(value))return null;
 if(['reach:10','side:28','open:14'].includes(cue.key)&&/上舉|舉高|抬高/.test(value))return null;
 const actions={raise:/上舉|舉高|抬高|舉起/,lower:/放下|收手|收回|放回/,side:/側彎|側伸|側身|彎身/,center:/回正|回到中間|回到站姿/,open:/展臂|打開|開胸|展開/};
 const allowed={ 'reach:0':['raise'],'reach:6':[],'reach:10':['lower','center'],'side:0':['raise'],'side:4':['side'],'side:8':[],'side:12':['center'],'side:16':['side'],'side:20':[],'side:24':['center'],'side:28':['lower','center'],'open:0':['open'],'open:6':['open'],'open:10':[],'open:14':['lower','center'],complete:[] }[cue.key]||[];
 if(Object.entries(actions).some(([name,pattern])=>pattern.test(value)&&!allowed.includes(name)))return null;
 if(/下蹲|蹲下|跳躍|弓箭步|躺下|跪下|扭轉|後仰|屏息|憋住/.test(value))return null;
 return value;
}

// Cache at most one sentence per course phase. No generated text survives AI off/reload.
export class AIGuidance {
 constructor({ai,getState,getContext=()=>null,speak,canSpeak=()=>true,enabled=()=>true,active=()=>true,onSource=()=>{},setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id)}){
  Object.assign(this,{ai,getState,getContext,speak,canSpeak,enabled,active,onSource,setTimer,clearTimer});this.cache=new Map();this.attempted=new Set();this.serial=0;
 }
 usable(){return this.enabled()&&typeof this.ai.guide==='function'&&(this.ai.ready||this.ai.pending?.kind==='guidance');}
 current(key){const state=this.getState();return this.active()&&this.canSpeak()&&guidanceAt(state.time).key===key&&(state.playing||state.time>=COURSE_DURATION);}
 clearWaiting(){if(this.timer)this.clearTimer(this.timer);this.timer=null;this.waiting=null;}
 cancel({clearCache=false}={}){++this.serial;this.clearWaiting();if(this.flight)this.attempted.delete(this.flight.key);this.flight=null;this.ai.cancelGuidance?.();if(clearCache){this.cache.clear();this.attempted.clear();}}
 request(cue){
  if(this.flight||!this.ai.ready||this.cache.has(cue.key)||this.attempted.has(cue.key))return;
  this.attempted.add(cue.key);
  const flight={key:cue.key,serial:this.serial};this.flight=flight;
  let result;try{result=this.ai.guide(cue,this.getState(),this.getContext(),this.getContext);}catch{this.flight=null;return;}
  Promise.resolve(result).then(text=>{
   if(this.flight!==flight||flight.serial!==this.serial)return;
   const sentence=validGuidance(text,cue);if(sentence)this.cache.set(cue.key,sentence);
   if(this.waiting?.key===cue.key&&this.current(cue.key))this.deliver(sentence||cue.text,sentence?'AI':'基本口令');
  },()=>{if(this.flight===flight&&this.waiting?.key===cue.key&&this.current(cue.key))this.deliver(cue.text,'基本口令');})
  .finally(()=>{if(this.flight===flight)this.flight=null;});
 }
 deliver(text,source){const options=this.waiting?.options;this.clearWaiting();this.onSource(source);return this.speak(text,options);}
 say(fallback,options){
  this.clearWaiting();const state=this.getState(),cue=guidanceAt(state.time);
  if(!this.usable()){this.onSource('基本口令');return this.speak(fallback,options);}
  const sentence=this.cache.get(cue.key);if(sentence){this.onSource('AI');return this.speak(sentence,options);}
  if(this.attempted.has(cue.key)&&this.flight?.key!==cue.key){this.onSource('基本口令');return this.speak(fallback,options);}
  if(this.flight&&this.flight.key!==cue.key)this.cancel();
  this.waiting={key:cue.key,options};this.request(cue);
  const remaining=(nextGuidance(state.time)?.at??(COURSE_DURATION+4))-state.time;
  const wait=Math.max(0,Math.min(3000,remaining/(state.speed||1)*1000-500));
  this.timer=this.setTimer(()=>{
   if(!this.current(cue.key)){this.clearWaiting();return;}
   this.ai.cancelGuidance?.();this.flight=null;++this.serial;this.deliver(fallback,'基本口令');
  },wait);return true;
 }
 update(){
  if(!this.usable()||!this.getState().ready||!this.canSpeak())return;
  const state=this.getState(),cue=guidanceAt(state.time);
  const target=this.waiting?cue:(!state.playing&&!this.cache.has(cue.key)?cue:nextGuidance(state.time));
  if(target)this.request(target);
 }
}
