import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceLayout } from '../src/practice-layout.js';
for(const [name,aspect] of [['phone portrait',390/844],['phone landscape',844/390],['desktop',16/9]]) {
  test(`automatic pair layout: ${name} keeps separate left/right lanes and fits both actors`,()=>{
    for(const widths of [[.7,.8],[1.8,1.4],[.8,2]]){
      const [coachWidth,humanWidth]=widths,fit=practiceLayout({aspect,paired:true,coachWidth,humanWidth,height:2.3});
      assert.ok(fit.coachX<0&&fit.humanX>0);
      assert.ok(fit.coachX+coachWidth/2<fit.humanX-humanWidth/2);
      const visibleWidth=2*fit.distance*Math.tan(35*Math.PI/360)*aspect;
      const visibleHeight=visibleWidth/aspect;
      assert.ok(visibleWidth>=fit.width-1e-9);assert.ok(visibleHeight>=fit.frameHeight-1e-9);
      assert.ok(fit.coachX-coachWidth/2>=-visibleWidth/2);assert.ok(fit.humanX+humanWidth/2<=visibleWidth/2);
    }
  });
}
test('fallback layout is deterministic regardless of source mask; solo coach returns to center',()=>{
  const a=practiceLayout({aspect:.6,paired:true,coachWidth:.7,humanWidth:.7});
  const b=practiceLayout({aspect:.6,paired:true,coachWidth:1.8,humanWidth:1.6});assert.deepEqual(a,b);
  assert.equal(practiceLayout({aspect:1.7}).coachX,0);assert.throws(()=>practiceLayout({aspect:0}));
});


test('half-body input uses the same complete-body framing in portrait and landscape',()=>{
  for(const aspect of [710/1536,1536/710,390/844,844/390]) {
    assert.deepEqual(practiceLayout({aspect,paired:true,portrait:true}),practiceLayout({aspect,paired:true}));
  }
});

test('actual animated coach remains fully inside the camera for half-body input',async()=>{
  const THREE=await import('three');
  const {loadCharacter}=await import('./helpers/character.js');
  const {prepareStandingCoach}=await import('../src/rig.js');
  const model=await loadCharacter(),pose=prepareStandingCoach(model);
  for(const aspect of [710/1536,1536/710,390/844,844/390]) {
    const fit=practiceLayout({aspect,paired:true,portrait:true});
    const camera=new THREE.PerspectiveCamera(35,aspect,.1,100);
    camera.position.set(0,fit.targetY,fit.distance);camera.lookAt(0,fit.targetY,0);camera.updateMatrixWorld();
    for(const [time,movement] of [[0,'reach'],[8,'reach'],[10,'side'],[22,'side'],[10,'open']]) {
      pose(time,movement);
      const box=new THREE.Box3().setFromObject(model,true);
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
        const projected=new THREE.Vector3(x+fit.coachX,y,z).project(camera);
        assert.ok(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95,`${aspect} ${movement}: complete hands/head/feet must fit`);
      }
    }
  }
});

test('camera input cannot introduce a clipping plane on the coach or coach skeleton',async()=>{
  const {readFile}=await import('node:fs/promises');
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/clippingPlanes|coachClip|cropMinY/);
});


test('raised hands to feet occupy 87% of landscape viewport height when width permits, with fixed framing',async()=>{
  const THREE=await import('three');
  const {loadCharacter}=await import('./helpers/character.js');
  const {prepareStandingCoach}=await import('../src/rig.js');
  const model=await loadCharacter(),pose=prepareStandingCoach(model);pose(8,'reach');
  const box=new THREE.Box3().setFromObject(model,true);
  for(const aspect of [1536/710,844/390,16/9])for(const paired of [false,true]){
    const fit=practiceLayout({aspect,paired});
    const camera=new THREE.PerspectiveCamera(35,aspect,.1,100);
    camera.position.set(0,fit.targetY,fit.distance);camera.lookAt(0,fit.targetY,0);camera.updateMatrixWorld();
    const foot=new THREE.Vector3(fit.coachX,box.min.y,box.max.z).project(camera);
    const hand=new THREE.Vector3(fit.coachX,box.max.y,box.max.z).project(camera);
    const fraction=(hand.y-foot.y)/2;
    const expected=paired?Math.min(.87,1.9465994407528504*aspect/4.2):.87;
    assert.ok(Math.abs(fraction-expected)<.005,`${aspect}, pair=${paired}: got ${fraction}`);
    assert.ok(foot.y>-.93&&hand.y<.93,'retain top and bottom breathing room');
  }
});

test('debug avatars gain at least 25% actual screen height and keep full raised hands/feet',async()=>{
 const THREE=await import('three'),{loadCharacter}=await import('./helpers/character.js'),{prepareStandingCoach}=await import('../src/rig.js');
 const model=await loadCharacter(),pose=prepareStandingCoach(model),tan=Math.tan(35*Math.PI/360);
 for(const [screenW,screenH] of [[1536,710],[1152,532]]){
  const rail=Math.min(300,Math.max(150,screenW*.22)),width=screenW-rail-24,oldHeight=screenH-180,newHeight=screenH-88;
  for(const [time,movement] of [[0,'reach'],[8,'reach'],[10,'open']]){
   pose(time,movement);const b=new THREE.Box3().setFromObject(model,true);const heights=[];
   for(const [height,old] of [[oldHeight,true],[newHeight,false]]){
    const f=practiceLayout({aspect:width/height,paired:true}),camera=new THREE.PerspectiveCamera(35,width/height,.1,100),distance=old?.157064+Math.max((1.9465994407528504/.8)/(2*tan),4.2/(2*tan*(width/height))):f.distance;
    camera.position.set(0,f.targetY,distance);camera.lookAt(0,f.targetY,0);camera.updateMatrixWorld();const ys=[];
    for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z]){const p=new THREE.Vector3(x+f.coachX,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);ys.push(p.y);}heights.push((Math.max(...ys)-Math.min(...ys))*height/2);
   }
   assert.ok(heights[1]/heights[0]>=1.25,`${screenW} ${movement}: ${heights}`);
  }
 }
});
