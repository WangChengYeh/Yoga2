import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { aiSkeleton, AI_EDGES, skeletonFresh, createSkeletonLayer, createCoachSkeletonSource, COACH_JOINTS, COACH_EDGES } from '../src/skeleton.js';
import { loadCharacter } from './helpers/character.js';
import { prepareStandingCoach } from '../src/rig.js';
const points=()=>Array.from({length:33},(_,i)=>({x:.25+(i%3)*.2,y:.1+(i%5)*.15,z:0,visibility:.99,presence:.99}));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('AI projection mirrors once and flips video Y into the cutout plane, with a derived shoulder center',()=>{
  const p=points(),r=aiSkeleton([p]);assert.equal(r.edges.length,AI_EDGES.length);
  near(r.points[15][0],.5-p[15].x);near(r.points[15][1],.5-p[15].y);
  near(r.points[33][0],(.5-p[11].x+.5-p[12].x)/2);assert.equal(r.points[15][2],.012);
});
test('missing people, multiple people and dark frames never invent a skeleton',()=>{
  for(const poses of [[],[points(),points()],undefined])assert.equal(aiSkeleton(poses).edges.length,0);
  assert.equal(aiSkeleton([points()],{brightness:12}).edges.length,0);
});
test('each uncertain/out-of-frame joint independently removes its connected bones',()=>{
  for(const index of new Set(AI_EDGES.flat().filter(i=>i<33))) {
    for(const change of [{visibility:.1},{presence:.1},{x:NaN},{y:1.1}]){
      const p=points();Object.assign(p[index],change);const r=aiSkeleton([p]);
      assert.equal(r.points[index],null);assert.ok(r.edges.every(([a,b])=>a!==index&&b!==index));
    }
  }
});
test('hidden wrists do not suppress clear legs; shoulders must be visible before creating a neck',()=>{
  const p=points();p[15].visibility=0;const r=aiSkeleton([p]);
  assert.ok(r.edges.some(([a,b])=>a===25&&b===27));assert.ok(!r.edges.some(e=>e.includes(15)));
  p[11].visibility=0;const noNeck=aiSkeleton([p]);assert.equal(noNeck.points[33],null);assert.ok(!noNeck.edges.some(e=>e.includes(33)));
});
test('skeleton expires after 1500ms, and malformed or future timestamps cannot pass freshness',()=>{
  assert.equal(skeletonFresh(100,1600),true);assert.equal(skeletonFresh(100,1601),false);
  assert.equal(skeletonFresh(200,100),false);assert.equal(skeletonFresh(NaN,100),false);
});
test('instanced bone endpoints match predicted joints, including the mirrored/scaled/rotated scene parent',()=>{
  const parent=new THREE.Mesh();parent.position.set(1.2,.8,-.4);parent.scale.set(1.4,2.2,1);parent.rotation.y=.6;
  const layer=createSkeletonLayer({parent,radius:.0035});const pose={points:[[.3,.1,.012],[-.2,.4,.012]],edges:[[0,1]]};layer.update(pose);
  assert.equal(layer.bones.count,1);assert.equal(layer.joints.count,2);
  const matrix=new THREE.Matrix4();layer.bones.getMatrixAt(0,matrix);parent.updateMatrixWorld(true);
  const start=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix).applyMatrix4(parent.matrixWorld);
  const end=new THREE.Vector3(0,.5,0).applyMatrix4(matrix).applyMatrix4(parent.matrixWorld);
  const expectedStart=new THREE.Vector3(...pose.points[0]).applyMatrix4(parent.matrixWorld),expectedEnd=new THREE.Vector3(...pose.points[1]).applyMatrix4(parent.matrixWorld);
  assert.ok(start.distanceTo(expectedStart)<1e-6);assert.ok(end.distanceTo(expectedEnd)<1e-6);
  assert.equal(layer.bones.material.depthTest,false);layer.dispose();
});
test('zero-length bones and missing points are skipped; clearing and disposal release all owned resources',()=>{
  const parent=new THREE.Group(),layer=createSkeletonLayer({parent});
  layer.update({points:[[0,0,0],[0,0,0],null],edges:[[0,1],[1,2]]});assert.equal(layer.bones.count,0);
  layer.update({points:[[0,0,0],[1,1,0]],edges:[[0,1]]});assert.equal(layer.group.visible,true);
  layer.clear();assert.equal(layer.group.visible,false);assert.equal(layer.bones.count,0);
  let released=0;for(const r of [layer.bones.geometry,layer.joints.geometry,layer.bones.material])r.addEventListener('dispose',()=>released++);
  layer.dispose();layer.dispose();assert.equal(released,3);assert.equal(parent.children.length,0);
});
test('real Luna rig provides all major joints and follows standing/reach/side/open animations in the same parent space',async()=>{
  const model=await loadCharacter(),stage=new THREE.Group();stage.add(model);const pose=prepareStandingCoach(model),source=createCoachSkeletonSource(model,stage);
  pose(0);let r=source();assert.equal(r.edges.length,COACH_EDGES.length);assert.equal(r.points.filter(Boolean).length,COACH_JOINTS.length);
  const feet=[r.points[16].slice(),r.points[20].slice()];
  for(const [movement,time] of [['reach',8],['side',10],['side',22],['open',10]]){
    pose(time,movement);r=source();assert.ok(r.points.flat().every(Number.isFinite));
    for(let i=0;i<3;i++){near(r.points[16][i],feet[0][i]);near(r.points[20][i],feet[1][i]);}
    if(movement==='reach'){assert.ok(r.points[9][1]>r.points[5][1]);assert.ok(r.points[13][1]>r.points[5][1]);}
  }
  pose(8,'reach');const before=source().points.map(p=>p.slice());stage.position.set(-1,0,.5);stage.updateMatrixWorld(true);const after=source();
  for(let i=0;i<before.length;i++)for(let k=0;k<3;k++)near(before[i][k],after.points[i][k]);
});
test('an unsupported coach rig returns only available edges rather than origin placeholders',()=>{
  const model=new THREE.Group(),hips=new THREE.Bone();hips.name='Hips';model.add(hips);
  const source=createCoachSkeletonSource(model,model),r=source();assert.equal(r.edges.length,0);assert.equal(r.points.filter(Boolean).length,1);
});
