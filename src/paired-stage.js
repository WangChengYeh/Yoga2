// Keep the pair side by side in screen space without turning only one actor
// toward the camera. Both normalized models retain the same world direction.
export function layoutAvatarPair({coachStage,studentPanel,yaw,fit}){
 const x=Math.cos(yaw),z=-Math.sin(yaw);
 coachStage.position.set(x*fit.coachX,0,z*fit.coachX);coachStage.rotation.y=0;
 studentPanel.setLayout({x:x*fit.humanX,z:z*fit.humanX,yaw:0,layoutYaw:yaw});
}
