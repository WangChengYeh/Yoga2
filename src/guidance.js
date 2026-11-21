import { COURSE_DURATION, courseFrame, lessonStart } from './course.js?v=0.9.17';

// Keep cues brief; a newer phase replaces an older automatic cue. These describe the lesson,
// never claim the camera verified a person's posture or safety.
export const GUIDANCE=Object.freeze({
  reach:Object.freeze([
    [0,'站姿上舉伸展，雙手慢慢舉高。'],
    [6,'肩膀放鬆，保持自然呼吸。'],
    [10,'慢慢放下，回到身側。'],
  ]),
  side:Object.freeze([
    [0,'左右側伸展，雙手舉高。'],
    [4,'跟教練側彎，雙腳穩住。'],
    [8,'腰側拉長，保持自然呼吸。'],
    [12,'慢慢回到中間。'],
    [16,'換邊，輕輕側彎。'],
    [20,'胸口朝前，不要憋氣。'],
    [24,'慢慢回到中間。'],
    [28,'雙手放下，回到站姿。'],
  ]),
  open:Object.freeze([
    [0,'展臂開胸，向兩側打開。'],
    [6,'肩膀放鬆，胸口輕輕打開。'],
    [10,'自然呼吸，不要聳肩。'],
    [14,'慢慢收手，回到身側。'],
  ]),
});
export const GUIDANCE_TIPS=Object.freeze({
  reach:'雙腳站穩，手臂慢慢上舉。肩膀放鬆，保持自然呼吸，不必勉強舉到最高。',
  side:'先站穩，雙臂上舉，再跟教練輕輕側彎。胸口朝前，不要往前倒，也不要憋氣；回到中間後再換邊。',
  open:'雙臂向兩側打開，肩膀放鬆。胸口輕輕舒展，不要聳肩或勉強向後拉。',
});
export function guidanceAt(time){
  const frame=courseFrame(time);
  if(frame.complete)return {key:'complete',at:COURSE_DURATION,text:'完成了，放鬆肩膀，休息一下。'};
  const cues=GUIDANCE[frame.lesson.id];let cue=cues[0];
  for(const item of cues)if(item[0]<=frame.localTime)cue=item;
  return {key:`${frame.lesson.id}:${cue[0]}`,at:lessonStart(frame.index)+cue[0],text:cue[1]};
}
export class CourseNarrator {
  constructor({speak=()=>{},cancel=()=>{},canSpeak=()=>true,enabled=true}={}){Object.assign(this,{speak,cancel,canSpeak,enabled});this.running=false;this.lastTime=0;this.lastKey=null;}
  suspend(){this.cancel();this.running=false;this.lastKey=null;}
  setEnabled(value,state){this.enabled=Boolean(value);this.suspend();if(this.enabled&&state)this.update(state,{type:'enable'});}
  update(state,{type='tick'}={}){
    if(!this.enabled||!state.ready||!Number.isFinite(state.time)){if(this.running)this.suspend();return;}
    const wasRunning=this.running,previousTime=this.lastTime;
    this.lastTime=state.time;
    if(!state.playing){
      if(wasRunning||type==='seek')this.cancel();this.running=false;
      if(type==='seek')this.lastKey=null;
      if(wasRunning&&type==='tick'&&state.time>=COURSE_DURATION&&previousTime<COURSE_DURATION){
        const cue=guidanceAt(COURSE_DURATION);this.lastKey=cue.key;
        if(this.canSpeak())this.speak(cue.text,{kind:'guidance',rate:1});
      }
      return;
    }
    const cue=guidanceAt(state.time),fresh=!wasRunning||['seek','restart','repeat','enable'].includes(type)||state.time<previousTime||cue.key!==this.lastKey;
    this.running=true;
    if(!fresh)return;
    // Consume skipped cues too: after a question or a seek, do not queue a
    // backlog of directions which no longer match the coach's current pose.
    this.lastKey=cue.key;
    if(this.canSpeak())this.speak(cue.text,{kind:'guidance',rate:Math.min(1.2,.95+Math.max(0,(state.speed||1)-1)*.5)});
  }
}
