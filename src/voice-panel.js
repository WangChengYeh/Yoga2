import { LocalCoachAI } from './local-ai.js?v=0.9.0';
import { CourseNarrator } from './guidance.js?v=0.9.0';
import { VoiceSession } from './voice-session.js?v=0.9.0';
import { respondToUtterance } from './voice-intents.js?v=0.9.0';
import { createMouthMotion, mouthAmount } from './mouth.js?v=0.9.0';

export function setupVoicePanel({ getState, dispatch, getPose, createAI=options=>new LocalCoachAI(options) }) {
  const $=(id)=>document.getElementById(id);
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let speaking=false, mouth, speechStart=0,answering=false,narrator;
  const guidanceToggle=$('guidance-toggle'),guidanceStatus=$('guidance-status');
  const aiToggle=$('local-ai-toggle'),aiStatus=$('local-ai-status');
  const ai=createAI({onState:({phase,message})=>{aiStatus.textContent=message;aiToggle.checked=!['off','error'].includes(phase);}});
  const session=new VoiceSession({
    Recognition,Utterance:window.SpeechSynthesisUtterance,synthesis:window.speechSynthesis,
    audioEnabled:kind=>kind==='guidance'?guidanceToggle.checked:$('voice-output').checked,
    onText:(text)=>{
      $('voice-transcript').textContent=text;
      answering=true;
      try{const response=respondToUtterance(text,{state:getState(),pose:getPose(),now:performance.now()});
      if(response.action)dispatch(response.action);
      if(response.intent==='unknown'&&ai.ready){
        return ai.ask(text,getState()).then(reply=>reply||response.reply);
      }
      return response.reply;}finally{answering=false;}
    },
    onReply:(text,kind)=>{$('voice-reply').textContent=text;if(kind==='guidance')guidanceStatus.textContent=text;},
    onSpeechError:kind=>{if(kind==='guidance'){guidanceToggle.checked=false;narrator?.setEnabled(false,getState());guidanceStatus.textContent='帶練聲音未能播放，可重新勾選後按開始再試。';}},
    onState:({phase,message,active})=>{
      $('voice-toggle').textContent=active?'關閉聆聽':'開啟聆聽';
      $('voice-toggle').setAttribute('aria-pressed',active);
      $('voice-status').textContent=message;
      $('voice-card').dataset.phase=phase;
    },
    onSpeaking:(value)=>{speaking=value;speechStart=performance.now()/1000;if(!value)mouth?.setAmount(0);},
  });
  narrator=new CourseNarrator({speak:(text,options)=>session.speak(text,options),cancel:()=>session.cancelSpeech('guidance'),canSpeak:()=>!answering&&!document.hidden&&session.speechKind!=='reply',enabled:guidanceToggle.checked});
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){guidanceToggle.checked=false;guidanceToggle.disabled=true;narrator.setEnabled(false);guidanceStatus.textContent='此瀏覽器不支援聲音帶練，仍可觀看示範。';}
  aiToggle.addEventListener('change',()=>{if(aiToggle.checked)void ai.enable();else {session.stop(false);ai.disable();}});
  guidanceToggle.addEventListener('change',()=>{narrator.setEnabled(guidanceToggle.checked,getState());if(!guidanceToggle.checked)guidanceStatus.textContent='帶練語音已關閉。';});
  if(!Recognition){$('voice-toggle').disabled=true;$('voice-status').textContent='此瀏覽器不支援語音辨識，仍可使用按鈕或輸入問題。';}
  $('voice-toggle').addEventListener('click',()=>{if(session.wanted)session.stop();else session.enable();});
  $('voice-stop').addEventListener('click',()=>{guidanceToggle.checked=false;narrator.setEnabled(false);session.stop();guidanceStatus.textContent='帶練語音已關閉。';if(ai.phase==='thinking')ai.disable();});
  $('voice-output').addEventListener('change',()=>{if(!$('voice-output').checked)session.cancelSpeech('reply');});
  for(const button of document.querySelectorAll('[data-voice-text]'))button.addEventListener('click',()=>session.acceptText(button.dataset.voiceText));
  $('voice-form').addEventListener('submit',(event)=>{event.preventDefault();const text=$('voice-input').value.trim();if(text)session.acceptText(text);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){narrator.suspend();session.stop();ai.disable();}});
  window.addEventListener('pagehide',()=>{narrator.suspend();session.stop();ai.disable();});
  return {
    playbackChanged(action){if(!answering&&['seek','restart','repeat'].includes(action.type))session.cancelSpeech();narrator.update(getState(),action);},
    silence(){narrator.suspend();session.stop(false);},
    get diagnostics(){return {localAI:ai.phase,guidanceEnabled:guidanceToggle.checked,lastCue:narrator.lastKey,speaking,kind:session.speechKind||null,listening:session.wanted,status:$('voice-status').textContent,guidanceStatus:guidanceStatus.textContent};},
    attachModel(model){mouth=createMouthMotion(model);},
    update(now){mouth?.setAmount(mouthAmount(speaking,now/1000-speechStart));},
  };
}
