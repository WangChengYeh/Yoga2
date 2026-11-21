// Bounded, in-memory diagnostic timeline. No audio, images or user text.
import { feedbackWindow } from './pose-rules.js?v=0.9.18';
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,80}$/.test(value)?value:'unknown';
const round=value=>Number.isFinite(value)?Math.round(value*1000)/1000:null;
const JOINTS=[11,12,13,14,15,16,23,24,25,26,27,28,31,32];
export function createActivityLog({now=()=>new Date().toISOString(),clock=()=>performance.now(),getState=()=>({})}={}){
 let events=[],poses=[],sequence=0,lastSample=-Infinity,lastPhase='';
 const context=()=>{const state=getState();return {courseTime:round(state.time),playing:Boolean(state.playing),speed:round(state.speed)};};
 const stamp=()=>({sequence:++sequence,at:now(),elapsedMs:round(clock()),...context()});
 function record(type,data={}){const event={...stamp(),type:token(type)};for(const key of ['phase','code','source','control','value','lesson'])if(data[key]!=null)event[key]=token(String(data[key]));for(const key of ['selected','loading','active'])if([4096,16384].includes(data[key]))event[key]=data[key];events.push(event);if(events.length>256)events.shift();}
 function course(frame){const phase=`${frame.lesson.id}:${feedbackWindow(frame)}`;if(phase===lastPhase)return;lastPhase=phase;record('course-phase',{lesson:frame.lesson.id,phase:feedbackWindow(frame)});}
 function pose(data,observation,stable){const time=clock();if(time-lastSample<1000)return;lastSample=time;
  // Only visible body joints; exclude facial landmarks and never invent hidden joints.
  const points=data.landmarks?.length===1?data.landmarks[0]:null;
  const joints=points?JOINTS.flatMap(index=>{const p=points[index];return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.visibility>=.65&&(p.presence===undefined||p.presence>=.6)?[{index,x:round(p.x),y:round(p.y),visibility:round(p.visibility)}]:[];}):[];
  poses.push({...stamp(),type:'human-pose',capturedAtMs:round(data.capturedAt),lesson:token(data.context?.frame?.lesson?.id),phase:data.context?.frame?feedbackWindow(data.context.frame):'unknown',people:data.landmarks?.length||0,observation:token(observation.code),stable:token(stable.code),valid:Boolean(observation.valid),joints});if(poses.length>120)poses.shift();
 }
 return {record,course,pose,get diagnostics(){return {schema:1,sampleIntervalMs:1000,limits:{events:256,poses:120},storage:'memory-only',note:'Recent sampled image-space body joints, not video or a safety assessment. Missing joints are unknown. UTC timestamps and elapsedMs align with voice logs; camera-off/stale events mark gaps. Cleared on reload.',events:structuredClone(events),poses:structuredClone(poses)};}};
}
const CONTROLS=new Set(['camera-toggle','stage-play','play','restart','seek','quality','reset-view','ai-skeleton-toggle','coach-skeleton-toggle','voice-toggle','voice-output','voice-stop','media-start','coach-hello','audio-retry','local-ai-retry','local-ai-redownload','guidance-toggle','ai-context-window','fullscreen-toggle']);
export function trackActivityControls({doc=document,log}){
 const handle=event=>{const el=event.target?.closest?.('button,input,select');if(!el||el.disabled)return;
  if(event.type==='click'&&el.tagName!=='BUTTON')return;if(event.type==='change'&&el.tagName==='BUTTON')return;
  let control=el.id,value;
  if(el.dataset?.view){control='view';value=el.dataset.view;}
  else if(el.dataset?.speed){control='speed';value=el.dataset.speed;}
  else if(el.dataset?.voiceText){const commands={'慢一點':'slower','再一次':'repeat','暫停':'pause','繼續':'resume'};if(!commands[el.dataset.voiceText])return;control='voice-command';value=commands[el.dataset.voiceText];}
  else if(el.dataset?.lessonIndex){control='lesson';value=el.dataset.lessonIndex;}
  else if(!CONTROLS.has(control))return;
  if(el.type==='checkbox')value=String(Boolean(el.checked));
  else if(control==='ai-context-window')value=String(Number(el.value));
  else if(control==='seek')value=String(Number(el.value));
  log.record('control',{control,value});
 };doc.addEventListener('click',handle,true);doc.addEventListener('change',handle,true);
 return ()=>{doc.removeEventListener('click',handle,true);doc.removeEventListener('change',handle,true);};
}
