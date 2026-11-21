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
test('wider people/raised arms automatically increase framing distance, solo coach returns to center',()=>{
  const a=practiceLayout({aspect:.6,paired:true,coachWidth:.7,humanWidth:.7});
  const b=practiceLayout({aspect:.6,paired:true,coachWidth:1.8,humanWidth:1.6});assert.ok(b.distance>a.distance);
  assert.equal(practiceLayout({aspect:1.7}).coachX,0);assert.throws(()=>practiceLayout({aspect:0}));
});
