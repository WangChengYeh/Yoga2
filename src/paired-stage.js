// Keep the pair side by side in screen space without turning only one actor
// toward the camera. Both normalized models retain the same world direction.
export function layoutAvatarPair({coachStage,studentPanel,yaw,fit}){
 const x=Math.cos(yaw),z=-Math.sin(yaw);
 coachStage.position.set(x*fit.coachX,0,z*fit.coachX);coachStage.rotation.y=0;
 studentPanel.setLayout({x:x*fit.humanX,z:z*fit.humanX,yaw:0,layoutYaw:yaw});
}

// Close standing lanes without letting extended arms or the mats overlap.
export function createPairSpacing(){let distance=null,last=null;return {reset(){distance=null;last=null;},update({coachPoints,studentPoints,coachOrigin,studentOrigin,yaw,now}){
 const x=Math.cos(yaw),z=-Math.sin(yaw),project=p=>p.x*x+p.z*z;
 const c=coachPoints.map(project),s=studentPoints.map(project);if(!c.length||!s.length)return 2;
 const needed=Math.max(.9,Math.abs(x)*.72+Math.abs(z)*1.65+.14,Math.max(...c)-project(coachOrigin)+project(studentOrigin)-Math.min(...s)+.18),dt=last===null?0:Math.max(0,Math.min(.1,(now-last)/1000));last=now;
 distance=distance===null||needed>distance?needed:distance+(needed-distance)*(1-Math.exp(-dt*3));return distance;
 }};}
