// Fit two separate lanes, including raised arms, within the camera frustum.
// Dimensions are world-space visible bounds, not the transparent video frame.
export function practiceLayout({aspect,paired=false,coachWidth=.8,humanWidth=.8,height=2.2,fov=35}) {
  if(!Number.isFinite(aspect)||aspect<=0)throw new Error('Invalid viewport aspect');
  const safe=v=>Number.isFinite(v)&&v>0?v:.8;
  coachWidth=Math.max(.55,safe(coachWidth));humanWidth=Math.max(.55,safe(humanWidth));
  const gap=.28;
  const width=paired?coachWidth+humanWidth+gap+.38:Math.max(1.4,coachWidth+.38);
  const frameHeight=Math.max(2.85,safe(height)+.65);
  const tangent=Math.tan(fov*Math.PI/360);
  return {coachX:paired?-(humanWidth+gap)/2:0,humanX:(coachWidth+gap)/2,width,frameHeight,
    distance:Math.max(frameHeight/(2*tangent),width/(2*tangent*aspect))};
}
