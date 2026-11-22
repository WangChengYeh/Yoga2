// Yoga2-Humanoid-1 contract. Explicit mapping also supports differently named
// replacement rigs without changing MediaPipe mapping or mesh appearance.
export const HUMANOID_BONES=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'];
const CHAINS=[['Hips','Spine','Spine1','Spine2','Neck','Head'],['Spine2','LeftShoulder','LeftArm','LeftForeArm','LeftHand'],['Spine2','RightShoulder','RightArm','RightForeArm','RightHand'],['Hips','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase'],['Hips','RightUpLeg','RightLeg','RightFoot','RightToeBase']];
export function inspectHumanoidRig(model,{boneMap={}}={}){
 const all=[],skins=[];model.traverse(o=>{if(o.isBone)all.push(o);if(o.isSkinnedMesh)skins.push(o);});
 const bones=new Map(),ambiguous=[],used=new Set();
 for(const name of HUMANOID_BONES){
  const value=boneMap[name]??name;
  const matches=typeof value==='string'?(all.some(b=>b.name===value)?all.filter(b=>b.name===value):all.filter(b=>b.name.endsWith(value))):all.includes(value)?[value]:[];
  if(matches.length===1&&!used.has(matches[0])){bones.set(name,matches[0]);used.add(matches[0]);}else if(matches.length)ambiguous.push(name);
 }
 const missing=HUMANOID_BONES.filter(name=>!bones.has(name)),hierarchy=[];
 for(const chain of CHAINS)for(let i=1;i<chain.length;i++){
  const parent=bones.get(chain[i-1]),child=bones.get(chain[i]);if(!parent||!child)continue;
  let ancestor=child.parent;while(ancestor&&ancestor!==parent&&ancestor!==model)ancestor=ancestor.parent;
  if(ancestor!==parent)hierarchy.push(`${chain[i-1]}/${chain[i]}`);
 }
 const skinBones=new Set(skins.flatMap(mesh=>mesh.skeleton?.bones||[]));
 const invalidSkin=HUMANOID_BONES.some(name=>bones.has(name)&&!skinBones.has(bones.get(name)))||skins.some(mesh=>{
  const index=mesh.geometry?.getAttribute('skinIndex'),weight=mesh.geometry?.getAttribute('skinWeight');if(!index||!weight||!mesh.skeleton||index.count!==mesh.geometry.attributes.position?.count||weight.count!==index.count)return true;
  for(let i=0;i<weight.count;i++){let sum=0;for(let k=0;k<4;k++){const w=weight.getComponent(i,k),n=index.getComponent(i,k);if(!Number.isFinite(w)||w<0||!Number.isInteger(n)||n<0||n>=mesh.skeleton.bones.length)return true;sum+=w;}if(Math.abs(sum-1)>.02)return true;}return false;
 });
 const transforms=all.every(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()].every(Number.isFinite)&&b.scale.toArray().every(n=>n>0));
 return {bones,diagnostics:{contract:'Yoga2-Humanoid-1',compatible:missing.length===0&&ambiguous.length===0&&hierarchy.length===0&&skins.length>0&&!invalidSkin&&transforms,missing,ambiguous,hierarchy,skinnedMeshes:skins.length,invalidSkin,transforms}};
}
