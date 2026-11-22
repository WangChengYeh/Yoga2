import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {loadCharacter} from './helpers/character.js';
import {projectThreeViews,extendPhotoColors,avatarTemplateURL} from '../src/multiview-avatar.js';
import {inspectHumanoidRig} from '../src/humanoid-rig.js';
import {createStudentRetarget} from '../src/student-retarget.js';
import {createAvatarEnvelope} from '../src/auto-framing.js';
import {worldSample} from './helpers/world-pose-samples.js';
import {validateProfile,findBodyBounds,bodyCropRect} from '../src/avatar-profile.js';
import {disposeAvatar} from '../src/personal-avatar.js';
const blob=()=>new Blob(['view-jpeg'],{type:'image/jpeg'});
test('three-view schema requires all images, bounds settings and preserves legacy records',()=>{
 const p={schema:2,views:{front:blob(),side:blob(),back:blob()},referenceArmDeg:99,sourceFiles:['private']};const v=validateProfile(p);assert.equal(v.referenceArmDeg,60);assert.equal(v.template,'luna-v1');assert.equal('sourceFiles' in v,false);assert.throws(()=>validateProfile({...p,views:{front:blob(),side:blob()}}));assert.throws(()=>validateProfile({...p,views:{...p.views,back:new Blob(['x'],{type:'image/svg+xml'})}}));assert.equal(validateProfile({schema:1,face:blob()}).schema,1);
 assert.deepEqual(bodyCropRect({x:10,y:20,width:200,height:400},{zoom:2,x:1,y:0}),{x:110,y:20,width:100,height:200});
});
test('plain-background assistance detects person bounds and complex backgrounds remain manual',()=>{
 const w=200,h=400,data=new Uint8ClampedArray(w*h*4).fill(240);for(let y=40;y<360;y++)for(let x=70;x<130;x++){const i=(y*w+x)*4;data[i]=60;data[i+1]=40;data[i+2]=40;data[i+3]=255;}const c={width:w,height:h,getContext:()=>({getImageData:()=>({data})})};const b=findBodyBounds(c);assert.equal(b.assisted,true);assert.ok(b.x<70&&b.y<40);assert.ok(b.width>=60&&b.height>=320);data[(2*w+2)*4]=0;assert.equal(findBodyBounds(c).assisted,false);
});
test('actual template receives all three views without UV triangles crossing atlas tiles; rig and weights survive',async()=>{
 const model=await loadCharacter(),texture=new THREE.Texture();projectThreeViews(model,{texture,referenceArmDeg:30});const rig=inspectHumanoidRig(model).diagnostics;assert.equal(rig.compatible,true);assert.ok(Object.values(model.userData.projection.views).every(n=>n>0));let vertices=0;
 model.traverse(m=>{if(!m.isMesh)return;const g=m.geometry,uv=g.attributes.uv;vertices+=g.attributes.position.count;assert.equal(m.material.map,texture);assert.ok(g.attributes.skinIndex&&g.attributes.skinWeight);for(let i=0;i<g.index.count;i+=3){const tiles=[0,1,2].map(k=>{const id=g.index.getX(i+k);assert.ok(uv.getY(id)>=0&&uv.getY(id)<=1);return Math.floor(uv.getX(id)*3);});assert.ok(tiles.every(t=>t===tiles[0]));}});
 assert.ok(vertices<50000);const retarget=createStudentRetarget(model),env=createAvatarEnvelope(model);for(const t of [0,250,500]){retarget.accept(worldSample(t),t);retarget.update(t);assert.equal(env.update().box.isEmpty(),false);}assert.ok(retarget.diagnostics.accepted>0);disposeAvatar(model);
});

test('silhouette mismatch extends photo colors without punching holes in template skin',()=>{
 const data=new Uint8ClampedArray(5*4);data.set([80,40,20,255],8);extendPhotoColors(data,5,1);for(let p=0;p<5;p++)assert.deepEqual([...data.slice(p*4,p*4+4)],[80,40,20,255]);assert.throws(()=>extendPhotoColors(new Uint8ClampedArray(4),1,1));
});

test('template URL follows production Pages override and packaged site layout',()=>{
 const baseURL='https://example.test/Yoga2/';assert.equal(avatarTemplateURL({document:{documentElement:{dataset:{modelUrl:'./public/models/luna-v1.glb'}}},baseURL}),baseURL+'public/models/luna-v1.glb');assert.equal(avatarTemplateURL({document:{documentElement:{dataset:{}}},baseURL}),baseURL+'models/luna-v1.glb');
});
