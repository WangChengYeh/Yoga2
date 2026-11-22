import * as THREE from 'three';
export function createPracticeMat(){
 const mat=new THREE.Mesh(new THREE.BoxGeometry(.72,.018,1.65),new THREE.MeshStandardMaterial({color:0x557667,roughness:.95}));
 mat.name='Yoga2PracticeMat';mat.position.y=.002;mat.receiveShadow=true;return mat;
}
export function enableAvatarShadows(model){model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return model;}
