export const CAMERA_FPS=[5,10,15,20,24,30,60],ANALYSIS_FPS=[1,2,3,5,10,15];
const valid=(v,list,fallback)=>list.includes(Number(v))?Number(v):fallback;
export function cameraPreferences(getStorage=()=>window.localStorage){
 let storage,cameraFPS=20,analysisFPS=3,persistent=false;
 try{storage=getStorage();const old=JSON.parse(storage?.getItem('yoga2.camera.v1')||'{}');cameraFPS=valid(old.cameraFPS,CAMERA_FPS,20);analysisFPS=valid(old.analysisFPS,ANALYSIS_FPS,3);persistent=Boolean(storage);}catch{/* Optional */}
 return {get value(){return {cameraFPS,analysisFPS,persistent};},set(values){cameraFPS=valid(values.cameraFPS??cameraFPS,CAMERA_FPS,20);analysisFPS=valid(values.analysisFPS??analysisFPS,ANALYSIS_FPS,3);try{storage?.setItem('yoga2.camera.v1',JSON.stringify({cameraFPS,analysisFPS}));persistent=Boolean(storage);}catch{persistent=false;}return this.value;}};
}
