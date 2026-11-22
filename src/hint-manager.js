// Shared, bounded state for display and future speech routing. No LLM/TTS calls.
export class HintManager {
 constructor({now=()=>performance.now(),capacity=16}={}){this.now=now;this.capacity=Math.max(1,Math.min(32,capacity));this.entries=new Map();this.scope=null;this.revision=null;this.generation=0;this.current=null;this.counts={displayed:0,replaced:0,expired:0,suppressed:0,numericUpdates:0};}
 reset(){this.entries.clear();this.current=null;this.scope=null;this.revision=null;this.generation++;}
 setScope(scope){if(this.scope!==scope){this.reset();this.scope=scope;}return this.token;}
 get token(){return {scope:this.scope,generation:this.generation};}
 publish(hint,token=this.token){
  const now=this.now();
  if(token?.scope!==this.scope||token?.generation!==this.generation||!hint?.id||typeof hint.message!=='string'||!Number.isFinite(hint.expiresAt)||hint.expiresAt<=now){this.counts.suppressed++;return false;}
  const source=hint.source||'supplement',key=`${source}:${hint.id}`,old=this.entries.get(key);
  if(!old&&this.entries.size>=this.capacity){this.counts.suppressed++;return false;}
  this.entries.set(key,{id:String(hint.id).slice(0,120),code:String(hint.code||hint.id).slice(0,120),source,scope:this.scope,message:hint.message.slice(0,240),kind:hint.kind||'info',priority:Math.max(0,Math.min(source==='llm'||source==='supplement'?40:100,hint.priority||0)),timestamp:now,capturedAt:Number.isFinite(hint.capturedAt)?hint.capturedAt:null,expiresAt:Math.min(hint.expiresAt,now+10000),values:hint.values||null});return true;
 }
 acceptEvaluation(value,{scope}={}){
  this.setScope(scope);
  const revision=value.status==='correction'?(value.hints||[]).map(h=>h.code).sort().join('|'):value.code;
  if(this.revision!==null&&this.revision!==revision){this.generation++;for(const [key,hint] of this.entries)if(hint.source!=='evaluation')this.entries.delete(key);}
  this.revision=revision;
  for(const [key,hint] of this.entries)if(hint.source==='evaluation')this.entries.delete(key);
  const expiresAt=value.expiresAt??this.now()+1500;
  if(value.status==='correction'&&value.valid){for(const hint of value.hints||[])this.publish({id:hint.code,source:'evaluation',code:hint.code,message:hint.message,kind:'hint',priority:hint.code==='torso-direction'?80:hint.code.includes('elbow')?70:60,expiresAt:hint.expiresAt,capturedAt:value.capturedAt,values:{measured:hint.measured,target:hint.target,error:hint.error,confidence:hint.confidence}});}
  else {
   // Tracking loss or a new candidate invalidates delayed explanatory advice.
   if(!value.valid)for(const [key,hint] of this.entries)if(hint.source!=='evaluation')this.entries.delete(key);
   this.publish({id:value.code,code:value.code,source:'evaluation',message:value.message,kind:value.kind,capturedAt:value.capturedAt,priority:value.status==='unknown'?100:value.status==='stabilizing'?90:value.status==='matched'?20:30,expiresAt});
  }
  return this.snapshot();
 }
 snapshot(){
  const now=this.now();for(const [key,hint] of this.entries)if(hint.expiresAt<=now){this.entries.delete(key);this.counts.expired++;}
  const sorted=[...this.entries.values()].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  const prior=this.current,candidate=sorted.find(h=>h.id===prior?.id&&h.source===prior?.source&&h.priority===sorted[0]?.priority)||sorted[0]||null;
  if(candidate){if(!prior)this.counts.displayed++;else if(prior.id!==candidate.id||prior.source!==candidate.source||prior.message!==candidate.message)this.counts.replaced++;else if(JSON.stringify(prior.values)!==JSON.stringify(candidate.values))this.counts.numericUpdates++;}
  this.current=candidate?structuredClone(candidate):null;
  return candidate?{...structuredClone(candidate),ttlMs:Math.max(0,candidate.expiresAt-now),context:this.token,...(sorted.find(h=>h.source==='llm'&&h.code===candidate.code)?{supplement:structuredClone(sorted.find(h=>h.source==='llm'&&h.code===candidate.code))}:{})}:null;
 }
 // Speech consumes the same current context, with its own cadence in M3 #4.
 get speechCandidate(){return this.snapshot();}
 get diagnostics(){return {...this.counts,pending:this.entries.size,capacity:this.capacity,scope:this.scope,generation:this.generation,current:this.current?{id:this.current.id,source:this.current.source,expiresAt:this.current.expiresAt}:null};}
}
