export const DEFAULT_CONTEXT_WINDOW=1024;
export const CONTEXT_WINDOWS=[1024,4096,16384];
export const normalizeContextWindow=value=>CONTEXT_WINDOWS.includes(Number(value))?Number(value):DEFAULT_CONTEXT_WINDOW;
const KEY='yoga2.ai.context-window.v2';
export function contextPreference(getStorage=()=>window.localStorage){
 let storage,value=DEFAULT_CONTEXT_WINDOW,persistent=false;
 try{storage=getStorage();value=normalizeContextWindow(storage?.getItem(KEY));persistent=Boolean(storage);}catch{/* Storage denial cannot block AI. */}
 return {get value(){return value;},get persistent(){return persistent;},set(next){value=normalizeContextWindow(next);try{storage?.setItem(KEY,String(value));persistent=Boolean(storage);}catch{persistent=false;}return value;}};
}

export const contextLabel=value=>`${normalizeContextWindow(value)/1024}K`;
