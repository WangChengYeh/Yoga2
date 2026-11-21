// Stored ZIP: no network, no third-party upload service and no re-encoding files.
export function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let n=0;n<8;n++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^-1)>>>0;
}
export function zipFiles(files) {
  const chunks=[], central=[]; let offset=0, directorySize=0;
  const header=n=>new Uint8Array(n), put=(a,i,v,n=4)=>{const d=new DataView(a.buffer);n===2?d.setUint16(i,v,true):d.setUint32(i,v,true);};
  for (const {name,bytes} of files) {
    if(!/^[a-z0-9.-]+$/.test(name)||!(bytes instanceof Uint8Array))throw new Error('Invalid ZIP entry');
    const filename=new TextEncoder().encode(name), crc=crc32(bytes), h=header(30);
    put(h,0,0x04034b50);put(h,4,20,2);put(h,12,33,2);put(h,14,crc);put(h,18,bytes.length);put(h,22,bytes.length);put(h,26,filename.length,2);
    chunks.push(h,filename,bytes);
    const c=header(46);put(c,0,0x02014b50);put(c,4,20,2);put(c,6,20,2);put(c,14,33,2);put(c,16,crc);put(c,20,bytes.length);put(c,24,bytes.length);put(c,28,filename.length,2);put(c,42,offset);
    central.push(c,filename);directorySize+=c.length+filename.length;offset+=h.length+filename.length+bytes.length;
  }
  const end=header(22);put(end,0,0x06054b50);put(end,8,files.length,2);put(end,10,files.length,2);put(end,12,directorySize);put(end,16,offset);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
}
export function viewportDiagnostics(win, doc, stage, canvas) {
  const rect=stage.getBoundingClientRect(),v=win.visualViewport;
  return {screen:{width:win.screen.width,height:win.screen.height,availWidth:win.screen.availWidth,availHeight:win.screen.availHeight},window:{width:win.innerWidth,height:win.innerHeight},visualViewport:v?{width:v.width,height:v.height,scale:v.scale,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop}:null,dpr:win.devicePixelRatio||1,orientation:win.screen.orientation?.type|| (win.innerWidth>win.innerHeight?'landscape':'portrait'),fullscreen:{native:Boolean(doc.fullscreenElement||doc.webkitFullscreenElement),css:doc.body.classList.contains('practice-fullscreen')},stage:{width:rect.width,height:rect.height},drawingBuffer:canvas?{width:canvas.width,height:canvas.height}:null};
}
export function pairedFrame(snapshot, now) {
  if(!snapshot||now-snapshot.capturedAt>1500||now<snapshot.capturedAt)return null;
  return {inScene:Boolean(snapshot.inScene),id:snapshot.id,capturedAt:snapshot.capturedAt,completedAt:snapshot.completedAt,ageMs:now-snapshot.capturedAt,width:snapshot.frame.width,height:snapshot.frame.height,mirroredInput:false,mirroredScene:true};
}
export async function reportFiles(diagnostics, camera, scene) {
  const entries=[{name:'diagnostics.json',blob:new Blob([JSON.stringify(diagnostics,null,2)],{type:'application/json'})}];
  if(camera)entries.push({name:'camera.png',blob:camera});
  if(scene)entries.push({name:'scene.png',blob:scene});
  const zip=zipFiles(await Promise.all(entries.map(async f=>({name:f.name,bytes:new Uint8Array(await f.blob.arrayBuffer())}))));
  return [...entries,{name:'report.zip',blob:zip}];
}
export function trustedMessage(event, source, origin, id) {return event.source===source&&event.origin===origin&&event.data?.id===id;}
