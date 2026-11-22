import { courseFrame, motionAt } from '../../src/course.js';
export function poseSample(time=8,{capturedAt=0,aspect=.75,armOffset=0,mirror=false,elbowBend=0,leanOffset=0}={}){
 const frame=courseFrame(time),target=motionAt(frame.lesson.id,frame.localTime),lean=target.lean+leanOffset;
 const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.99,presence:.99}));
 const put=(i,x,y)=>Object.assign(p[i],{x,y});
 const center={x:.5-Math.sin(lean)*.25/aspect,y:.6-Math.cos(lean)*.25};
 put(0,center.x,center.y-.15);
 for(const [s,sh,e,w,h,k,a,f] of [[1,11,13,15,23,25,27,31],[-1,12,14,16,24,26,28,32]]){
  const x=center.x+s*.09*Math.cos(lean),y=center.y-s*.09*aspect*Math.sin(lean);
  const arm=lean+s*(target.armAngle+armOffset),fore=arm+s*elbowBend;
  put(sh,x,y);put(e,x+Math.sin(arm)*.13/aspect,y+Math.cos(arm)*.13);
  put(w,p[e].x+Math.sin(fore)*.12/aspect,p[e].y+Math.cos(fore)*.12);
  put(h,.5+s*.06,.6);put(k,.5+s*.06,.76);put(a,.5+s*.06,.91);put(f,.5+s*.07,.94);
 }
 if(mirror)for(const point of p)point.x=1-point.x;
 return {landmarks:[p],brightness:100,capturedAt,aspect,mirrored:mirror,context:{key:'test',frame,playing:true}};
}
