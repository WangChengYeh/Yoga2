import test from 'node:test';
import assert from 'node:assert/strict';
import {HintManager} from '../src/hint-manager.js';
const evaluation=(hints)=>({status:'correction',valid:true,expiresAt:1500,hints:hints.map(([code,error])=>({code,message:code,measured:error,target:0,error,confidence:.9,expiresAt:1500}))});
test('display priority and stable identity are independent of metric changes; state stays bounded',()=>{
 let now=0;const manager=new HintManager({now:()=>now});let r=manager.acceptEvaluation(evaluation([['left-arm-elevation',40],['torso-direction',20]]),{scope:'side'});assert.equal(r.code,'torso-direction');
 now=300;r=manager.acceptEvaluation(evaluation([['left-arm-elevation',60],['torso-direction',15]]),{scope:'side'});assert.equal(r.code,'torso-direction');assert.equal(r.values.error,15);assert.equal(manager.diagnostics.replaced,0);assert.equal(manager.diagnostics.numericUpdates,1);
 for(let i=0;i<100;i++)manager.acceptEvaluation(evaluation([['left-arm-elevation',40]]),{scope:'side'});
 assert.equal(manager.diagnostics.pending,1);assert.equal(manager.diagnostics.replaced,1);assert.equal(manager.speechCandidate.code,'left-arm-elevation');
});
test('scope/generation reject late supplements; unknown/correction clearing and expiry are immediate',()=>{
 let now=0;const manager=new HintManager({now:()=>now});manager.acceptEvaluation(evaluation([['left-arm-elevation',40]]),{scope:'reach'});const old=manager.token;
 manager.setScope('open');assert.equal(manager.publish({id:'late',source:'llm',message:'late',expiresAt:1500},old),false);
 manager.acceptEvaluation({status:'matched',valid:true,code:'open-matched',message:'observed',kind:'observed',expiresAt:1500},{scope:'open'});const token=manager.token;
 manager.publish({id:'advice',source:'llm',priority:5,message:'advice',expiresAt:2000},token);assert.equal(manager.snapshot().code,'open-matched');
 const unknown={status:'unknown',valid:false,code:'uncertain',message:'unknown',kind:'setup',expiresAt:null};assert.equal(manager.acceptEvaluation(unknown,{scope:'open'}).code,'uncertain');assert.equal(manager.diagnostics.pending,1);
 now=1600;assert.equal(manager.snapshot(),null);assert.equal(manager.diagnostics.expired,1);manager.reset();assert.equal(manager.publish({id:'late',message:'late',expiresAt:3000},token),false);
});
test('capacity and expired arrivals cannot grow a display queue',()=>{
 let now=0;const manager=new HintManager({now:()=>now,capacity:2});manager.setScope('reach');for(let i=0;i<100;i++)manager.publish({id:String(i),source:'llm',message:'supplement',expiresAt:1000});assert.equal(manager.diagnostics.pending,2);assert.equal(manager.diagnostics.suppressed,98);
 now=1000;assert.equal(manager.snapshot(),null);assert.equal(manager.publish({id:'old',message:'old',expiresAt:1000}),false);
});
