import * as THREE from 'three';
import {writeFileSync,mkdirSync} from 'node:fs';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {loadCharacter} from '../tests/helpers/character.js';
import {createStudentModel} from '../src/student-model.js';
import {createStudentRetarget} from '../src/student-retarget.js';
import {prepareStandingCoach} from '../src/rig.js';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
mkdirSync('test-results/dual-avatar',{recursive:true});
for(const [pose,time,movement] of [['standing',0,'reach'],['reach',8,'reach'],['side',10,'side'],['open',10,'open']]){
 const scene=new THREE.Scene(),coach=await loadCharacter(),student=createStudentModel();prepareStandingCoach(coach)(time,movement);prepareStandingCoach(student);scene.add(coach,student);coach.position.x-=.75;student.position.x+=.75;
 if(pose!=='standing'){
 const points=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1,presence:1}));const put=(i,x,y)=>Object.assign(points[i],{x,y});
 for(const [i,x,y] of [[11,.65,.4],[12,.35,.4],[23,.57,.65],[24,.43,.65],[25,.57,.8],[26,.43,.8],[27,.57,.98],[28,.43,.98]])put(i,x,y);
 for(const [s,e,w] of [[11,13,15],[12,14,16]]){const x=points[s].x;put(e,pose==='open'?(x>.5?.8:.2):x,pose==='open'?.4:.25);put(w,pose==='open'?(x>.5?.98:.02):x,pose==='open'?.4:.1);}
 if(pose==='side')for(const i of [11,12,13,14,15,16])points[i].x+=.12;
 const retarget=createStudentRetarget(student);retarget.accept({landmarks:[points],capturedAt:100},100);for(let t=100;t<600;t+=16)retarget.update(t);
 }
 scene.updateMatrixWorld(true);const binary=await new GLTFExporter().parseAsync(scene,{binary:true});writeFileSync(`test-results/dual-avatar/${pose}.glb`,Buffer.from(binary));
}
