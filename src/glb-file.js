// File checks run before GLTFLoader can allocate GPU resources or fetch URLs.
export const MAX_GLB_BYTES=30*1024*1024;
export function validateGLBProfile(value){
 if(value?.schema!==3||!(value.glb instanceof Blob)||value.glb.size<20||value.glb.size>MAX_GLB_BYTES)throw new GLBImportError('GLB 請使用 30 MB 以內的完整模型檔。');
 const boneMap=value.boneMap||{};if(typeof boneMap!=='object'||Array.isArray(boneMap)||Object.entries(boneMap).some(([k,v])=>k.length>80||typeof v!=='string'||v.length>160))throw new GLBImportError('骨架對照必須是 JSON 名稱對照表。');
 return {schema:3,glb:value.glb,name:String(value.name||'avatar.glb').slice(0,160),boneMap:{...boneMap}};
}
class GLBImportError extends Error {}
export function inspectGLBBytes(bytes){
 try{
  const view=new DataView(bytes);if(view.byteLength<20||view.byteLength>MAX_GLB_BYTES||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==view.byteLength)throw Error();
  let json,binStart=null,offset=12;while(offset<view.byteLength){if(offset+8>view.byteLength)throw Error();const size=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;if(size%4||offset+size>view.byteLength)throw Error();if(!json){if(type!==0x4e4f534a)throw Error();json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,offset,size)));}if(type===0x004e4942)binStart=offset;offset+=size;}
  if(!json||json.asset?.version!=='2.0')throw Error();
  for(const resource of [...(json.buffers||[]),...(json.images||[])])if(resource.uri)throw new GLBImportError('GLB 貼圖與網格必須內嵌，不能連到外部檔案；請重新匯出。');
  const compressed=['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'];if((json.extensionsUsed||[]).some(e=>compressed.includes(e)))throw new GLBImportError('請匯出未使用 Draco、Meshopt 或 KTX2 壓縮的 GLB，貼圖使用 PNG／JPEG。');
  if((json.nodes||[]).length>4096)throw new GLBImportError('模型節點過多，請精簡至 4096 個以內。');
  let imagePixels=0;for(const image of json.images||[]){
   const b=json.bufferViews?.[image.bufferView];if(binStart===null||!b||b.buffer!==0||b.byteLength<24||binStart+(b.byteOffset||0)+b.byteLength>bytes.byteLength)throw new GLBImportError('GLB 貼圖必須是內嵌 PNG／JPEG。');
   const start=binStart+(b.byteOffset||0),data=new Uint8Array(bytes,start,b.byteLength);let w=0,h=0;
   if(data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71){const header=new DataView(bytes,start,b.byteLength);w=header.getUint32(16);h=header.getUint32(20);}
   else if(data[0]===255&&data[1]===216){let i=2;while(i+8<data.length){if(data[i]!==255)break;const marker=data[i+1];if(marker===217||marker===218)break;const len=data[i+2]*256+data[i+3];if(len<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){h=data[i+5]*256+data[i+6];w=data[i+7]*256+data[i+8];break;}i+=2+len;}}
   if(!w||!h||w>4096||h>4096||(imagePixels+=w*h)>32*1024*1024)throw new GLBImportError('GLB 貼圖需使用 PNG／JPEG，每張最多 4096，總計最多 3200 萬像素。');
  }
  let vertices=0,triangles=0;for(const mesh of json.meshes||[])for(const p of mesh.primitives||[]){if((p.mode??4)!==4)throw new GLBImportError('Avatar 網格必須使用三角形。');vertices+=json.accessors?.[p.attributes?.POSITION]?.count||0;triangles+=(json.accessors?.[p.indices]?.count||json.accessors?.[p.attributes?.POSITION]?.count||0)/3;}
  if(!vertices||vertices>200000||triangles>300000)throw new GLBImportError('模型過大或沒有網格：上限 20 萬頂點、30 萬三角形，請先減面。');
  if((json.images||[]).length>16)throw new GLBImportError('貼圖超過 16 張，請合併材質後重試。');
  return {json,vertices,triangles};
 }catch(error){if(error instanceof GLBImportError)throw error;throw new GLBImportError('檔案不是完整的 GLB 2.0，請重新匯出。');}
}
