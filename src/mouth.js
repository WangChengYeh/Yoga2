import * as THREE from 'three';

export const mouthAmount = (speaking, seconds) => speaking ? .18 + .72 * Math.abs(Math.sin(seconds * 11) * Math.cos(seconds * 4.7)) : 0;

export function createMouthMotion(model) {
  const targets = [];
  let mode = 'none';
  model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const dictionary = mesh.morphTargetDictionary || {};
    const name = Object.keys(dictionary).find((key) => /^(jawOpen|mouthOpen|viseme_aa)$/i.test(key));
    if (name) { targets.push({ mesh, index:dictionary[name] }); mode='blendshape'; return; }
    // Michelle has no jaw bone or mouth targets. Add a small, asset-specific
    // lower-lip deformation; this is an opening/closing preview, not phonemes.
    if (mesh.name !== 'Ch03' || mesh.geometry.morphAttributes.position?.length) return;
    const { position, uv, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!uv || !skinIndex || !skinWeight) return;
    const selected = [];
    let nearest = Infinity, lipY = 0;
    for (let index=0;index<position.count;index++) {
      let headWeight=0;
      for (let slot=0;slot<4;slot++) if(mesh.skeleton.bones[skinIndex.getComponent(index,slot)]?.name.endsWith('Head'))headWeight+=skinWeight.getComponent(index,slot);
      const distance=((uv.getX(index)-.888)/.018)**2+((uv.getY(index)-.176)/.027)**2;
      if(headWeight>.8 && distance<1 && Math.abs(position.getX(index))<.04){
        selected.push({index,weight:(1-distance)**2});
        if(distance<nearest){nearest=distance;lipY=position.getY(index);}
      }
    }
    if(!selected.length)return;
    const delta=new Float32Array(position.count*3);
    for(const {index,weight} of selected){
      const lower=Math.max(0,Math.min(1,(lipY-position.getY(index))/.016+.2));
      delta[index*3+1]=-.006*weight*lower;
    }
    mesh.geometry=mesh.geometry.clone();
    mesh.geometry.morphTargetsRelative=true;
    mesh.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(delta,3)];
    mesh.updateMorphTargets();mesh.morphTargetDictionary.yogaSpeech=0;
    targets.push({mesh,index:0});mode='preview-morph';
  });
  return {
    supported:targets.length>0, mode,
    setAmount(value){const amount=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;for(const target of targets)target.mesh.morphTargetInfluences[target.index]=amount;},
  };
}
