import * as THREE from 'three';
import { poseSample } from './pose-samples.js';
export function worldSample(capturedAt=0,{yaw=0,lean=0,scale=1,offset=0}={}){
 const data=poseSample(0,{capturedAt});const coords={0:[0,.8,.02],7:[.07,.77,0],8:[-.07,.77,0],11:[.2,.5,0],12:[-.2,.5,0],13:[.3,.3,.05],14:[-.3,.3,.05],15:[.4,.1,.1],16:[-.4,.1,.1],17:[.42,.04,.1],18:[-.42,.04,.1],19:[.44,.06,.12],20:[-.44,.06,.12],23:[.1,0,0],24:[-.1,0,0],25:[.1,-.4,.05],26:[-.1,-.4,.05],27:[.1,-.8,.02],28:[-.1,-.8,.02],29:[.1,-.82,-.03],30:[-.1,-.82,-.03],31:[.1,-.83,.16],32:[-.1,-.83,.16]};
 const world=Array.from({length:33},()=>({x:0,y:0,z:0}));for(const [i,xyz] of Object.entries(coords)){const v=new THREE.Vector3(...xyz);if([0,7,8,11,12,13,14,15,16,17,18,19,20].includes(Number(i)))v.applyAxisAngle(new THREE.Vector3(0,0,1),lean);v.applyAxisAngle(new THREE.Vector3(0,1,0),yaw).multiplyScalar(scale).addScalar(offset);world[i]={x:v.x,y:-v.y,z:-v.z};}
 data.worldLandmarks=[world];return data;
}
