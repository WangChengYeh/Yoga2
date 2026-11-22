import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAvatarEnvelope,createAutoFraming,safeStageInsets} from '../src/auto-framing.js';
import {prepareStandingCoach} from '../src/rig.js';
import {loadCharacter} from './helpers/character.js';
import {createStudentModel} from '../src/student-model.js';
function exactInside(model,box){let n=0;const p=new THREE.Vector3();model.traverse(m=>{if(!m.isMesh)return;for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,p).applyMatrix4(m.matrixWorld);assert.ok(p.x>=box.min.x-1e-5&&p.x<=box.max.x+1e-5&&p.y>=box.min.y-1e-5&&p.y<=box.max.y+1e-5&&p.z>=box.min.z-1e-5&&p.z<=box.max.z+1e-5,`vertex ${i} outside envelope`);n++;}});assert.ok(n>100);}
test('cached skin envelopes contain every actual Luna/student vertex across course motion, scale and yaw',async()=>{
 for(const model of [await loadCharacter(),createStudentModel()]){
  const pose=prepareStandingCoach(model),env=createAvatarEnvelope(model);model.scale.multiplyScalar(1.3);model.position.x=1.1;model.rotation.y=.5;
  for(const [t,motion] of [[0,'reach'],[8,'reach'],[10,'side'],[22,'side'],[10,'open']]){pose(t,motion);const {box,points}=env.update();exactInside(model,box);assert.ok(points.length<=22*8*8);}
  assert.equal(env.diagnostics.method,'skin-influence-envelope');assert.ok(env.diagnostics.vertices>100);
 }
});
function harness(){let points=[],size={width:1200,height:620},insets={left:0,right:36,top:0,bottom:0};const camera=new THREE.PerspectiveCamera(35,size.width/size.height,.1,40),controls={target:new THREE.Vector3(0,1,0)};camera.position.set(0,1,6);camera.lookAt(controls.target);camera.updateMatrixWorld();const fit=createAutoFraming({camera,controls,getPoints:()=>points,getSize:()=>size,getInsets:()=>insets});
 return {camera,controls,fit,setPoints(p){points=p;},setSize(s){size=s;},setInsets(i){insets=i;},check(){for(const p of points){const n=p.clone().project(camera);assert.ok(Math.abs(n.x)<.93&&Math.abs(n.y)<.93,`boundary ${n.toArray()}`);assert.ok(n.z>-1&&n.z<1);}}};}
const body=(width,height)=>{const p=[];for(const x of [-width/2,width/2])for(const y of [.02,height])for(const z of [-.15,.15])p.push(new THREE.Vector3(x,y,z));return p;};
test('automatic distance pulls back immediately on expansion, approaches gently on contraction, always contains both bodies',()=>{
 const h=harness();h.setPoints(body(2.6,1.74));h.fit.update(0);h.check();const standing=h.fit.diagnostics.distance;
 h.setPoints(body(4.1,2.25));h.fit.update(33);h.check();const expanded=h.fit.diagnostics.distance;assert.ok(expanded>standing);
 h.setPoints(body(2.6,1.74));h.fit.update(66);h.check();assert.ok(h.fit.diagnostics.distance<expanded);assert.ok(h.fit.diagnostics.distance>h.fit.diagnostics.requiredDistance);
 for(let t=100;t<2200;t+=33)h.fit.update(t);h.check();assert.ok(h.fit.diagnostics.distance<expanded*.9);
});
test('automatic fit adapts to orbit, portrait/landscape resize, offsets and UI-safe boundaries',()=>{
 const h=harness();h.setPoints(body(4.2,2.1));h.fit.update(0);h.check();
 for(const size of [{width:390,height:500},{width:844,height:280},{width:1536,height:622}]){
  h.setSize(size);h.camera.position.copy(h.controls.target).add(new THREE.Vector3(3,1,4));h.camera.lookAt(h.controls.target);h.fit.reset();h.fit.update(200);h.check();
 }
 const v={left:0,right:1200,top:0,bottom:620,width:1200,height:620};const r=safeStageInsets(v,[{left:1164,right:1500,top:12,bottom:60}]);assert.deepEqual(r,{left:0,right:44,top:0,bottom:0});
 const top=safeStageInsets(v,[{left:0,right:1200,top:0,bottom:64}]);assert.equal(top.top,72);h.setInsets(top);h.fit.update(400);h.check();
});
test('actual two-avatar poses remain on screen with current-pose fitting instead of the maximum-motion fallback',async()=>{
 const coach=await loadCharacter(),student=createStudentModel(),pose=prepareStandingCoach(coach),studentPose=prepareStandingCoach(student);coach.position.x-=1;student.position.x+=1;
 const a=createAvatarEnvelope(coach),b=createAvatarEnvelope(student),h=harness();let now=0;
 for(const [t,motion] of [[0,'reach'],[8,'reach'],[10,'open'],[10,'side'],[22,'side'],[0,'reach']]){
  pose(t,motion);studentPose(t,motion);h.setPoints([...a.update().points,...b.update().points]);h.fit.update(now);h.check();now+=100;
 }
});
test('no valid geometry keeps the last camera instead of producing NaN',()=>{
 const h=harness(),before=h.camera.position.clone();h.setPoints([]);assert.equal(h.fit.update(0),false);assert.deepEqual(h.camera.position,before);h.setPoints([new THREE.Vector3(NaN,0,0)]);assert.equal(h.fit.update(33),false);
});

test('morph excursions outside the cached weight contract fall back to exact bounds',()=>{
 const geometry=new THREE.BoxGeometry(.5,.5,.5);geometry.morphAttributes.position=[geometry.attributes.position.clone()];const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),root=new THREE.Group();root.add(mesh);mesh.updateMorphTargets();mesh.morphTargetInfluences[0]=2;
 const env=createAvatarEnvelope(root);assert.equal(env.diagnostics.fallbackMeshes,1);exactInsideSmall(mesh,env.update().box);function exactInsideSmall(m,box){const p=new THREE.Vector3();for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,p).applyMatrix4(m.matrixWorld);assert.ok(box.containsPoint(p));}}
});
