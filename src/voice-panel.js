import { VoiceSession } from './voice-session.js?v=0.6.2';
import { respondToUtterance } from './voice-intents.js?v=0.6.2';
import { createMouthMotion, mouthAmount } from './mouth.js?v=0.6.2';

export function setupVoicePanel({ getState, dispatch, getPose }) {
  const $=(id)=>document.getElementById(id);
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let speaking=false, mouth, speechStart=0;
  const session=new VoiceSession({
    Recognition,Utterance:window.SpeechSynthesisUtterance,synthesis:window.speechSynthesis,
    audioEnabled:()=>$('voice-output').checked,
    onText:(text)=>{
      $('voice-transcript').textContent=text;
      const response=respondToUtterance(text,{state:getState(),pose:getPose(),now:performance.now()});
      if(response.action)dispatch(response.action);
      return response.reply;
    },
    onReply:(text)=>{$('voice-reply').textContent=text;},
    onState:({phase,message,active})=>{
      $('voice-toggle').textContent=active?'關閉聆聽':'開啟語音';
      $('voice-toggle').setAttribute('aria-pressed',active);
      $('voice-status').textContent=message;
      $('voice-card').dataset.phase=phase;
    },
    onSpeaking:(value)=>{speaking=value;speechStart=performance.now()/1000;if(!value)mouth?.setAmount(0);},
  });
  if(!Recognition){$('voice-toggle').disabled=true;$('voice-status').textContent='此瀏覽器不支援語音辨識，仍可使用按鈕或輸入問題。';}
  $('voice-toggle').addEventListener('click',()=>{if(session.wanted)session.stop();else session.enable();});
  $('voice-stop').addEventListener('click',()=>session.stop());
  $('voice-output').addEventListener('change',()=>{if(!$('voice-output').checked)session.stop();});
  for(const button of document.querySelectorAll('[data-voice-text]'))button.addEventListener('click',()=>session.acceptText(button.dataset.voiceText));
  $('voice-form').addEventListener('submit',(event)=>{event.preventDefault();const text=$('voice-input').value.trim();if(text)session.acceptText(text);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)session.stop();});
  window.addEventListener('pagehide',()=>session.stop());
  return {
    attachModel(model){mouth=createMouthMotion(model);},
    update(now){mouth?.setAmount(mouthAmount(speaking,now/1000-speechStart));},
  };
}
