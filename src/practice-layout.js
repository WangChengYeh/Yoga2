// Reserve both people's complete arm span once. Pose/mask width never moves
// either lane or changes the zoom. Reframe only for viewport/calibration changes.
export function practiceLayout({aspect,paired=false,fov=35}) {
  if(!Number.isFinite(aspect)||aspect<=0)throw new Error('Invalid viewport aspect');
  const lane=1.0,width=paired?4.2:2.3,frameHeight=2.85;
  const tangent=Math.tan(fov*Math.PI/360);
  return {coachX:paired?-lane:0,humanX:lane,width,frameHeight,targetY:1.17,
    distance:Math.max(frameHeight/(2*tangent),width/(2*tangent*aspect))};
}
