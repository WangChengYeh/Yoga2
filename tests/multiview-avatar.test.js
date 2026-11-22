import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {loadCharacter} from './helpers/character.js';
import {projectThreeViews,extendPhotoColors,avatarTemplateURL,matchPhotoInterval,mergeIntervals,skinToneFromPhoto,isWarmSkin} from '../src/multiview-avatar.js';
import {inspectHumanoidRig} from '../src/humanoid-rig.js';
import {createStudentRetarget} from '../src/student-retarget.js';
import {createAvatarEnvelope} from '../src/auto-framing.js';
import {worldSample} from './helpers/world-pose-samples.js';
import {validateProfile,findBodyBounds,bodyCropRect,bodyFitRect,drawBodyCrop} from '../src/avatar-profile.js';
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
 const model=await loadCharacter(),texture=new THREE.Texture();projectThreeViews(model,{texture,referenceArmDeg:30,viewRects:{side:{x:.4,y:.2,width:.2,height:.6}}});const rig=inspectHumanoidRig(model).diagnostics;assert.equal(rig.compatible,true);assert.ok(Object.values(model.userData.projection.views).every(n=>n>0));let vertices=0;
 model.traverse(m=>{if(!m.isMesh)return;const g=m.geometry,uv=g.attributes.uv;vertices+=g.attributes.position.count;assert.equal(m.material[0].map,texture);assert.equal(m.material[1].map,null);assert.ok(g.attributes.uv1&&g.attributes.uv2);assert.ok(g.groups.some(g=>g.materialIndex===1));assert.equal(m.material[2].map,null);assert.ok(g.attributes.skinIndex&&g.attributes.skinWeight);for(let i=0;i<g.index.count;i+=3){const tiles=[0,1,2].map(k=>{const id=g.index.getX(i+k);assert.ok(uv.getY(id)>=0&&uv.getY(id)<=1);const tile=Math.floor(uv.getX(id)*3);if(tile===1){assert.ok(uv.getX(id)*3-1>=.39999&&uv.getX(id)*3-1<=.60001);assert.ok(uv.getY(id)>=.19999&&uv.getY(id)<=.80001);}return tile;});assert.ok(tiles.every(t=>t===tiles[0]));}});
 assert.ok(vertices<50000);const retarget=createStudentRetarget(model),env=createAvatarEnvelope(model);for(const t of [0,250,500]){retarget.accept(worldSample(t),t);retarget.update(t);assert.equal(env.update().box.isEmpty(),false);}assert.ok(retarget.diagnostics.accepted>0);disposeAvatar(model);
});

test('silhouette mismatch extends photo colors without punching holes in template skin',()=>{
 const data=new Uint8ClampedArray(5*4);data.set([80,40,20,255],8);extendPhotoColors(data,5,1);for(let p=0;p<5;p++)assert.deepEqual([...data.slice(p*4,p*4+4)],[80,40,20,255]);assert.throws(()=>extendPhotoColors(new Uint8ClampedArray(4),1,1));
});

test('template URL follows production Pages override and packaged site layout',()=>{
 const baseURL='https://example.test/Yoga2/';assert.equal(avatarTemplateURL({document:{documentElement:{dataset:{modelUrl:'./public/models/luna-v1.glb'}}},baseURL}),baseURL+'public/models/luna-v1.glb');assert.equal(avatarTemplateURL({document:{documentElement:{dataset:{}}},baseURL}),baseURL+'models/luna-v1.glb');
});

test('narrow side views retain uniform pixel scale with padding, and wide views do too',()=>{
 for(const bounds of [{x:10,y:20,width:300,height:1400},{x:0,y:0,width:1200,height:1000}]){let args;const ctx={fillRect(){},drawImage(...v){args=v;}};drawBodyCrop({}, {getContext:()=>ctx},bounds,{});assert.ok(Math.abs(args[7]/args[3]-args[8]/args[4])<1e-10);const rect=bodyFitRect(bounds,{});assert.ok(rect.width<=1&&rect.height<=1);assert.ok(rect.x>0||rect.y>0);const value=validateProfile({schema:2,views:{front:blob(),side:blob(),back:blob()},viewRects:{side:rect}});assert.deepEqual(value.viewRects.side,rect);assert.deepEqual(value.viewRects.front,{x:0,y:0,width:1,height:1});}
});

test('photo correspondence maps separate legs into their own foreground intervals',()=>{
 const model=[[.25,.4],[.6,.75]],photo=[[.3,.42],[.58,.7]];for(const u of [.25,.3,.4])assert.ok(matchPhotoInterval(u,model,photo)>=.3&&matchPhotoInterval(u,model,photo)<=.42);for(const u of [.6,.65,.75])assert.ok(matchPhotoInterval(u,model,photo)>=.58&&matchPhotoInterval(u,model,photo)<=.7);assert.equal(matchPhotoInterval(.5,[],photo),null);assert.deepEqual(mergeIntervals([[.4,.5],[.1,.2],[.19,.3]]),[[.1,.3],[.4,.5]]);
});

test('skin appearance samples warm mid-body colors and rejects cold clothes/background',()=>{
 const w=30,h=60,stride=60,offset=30,data=new Uint8ClampedArray(stride*h*4);for(let y=0;y<h;y++)for(let x=0;x<stride;x++){const i=(y*stride+x)*4;data.set(x<offset?[20,60,150,255]:[200,160,120,255],i);}assert.deepEqual(skinToneFromPhoto(data,w,h,stride,offset),[200,160,120]);assert.equal(isWarmSkin([180,90,130]),false);assert.equal(isWarmSkin([240,240,240]),false);
});
