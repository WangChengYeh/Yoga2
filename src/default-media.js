// One automatic attempt per visit. User clicks retry only inactive inputs;
// backgrounding never silently reopens inputs the user has already closed.
export function setupDefaultMedia({document,camera,voice,onError=()=>{}}){
 const audioRetry=document.getElementById('audio-retry'),hello=document.getElementById('coach-hello'),root=document.getElementById('media-startup'),button=document.getElementById('media-start'),status=document.getElementById('media-start-status');
 let attempted=false,disposed=false;
 function refresh(){
  if(disposed)return;
  const c=camera.mediaStatus,v=voice.mediaStatus;
  audioRetry.hidden=!v.audioRetry;audioRetry.textContent=v.needsGesture?(v.activationWelcome?'和 Luna 打招呼':'開啟聲音'):'重試聲音';
  hello.hidden=!v.welcomePending||Boolean(v.audioRetry);hello.disabled=Boolean(v.welcoming||v.welcomePreparing);hello.textContent=v.welcomePreparing?'Luna 正在準備招呼…':v.welcoming?'Luna 正在打招呼…':'和 Luna 打招呼';
  root.hidden=Boolean(c.open&&v.active&&!v.outputBlocked);
  status.textContent=[c.open?'相機已開啟':c.phase==='requesting'?'等待相機權限':c.phase==='loading'?'相機準備中':'相機尚未啟用',v.active?'語音輸入已開啟':v.phase==='starting'?'語音等待啟用':v.phase==='unsupported'?'此瀏覽器不支援語音輸入':'語音輸入尚未啟用',...(v.outputBlocked?['語音輸出待啟用']:[])].join(' · ');
  button.textContent='啟用相機與語音';
 }
 function prime(event){if(event?.target?.closest?.('#media-start, #coach-hello, #audio-retry, #voice-toggle, #voice-stop, #voice-output, #guidance-toggle, #stage-play, #play, #restart, [data-voice-text], #voice-form'))return;if(disposed||document.hidden)return;try{if(event)voice.prepareAudio?.();else voice.primeAudio?.();}catch(error){onError(error);}}
 function start(event){
  if(disposed||document.hidden)return;
  const first=!attempted;attempted=true;
  // Both calls run in the original click stack for browsers requiring activation.
  // Do not await camera models before asking to start speech recognition.
  try{if(!camera.mediaStatus.open&&!['requesting','loading'].includes(camera.mediaStatus.phase))Promise.resolve(camera.start()).catch(onError);}catch(error){onError(error);}
  try{if(!voice.mediaStatus.active&&voice.mediaStatus.phase!=='starting')voice.enableListening();}catch(error){onError(error);}
  if(event)prime();
  if(first){
   try{voice.enableAI?.();}catch(error){onError(error);}
  }
  refresh();
 }
 document.addEventListener('click',prime,{capture:true});
 button.addEventListener('click',start);
 hello.addEventListener('click',start);
 audioRetry.addEventListener('click',()=>{if(!disposed&&!document.hidden)voice.primeAudio?.();refresh();});
 document.addEventListener('visibilitychange',()=>{if(!attempted&&!document.hidden)start();else refresh();});
 refresh();start();
 return {refresh,start,dispose(){disposed=true;},get attempted(){return attempted;}};
}
