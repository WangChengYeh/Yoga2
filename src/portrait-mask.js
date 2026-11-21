// Semantic foreground extraction shared by browser and real-model regression.
// Keep hair/skin/clothing. Only keep accessory pixels next to body pixels;
// never treat the model's broad "others" category as a whole person.
export function portraitMask({width,height,labels,channels}) {
  const count=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||count>2048*2048||channels.length!==labels.length||channels.some(c=>c.length!==count))throw new Error('Invalid semantic masks');
  const names=labels.map(s=>s.toLowerCase().replaceAll('_','-'));
  const body=['hair','body-skin','face-skin','clothes'].map(s=>names.indexOf(s));
  if(body.some(i=>i<0))throw new Error('Unknown semantic labels');
  const faceIndex=names.indexOf('face-skin'),othersIndex=names.indexOf('others');
  const confidence=new Float32Array(count);let facePixels=[];
  let left=width,right=0,top=height,bottom=0;
  const finite=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
  for(let i=0;i<count;i++){
    let value=0;for(const channel of body)value+=finite(channels[channel][i]);confidence[i]=Math.min(1,value);
    if(finite(channels[faceIndex][i])>.6){const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);facePixels.push(i);}
  }
  // Ignore isolated false face pixels when choosing the calibration box.
  const faceSeen=new Uint8Array(count),faceQueue=new Int32Array(count);let mainFace=[];
  for(const start of facePixels){
    if(faceSeen[start])continue;let head=0,tail=1;faceQueue[0]=start;faceSeen[start]=1;
    while(head<tail){const i=faceQueue[head++],x=i%width,y=Math.floor(i/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const j=yy*width+xx;if(!faceSeen[j]&&finite(channels[faceIndex][j])>.6){faceSeen[j]=1;faceQueue[tail++]=j;}}
    }
    if(tail>mainFace.length)mainFace=Array.from(faceQueue.subarray(0,tail));
  }
  facePixels=mainFace;left=width;right=0;top=height;bottom=0;
  for(const i of facePixels){const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
  const face=facePixels.length>=Math.max(8,count*.001)&&bottom>top?{left:left/width,right:right/width,top:top/height,bottom:bottom/height}:null;
  // Accessories may fill small holes around glasses/hair, but are restricted
  // to a small facial region and must touch a confident person neighborhood.
  if(othersIndex>=0&&face){
    const l=Math.max(0,Math.floor(face.left*width)-2),r=Math.min(width,Math.ceil(face.right*width)+2),t=Math.max(0,Math.floor(face.top*height)-2),b=Math.min(height,Math.ceil(face.bottom*height)+2);
    const base=confidence.slice();
    for(let y=t;y<b;y++)for(let x=l;x<r;x++){
      const i=y*width+x;if(base[i]>=.5)continue;
      let adjacent=false;
      for(let dy=-2;dy<=2&&!adjacent;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height&&base[yy*width+xx]>.6){adjacent=true;break;}}
      if(adjacent)confidence[i]=Math.min(1,base[i]+finite(channels[othersIndex][i]));
    }
  }
  // Retain the main connected person (prefer the component containing face
  // pixels) and a one-pixel soft edge. Remove detached chair/background blobs.
  const seen=new Uint8Array(count),queue=new Int32Array(count);let best=[],bestScore=-1;
  const faceSeeds=new Set(facePixels);
  for(let start=0;start<count;start++){
    if(seen[start]||confidence[start]<.5)continue;
    let head=0,tail=1,faceCount=0;queue[0]=start;seen[start]=1;
    while(head<tail){const i=queue[head++];if(faceSeeds.has(i))faceCount++;const x=i%width,y=Math.floor(i/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const j=yy*width+xx;if(!seen[j]&&confidence[j]>=.5){seen[j]=1;queue[tail++]=j;}}
    }
    const score=faceCount?count+faceCount:tail;
    if(score>bestScore){bestScore=score;best=Array.from(queue.subarray(0,tail));}
  }
  const keep=new Uint8Array(count);
  for(const i of best){const x=i%width,y=Math.floor(i/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height)keep[yy*width+xx]=1;}}
  for(let i=0;i<count;i++)if(!keep[i])confidence[i]=0;
  return {width,height,confidence,face};
}
