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
test('stretching or wider masks cannot move either lane or change zoom; solo coach returns to center',()=>{
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
