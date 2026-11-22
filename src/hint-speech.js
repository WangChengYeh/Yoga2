// Corrections use local phrases first. One aggregate/one optional explanation;
// no FIFO, no per-frame LLM, no waiting for speech in the display pipeline.
export function hintSpeechPreferences(getStorage=()=>window.localStorage){
 let storage,value={intervalMs:15000,cooldownMs:20000};
 const normalize=v=>({intervalMs:[10000,15000,20000,30000].includes(Number(v.intervalMs))?Number(v.intervalMs):15000,cooldownMs:[20000,30000,60000].includes(Number(v.cooldownMs))?Number(v.cooldownMs):20000});
 try{storage=getStorage();value=normalize(JSON.parse(storage.getItem('yoga2.hint-speech.v1')||'{}'));}catch{}
 return {get value(){return {...value};},set(patch){value=normalize({...value,...patch});try{storage?.setItem('yoga2.hint-speech.v1',JSON.stringify(value));}catch{}return this.value;}};
}
export function validHintExplanation(text){
 const s=String(text||'').trim();
 if(s.length<4||s.length>64||/[\n{}<>`0-9]|診斷|治療|疼痛|姿勢正確|你做得|下蹲|跪下|跳躍|後仰|躺下|扭轉|屏息|憋住|換邊|左|右|上舉|放下|往後|向後/.test(s))return null;
 return s;
}
const key=h=>h?`${h.context?.scope}:${h.context?.generation}:${h.id}`:null;
export class HintSpeechRouter{
 constructor({getHint,enabled=()=>true,canSpeak=()=>true,canExplain=()=>true,speak,cancelSpeech=()=>{},ai,publish=()=>false,getState,getContext=()=>null,getPolicy=()=>({intervalMs:15000,cooldownMs:20000}),now=()=>performance.now(),setTimer=(f,ms)=>setTimeout(f,ms),clearTimer=id=>clearTimeout(id)}){
  Object.assign(this,{getHint,enabled,canSpeak,canExplain,speak,cancelSpeech,ai,publish,getState,getContext,getPolicy,now,setTimer,clearTimer});this.aggregate=null;this.flight=null;this.output=null;this.pendingSpeech=null;this.lastSpeech=-Infinity;this.lastLLM=-Infinity;this.timer=null;this.serial=0;
  this.counts={generated:0,merged:0,dropped:0,llmTriggered:0,llmSkipped:0,ttsSubmitted:0,ttsPlayed:0,ttsDropped:0,lastLLMLatencyMs:null,lastSpeechLatencyMs:null};
 }
 start(){if(this.timer!==null)return;const run=()=>{this.timer=null;this.tick();this.start();};this.timer=this.setTimer(run,250);this.timer?.unref?.();}
 stop(){this.clearTimer(this.timer);this.timer=null;this.invalidate();}
 invalidate(){this.serial++;if(this.flight&&!this.flight.cancelled){this.flight.cancelled=true;this.ai?.cancelGuidance?.();}this.aggregate=null;this.pendingSpeech=null;this.cancelSpeech();if(this.output){this.counts.ttsDropped++;}this.output=null;}
 current(k){const h=this.getHint();return this.enabled()&&h?.kind==='hint'&&h.expiresAt>this.now()&&key(h)===k?h:null;}
 tick(){
  const now=this.now(),h=this.getHint(),k=key(h);
  if(!this.enabled()||!h||h.kind!=='hint'||h.expiresAt<=now){if(this.aggregate||this.flight||this.output)this.invalidate();return;}
  if(this.aggregate?.key!==k){this.invalidate();this.aggregate={key:k,id:h.id,scope:h.context?.scope,since:now,last:now,count:0,errorMin:Infinity,errorMax:-Infinity,localSpoken:false,explained:false};}
  const a=this.aggregate;
  // Count source observations, not 4-Hz polling/render callbacks.
  if(a.timestamp!==h.timestamp){a.timestamp=h.timestamp;a.count++;a.last=now;this.counts.generated++;if(a.count>1)this.counts.merged++;const error=h.values?.error;if(Number.isFinite(error)){a.errorMin=Math.min(a.errorMin,error);a.errorMax=Math.max(a.errorMax,error);}}
  if(this.output&&this.output.key!==k){this.cancelSpeech();this.output=null;this.counts.ttsDropped++;}
  const policy=this.getPolicy();
  if(this.canSpeak()&&now-this.lastSpeech>=policy.intervalMs){
   const pending=this.pendingSpeech?.key===k?this.pendingSpeech:null;
   if(pending||!a.localSpoken){const message=pending?.text||h.message;
    this.output={key:k,started:false};
    if(this.speak(message)!==false){this.lastSpeech=now;this.counts.ttsSubmitted++;this.counts.lastSpeechLatencyMs=Math.max(0,now-h.timestamp);a.localSpoken=true;this.pendingSpeech=null;}
    else {this.output=null;this.counts.ttsDropped++;}
   }
  }
  if(!a.localSpoken||a.explained||a.count<3||now-a.since<3000||this.flight||!this.canExplain())return;
  if(!this.ai?.ready||this.ai.pending||typeof this.ai.explainHint!=='function'||now-this.lastLLM<policy.cooldownMs){this.counts.llmSkipped++;return;}
  a.explained=true;this.lastLLM=now;this.counts.llmTriggered++;
  const flight={key:k,serial:this.serial,started:now};this.flight=flight;
  const stats={samples:a.count,durationMs:now-a.since,errorMin:Number.isFinite(a.errorMin)?a.errorMin:null,errorMax:Number.isFinite(a.errorMax)?a.errorMax:null};
  let request;try{request=this.ai.explainHint(h,stats,this.getState(),this.getContext(),this.getContext);}catch{this.flight=null;this.counts.dropped++;return;}
  Promise.resolve(request).then(text=>{
   if(this.flight!==flight||this.serial!==flight.serial||!this.current(k)){this.counts.dropped++;return;}
   this.counts.lastLLMLatencyMs=this.now()-flight.started;const sentence=validHintExplanation(text);if(!sentence){this.counts.dropped++;return;}
   const current=this.current(k);if(!current){this.counts.dropped++;return;}
   // Same semantic token, but use a fresh observation's expiry; never extend an
   // old capture TTL. A changed/corrected pose invalidates the entire request.
   if(this.publish({id:`explanation:${h.id}`,code:h.code,source:'llm',priority:5,message:sentence,kind:'info',expiresAt:current.expiresAt},current.context))this.pendingSpeech={key:k,text:sentence};
  },()=>{this.counts.dropped++;}).finally(()=>{if(this.flight===flight)this.flight=null;});
 }
 speechStarted(){if(this.output&&!this.output.started){this.output.started=true;this.counts.ttsPlayed++;}}
 speechEnded(error=false){if(error)this.counts.ttsDropped++;this.output=null;}
 get diagnostics(){return {...this.counts,pendingLLM:Boolean(this.flight),pendingSpeech:Boolean(this.pendingSpeech),queueSize:0,aggregate:this.aggregate?{id:this.aggregate.id,scope:this.aggregate.scope,samples:this.aggregate.count,durationMs:this.now()-this.aggregate.since,errorMin:Number.isFinite(this.aggregate.errorMin)?this.aggregate.errorMin:null,errorMax:Number.isFinite(this.aggregate.errorMax)?this.aggregate.errorMax:null}:null,policy:this.getPolicy()};}
}
