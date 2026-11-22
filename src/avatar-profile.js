// Persist only a bounded derived face crop and parameters, never the source file.
export const PROFILE_SCHEMA=1,FACE_SIZE=512,MAX_PHOTO_BYTES=12*1024*1024;
const clamp=(v,lo,hi,fallback)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Number(v))):fallback;
const color=(v,fallback)=>/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
export function normalizeAppearance(value={}){
 return {headWidth:clamp(value.headWidth,.8,1.2,1),headHeight:clamp(value.headHeight,.85,1.15,1),skin:color(value.skin,'#c99775'),hair:color(value.hair,'#242626'),shirt:color(value.shirt,'#365d72'),hairStyle:['short','bald','cap'].includes(value.hairStyle)?value.hairStyle:'short'};
}
export function cropRect(width,height,{zoom=1,x=.5,y=.5}={}){
 const z=clamp(zoom,1,5,1),size=Math.min(width,height)/z;
 return {x:clamp(x,0,1,.5)*(width-size),y:clamp(y,0,1,.5)*(height-size),size};
}
export function validatePhoto(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<=0||file.size>MAX_PHOTO_BYTES)throw new Error('請選擇 12 MB 以內的 JPEG、PNG 或 WebP 照片。');}
export function validateProfile(profile){
 if(profile?.schema===2){
  if(!AVATAR_VIEWS.every(k=>profile.views?.[k] instanceof Blob&&profile.views[k].type==='image/jpeg'&&profile.views[k].size>0&&profile.views[k].size<=1024*1024))throw new Error('請提供正面、側面與背面三張圖。');
  return {schema:2,template:'luna-v1',referenceArmDeg:referenceAngle(profile.referenceArmDeg),views:Object.fromEntries(AVATAR_VIEWS.map(k=>[k,profile.views[k]]))};
 }
 if(profile?.schema!==PROFILE_SCHEMA||!(profile.face instanceof Blob)||profile.face.type!=='image/jpeg'||profile.face.size<=0||profile.face.size>512*1024)throw new Error('個人 Avatar 資料無法使用，請重新建立。');
 return {schema:PROFILE_SCHEMA,appearance:normalizeAppearance(profile.appearance),face:profile.face};
}
export function createAvatarStore({indexedDB=globalThis.indexedDB}={}){
 let dbPromise=null;
 const open=()=>{if(!indexedDB)return Promise.reject(new Error('此瀏覽器無法保存個人 Avatar，可只在本次使用。'));if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{let failed=false;const request=indexedDB.open('yoga2.avatar.v1',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('profiles'))request.result.createObjectStore('profiles');};request.onsuccess=()=>{const db=request.result;if(failed){db.close();return;}db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};request.onerror=()=>{dbPromise=null;reject(new Error('個人 Avatar 儲存無法開啟。'));};request.onblocked=()=>{failed=true;dbPromise=null;reject(new Error('請關閉其他 Yoga2 分頁後重試保存。'));};});return dbPromise;};
 async function run(mode,fn){const db=await open();return new Promise((resolve,reject)=>{let value,tx;try{tx=db.transaction('profiles',mode);const request=fn(tx.objectStore('profiles'));request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(new Error('個人 Avatar 儲存未完成；本次預覽仍可使用。'));}catch{reject(new Error('個人 Avatar 儲存無法使用。'));}});}
 return {async load(){const value=await run('readonly',s=>s.get('current'));return value?validateProfile(value):null;},save:profile=>run('readwrite',s=>s.put(validateProfile(profile),'current')),remove:()=>run('readwrite',s=>s.delete('current')),async close(){try{(await dbPromise)?.close();}catch{}dbPromise=null;}};
}
export async function decodeAvatarPhoto(blob,{document=globalThis.document,URL=globalThis.URL,Image=globalThis.Image,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const url=URL.createObjectURL(blob),image=new Image();let timer;try{await new Promise((resolve,reject)=>{timer=setTimer(()=>reject(new Error('照片讀取逾時，請換一張較小的照片。')),10000);image.onload=resolve;image.onerror=()=>reject(new Error('照片無法讀取，請換一張 JPEG 或 PNG。'));image.src=url;});clearTimer(timer);const w=image.naturalWidth,h=image.naturalHeight;if(w<128||h<128||w*h>40e6)throw new Error('照片尺寸過大或無效，請先縮小至 4000 萬畫素以內。');
  const scale=Math.min(1,1536/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.src='';return canvas;
 }finally{clearTimer(timer);image.onload=image.onerror=null;image.src='';URL.revokeObjectURL(url);}
}
export function drawFaceCrop(source,canvas,crop){const r=cropRect(source.width,source.height,crop),ctx=canvas.getContext('2d');canvas.width=canvas.height=FACE_SIZE;ctx.fillStyle='#ddd';ctx.fillRect(0,0,FACE_SIZE,FACE_SIZE);ctx.drawImage(source,r.x,r.y,r.size,r.size,0,0,FACE_SIZE,FACE_SIZE);return canvas;}
export function faceBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.size<=512*1024?resolve(blob):reject(new Error('臉部貼圖無法建立，請重試。')),'image/jpeg',.88));}

export const AVATAR_VIEWS=['front','side','back'],BODY_WIDTH=512,BODY_HEIGHT=1024;
export function referenceAngle(value=30){return clamp(value,0,60,30);}
// Plain-background assistance only. Keep manual crop available for other scenes.
export function findBodyBounds(canvas){
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),{width:w,height:h}=canvas,{data}=ctx.getImageData(0,0,w,h),corners=[[2,2],[w-3,2],[2,h-3],[w-3,h-3]].map(([x,y])=>Array.from(data.slice((y*w+x)*4,(y*w+x)*4+3))),bg=[0,1,2].map(k=>corners.reduce((s,c)=>s+c[k],0)/4);
 if(corners.some(c=>Math.hypot(...c.map((v,k)=>v-bg[k]))>24))return {x:0,y:0,width:w,height:h,assisted:false};
 let left=w,right=-1,top=h,bottom=-1;
 for(let y=0;y<h;y++){let count=0,min=w,max=-1;for(let x=0;x<w;x++){const i=(y*w+x)*4;if(Math.hypot(data[i]-bg[0],data[i+1]-bg[1],data[i+2]-bg[2])>42){count++;min=Math.min(min,x);max=Math.max(max,x);}}if(count>=Math.max(3,w*.006)){left=Math.min(left,min);right=Math.max(right,max);top=Math.min(top,y);bottom=y;}}
 if(right<=left||bottom-top<h*.35)return {x:0,y:0,width:w,height:h,assisted:false};
 const pad=Math.ceil(h*.007);left=Math.max(0,left-pad);top=Math.max(0,top-pad);return {x:left,y:top,width:Math.min(w,right+pad+1)-left,height:Math.min(h,bottom+pad+1)-top,assisted:true};
}
export function bodyCropRect(bounds,{zoom=1,x=.5,y=.5}={}){const z=clamp(zoom,1,2.5,1),width=bounds.width/z,height=bounds.height/z;return {x:bounds.x+clamp(x,0,1,.5)*(bounds.width-width),y:bounds.y+clamp(y,0,1,.5)*(bounds.height-height),width,height};}
export function drawBodyCrop(source,canvas,bounds,settings){const r=bodyCropRect(bounds,settings);canvas.width=BODY_WIDTH;canvas.height=BODY_HEIGHT;const ctx=canvas.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,BODY_WIDTH,BODY_HEIGHT);ctx.drawImage(source,r.x,r.y,r.width,r.height,0,0,BODY_WIDTH,BODY_HEIGHT);return canvas;}
export function bodyBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.size<=1024*1024?resolve(blob):reject(new Error('視圖貼圖無法建立，請重試。')),'image/jpeg',.9));}
