import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original low-poly male practice avatar. Positions are metres; +Z is front.
// Rigid skin weights keep this MVP small. Joint blending/twist are M2 work.
export function createStudentModel() {
  const root=new THREE.Group();root.name='Yoga2MaleStudent';
  root.userData={asset:'student-v1',license:'CC0-1.0',rig:'Yoga2-Humanoid-1',skin:'rigid-segments'};
  const bones=[],byName={},parts=new Map();
  function bone(name,parent,position){const b=new THREE.Bone();b.name=name;b.position.fromArray(position);(parent||root).add(b);bones.push(b);byName[name]=b;return b;}
  const hips=bone('Hips',null,[0,.91,0]),spine=bone('Spine',hips,[0,.16,0]),spine1=bone('Spine1',spine,[0,.13,0]),chest=bone('Spine2',spine1,[0,.13,0]),neck=bone('Neck',chest,[0,.13,0]);
  bone('Head',neck,[0,.10,0]);
  for(const [side,s] of [['Left',1],['Right',-1]]){
    const shoulder=bone(side+'Shoulder',chest,[s*.15,.015,0]);
    const arm=bone(side+'Arm',shoulder,[s*.055,0,0]);
    const fore=bone(side+'ForeArm',arm,[s*.27,0,0]);bone(side+'Hand',fore,[s*.25,0,0]);
    const thigh=bone(side+'UpLeg',hips,[s*.105,-.025,0]),leg=bone(side+'Leg',thigh,[0,-.405,0]),foot=bone(side+'Foot',leg,[0,-.405,0]);bone(side+'ToeBase',foot,[0,-.025,.12]);
  }
  root.updateMatrixWorld(true);
  function part(name,color,center,size,shape='sphere'){
    const b=byName[name],g=shape==='box'?new THREE.BoxGeometry(1,1,1):new THREE.SphereGeometry(1,12,8);
    g.scale(...size);g.translate(...center);g.applyMatrix4(b.matrixWorld);
    const count=g.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
    for(let i=0;i<count;i++){indices[i*4]=bones.indexOf(b);weights[i*4]=1;}
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    if(!parts.has(color))parts.set(color,[]);parts.get(color).push(g);
  }
  const skin=0xc99775,shirt=0x365d72,shorts=0x263b46,hair=0x242626;
  part('Hips',shorts,[0,-.015,0],[.17,.12,.105]);
  part('Spine',shirt,[0,.10,0],[.195,.265,.108]);
  part('Neck',skin,[0,.025,0],[.052,.08,.05]);part('Head',skin,[0,.045,0],[.092,.125,.085]);
  part('Head',hair,[0,.122,-.012],[.095,.055,.083]);part('Head',0x965f50,[0,.003,.076],[.025,.004,.01]);part('Head',skin,[0,.035,.082],[.018,.025,.018]);
  for(const s of [-1,1]){
    part('Head',0xe7e9e3,[s*.034,.065,.076],[.021,.012,.012]);part('Head',0x242626,[s*.034,.065,.086],[.008,.009,.005]);
  }
  for(const [side,s] of [['Left',1],['Right',-1]]){
    part(side+'Arm',shirt,[s*.045,0,0],[.095,.067,.07]);part(side+'Arm',skin,[s*.15,0,0],[.16,.049,.05]);
    part(side+'ForeArm',skin,[s*.12,0,0],[.145,.039,.04]);part(side+'Hand',skin,[s*.045,0,0],[.065,.038,.022]);
    part(side+'UpLeg',shorts,[0,-.075,0],[.095,.16,.10]);part(side+'UpLeg',skin,[0,-.265,0],[.073,.19,.075]);
    part(side+'Leg',skin,[0,-.19,0],[.057,.235,.06]);part(side+'Foot',skin,[0,-.025,.055],[.053,.04,.105]);
  }
  const skeleton=new THREE.Skeleton(bones);
  for(const [color,geometries] of parts){
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.85}));mesh.name='StudentSkin';root.add(mesh);mesh.bind(skeleton);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  }
  root.updateMatrixWorld(true);return root;
}
