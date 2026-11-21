// Fixed framing uses Luna's fully raised hand-to-foot envelope: 1.9466 m.
// Aim for 80% viewport height; preserve complete arm spans on narrow screens.
// Neither live mask width nor animation phase changes zoom or lane positions.
export const RAISED_COACH_HEIGHT=1.9465994407528504;
export const COACH_HEIGHT_FRACTION=.8;
export function practiceLayout({aspect,paired=false,fov=35}) {
  if(!Number.isFinite(aspect)||aspect<=0)throw new Error('Invalid viewport aspect');
  const lane=1.0,width=paired?4.2:2.3,frameHeight=RAISED_COACH_HEIGHT/COACH_HEIGHT_FRACTION;
  const tangent=Math.tan(fov*Math.PI/360),depth=.157064;
  return {coachX:paired?-lane:0,humanX:lane,width,frameHeight,targetY:.02+RAISED_COACH_HEIGHT/2,
    distance:depth+Math.max(frameHeight/(2*tangent),width/(2*tangent*aspect))};
}
