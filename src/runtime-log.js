import { APP_VERSION } from './release.js?v=0.9.34';
const KEY='yoga2.runtime.v1',LIMIT=32;
// Persist only allowlisted breadcrumbs, never error messages, stack, transcripts or images.
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,80}$/.test(value)?value:'unknown';
function entry(type,data,at){
 const out={at,type:token(type)};
 for(const key of ['phase','code','name','source','hint'])if(data?.[key]!=null)out[key]=token(data[key]);
 for(const key of ['line','column'])if(Number.isSafeInteger(data?.[key])&&data[key]>=0)out[key]=data[key];
 for(const key of ['selected','loading','active'])if(data&&key in data&&[null,1024,4096,16384].includes(data[key]))out[key]=data[key];
 for(const key of ['requestedFPS','negotiatedFPS','analysisFPS'])if(Number.isFinite(data?.[key])&&data[key]>=0&&data[key]<=240)out[key]=data[key];
 return out;
}
export function setupRuntimeLog({win=window,doc=document,getStorage=()=>win.localStorage,now=()=>new Date().toISOString()}={}){
 let storage,previous=null,events=[],active=!doc.hidden,disposed=false,persistence=false,lastFingerprint='';
 try{
  storage=getStorage();const raw=storage?.getItem(KEY);
  if(raw&&raw.length<=20000){const old=JSON.parse(raw);if(old.schema===1&&Array.isArray(old.events))previous={version:token(old.version),unclean:old.active===true,events:old.events.slice(-LIMIT).map(e=>entry(e.type,e,typeof e.at==='string'?e.at.slice(0,32):''))};}
 }catch{/* Storage denial/corrupt records cannot prevent app startup. */}
 function persist(){try{if(storage){storage.setItem(KEY,JSON.stringify({schema:1,version:APP_VERSION,active,events}));persistence=true;}}catch{persistence=false;}}
 function record(type,data={}){if(disposed)return;const fingerprint=JSON.stringify(entry(type,data,''));if(fingerprint===lastFingerprint)return;lastFingerprint=fingerprint;events=events.concat(entry(type,data,now())).slice(-LIMIT);persist();}
 function error(event){
  const value=event.error||event.reason,description=String(value?.message||event.message||value||'');
  const hint=/out of memory|failed to allocate|allocation failed/i.test(description)?'memory-allocation-text':/device.*lost/i.test(description)?'gpu-device-lost-text':/webgl/i.test(description)?'webgl-text':/network|fetch/i.test(description)?'network-text':'unknown';
  let source='unknown';try{const name=new URL(event.filename||'',win.location?.href).pathname.split('/').pop();if(/^[\w.-]+\.(?:m?js|wasm|html)$/.test(name))source=name;}catch{/* no source */}
  record(event.type==='unhandledrejection'?'unhandled-rejection':'js-error',{name:value?.name||'Error',hint,source,line:event.lineno,column:event.colno});
 }
 const hide=()=>{active=false;record('pagehide');};
 const show=()=>{active=!doc.hidden;record('pageshow');};
 const visibility=()=>{active=!doc.hidden;record(active?'foreground':'background');};
 win.addEventListener('error',error);win.addEventListener('unhandledrejection',error);win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);doc.addEventListener('visibilitychange',visibility);
 record('app-start');
 return {record,get diagnostics(){return {schema:1,persistence,previousSessionUnclean:Boolean(previous?.unclean),previous,current:{version:APP_VERSION,active,events:events.map(e=>({...e}))},note:'Unclean does not prove a crash. Browser/OS termination may leave no final event; no dump or image can be captured after termination.'};},dispose(){if(disposed)return;active=false;record('disposed');disposed=true;win.removeEventListener('error',error);win.removeEventListener('unhandledrejection',error);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show);doc.removeEventListener('visibilitychange',visibility);}};
}
