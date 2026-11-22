import test from 'node:test';
import assert from 'node:assert/strict';
import { courseFrame } from '../src/course.js';
import { evaluatePose, PoseEvaluationEngine, jointAngle2D, coursePoseTarget } from '../src/pose-evaluation.js';
import { REQUIRED_POINTS } from '../src/pose-rules.js';
import { poseSample } from './helpers/pose-samples.js';
const evaluate=(time=8,settings={},options={})=>evaluatePose(poseSample(time,settings),courseFrame(time),{playing:true,now:0,aspect:settings.aspect||.75,...options});

test('three course targets match the course motion, with anatomical mirrored side direction',()=>{
 for(const time of [8,26,38,58])for(const mirror of [false,true]){
  const result=evaluate(time,{mirror});assert.equal(result.status,'matched',`${time} mirror=${mirror}`);assert.equal(result.hints.length,0);assert.equal(result.source,'original-mediapipe');
  assert.ok(Math.abs(result.metrics.leftArmElevation-result.target.armElevation)<.2);assert.equal(result.target.depthEvaluated,false);
 }
 assert.equal(coursePoseTarget(courseFrame(26)).torsoLean,16);assert.equal(coursePoseTarget(courseFrame(38)).torsoLean,-16);
 assert.match(evaluate(58).message,/無法確認/);
});
test('angles compensate camera aspect; zero-length bones never produce a verdict',()=>{
 for(const aspect of [.75,1,16/9])assert.equal(evaluate(8,{aspect}).status,'matched');
 assert.equal(jointAngle2D({x:0,y:1},{x:0,y:0},{x:1,y:0}),90);
 const data=poseSample();data.landmarks[0][13]={...data.landmarks[0][11]};
 assert.equal(evaluatePose(data,courseFrame(8),{playing:true,now:0,aspect:.75}).code,'degenerate');
});
test('bent elbows, lowered arms, asymmetry and opposite side produce distinct structured hints',()=>{
 const bent=evaluate(8,{elbowBend:1});assert.ok(bent.hints.some(h=>h.code==='left-elbow-bent'));
 const low=evaluate(8,{armOffset:-.7});const hint=low.hints.find(h=>h.code==='left-arm-elevation');
 assert.equal(hint.joint,'leftShoulder');assert.equal(hint.severity,'correction');assert.equal(hint.expiresAt,1500);assert.equal(hint.ttlMs,1500);assert.ok(hint.confidence>=.65);
 const data=poseSample();data.landmarks[0][14].y=.48;data.landmarks[0][16].y=.6;
 assert.ok(evaluatePose(data,courseFrame(8),{now:0,playing:true,aspect:.75}).hints.some(h=>h.code==='arm-asymmetry'));
 const opposite=evaluate(26,{leanOffset:-.56});assert.ok(opposite.hints.some(h=>h.code==='torso-direction'));
});
test('all confidence/framing/person/light/freshness gates yield unknown with no corrections',()=>{
 const mutations=[d=>d.landmarks=[],d=>d.landmarks.push(d.landmarks[0]),d=>d.brightness=10,d=>d.capturedAt=-1501,d=>d.capturedAt=1,
  ...REQUIRED_POINTS.map(i=>d=>d.landmarks[0][i].visibility=.1),d=>d.landmarks[0][15].x=1.1,d=>d.landmarks[0][13].x=NaN,
  d=>d.landmarks[0][15].presence=.1];
 for(const mutate of mutations){const data=poseSample();mutate(data);const r=evaluatePose(data,courseFrame(8),{now:0,playing:true,aspect:.75});assert.equal(r.status,'unknown');assert.deepEqual(r.hints,[]);assert.equal(r.valid,false);}
 assert.equal(evaluate(8,{}, {aspect:0}).code,'invalid-aspect');
 assert.equal(evaluatePose(poseSample(),null,{now:0}).code,'invalid-target');
});
test('pause, complete and transitions supply no corrections or praise',()=>{
 assert.equal(evaluate(8,{}, {playing:false}).status,'paused');
 for(const time of [2,17,30,45,50,65]){const r=evaluate(time);assert.equal(r.status,'transition');assert.equal(r.valid,false);assert.deepEqual(r.hints,[]);}
 assert.equal(evaluate(68).status,'paused');
});
function feed(engine,time,start,settings={}){let r;for(const offset of [0,250,500])r=engine.update(poseSample(time,{...settings,capturedAt:start+offset}),courseFrame(time),{now:start+offset,playing:true,aspect:.75});return r;}
test('independent samples confirm after 450 ms; corrected pose clears hints after confirmation',()=>{
 const engine=new PoseEvaluationEngine();assert.equal(engine.update(poseSample(),courseFrame(8),{now:0,playing:true,aspect:.75}).status,'stabilizing');
 let r=feed(engine,8,100,{armOffset:-.7});assert.equal(r.status,'correction');assert.ok(r.hints.length);
 r=engine.update(poseSample(8,{capturedAt:700}),courseFrame(8),{now:700,playing:true,aspect:.75});assert.equal(r.status,'stabilizing');assert.deepEqual(r.hints,[]);
 assert.equal(feed(engine,8,800).status,'matched');
});
test('hysteresis keeps a confirmed error inside the exit margin; smaller correction clears it',()=>{
 const engine=new PoseEvaluationEngine();assert.equal(feed(engine,8,0,{armOffset:-26/180*Math.PI}).status,'correction');
 assert.equal(feed(engine,8,600,{armOffset:-20/180*Math.PI}).status,'correction');
 assert.equal(feed(engine,8,1200,{armOffset:-17/180*Math.PI}).status,'matched');
});
test('unknown, expiry, duplicate frames, backward clocks, gaps and target changes cannot retain old hints',()=>{
 const engine=new PoseEvaluationEngine();feed(engine,8,0,{armOffset:-.7});assert.ok(engine.snapshot(600).hints.length);
 assert.equal(engine.snapshot(2000).status,'unknown');assert.deepEqual(engine.snapshot(2000).hints,[]);
 const bad=poseSample(8,{capturedAt:600});bad.landmarks[0][15].visibility=0;
 assert.equal(engine.update(bad,courseFrame(8),{now:600,playing:true,aspect:.75}).status,'unknown');
 assert.equal(feed(engine,8,700).status,'matched');
 const repeated=poseSample(8,{capturedAt:1200});assert.equal(engine.update(repeated,courseFrame(8),{now:1250,playing:true,aspect:.75}).code,'duplicate');
 assert.equal(engine.update(poseSample(58,{capturedAt:1300}),courseFrame(58),{now:1300,playing:true,aspect:.75}).status,'stabilizing');
 assert.equal(engine.update(poseSample(58,{capturedAt:3000}),courseFrame(58),{now:3000,playing:true,aspect:.75}).status,'stabilizing');
 assert.equal(engine.update(poseSample(58,{capturedAt:2000}),courseFrame(58),{now:2000,playing:true,aspect:.75}).status,'stabilizing');
});
