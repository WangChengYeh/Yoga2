import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUtterance, respondToUtterance } from '../src/voice-intents.js';
import { reducePlayback } from '../src/course.js';
const state = (extra={}) => ({ready:true,time:25,playing:true,speed:1,...extra});
const respond = (text,current=state(),extra={}) => respondToUtterance(text,{state:current,now:1000,...extra});
test('slow: step through 1.5x, 1x, 0.5x and stop at minimum speed', () => {
  let current=state({speed:1.5});
  for(const expected of [1,.5]){const value=respond('慢一點',current);current=reducePlayback(current,value.action);assert.equal(current.speed,expected);}
  assert.equal(respond('慢一點',current).action,null);
});
test('repeat: restart current movement, preserving speed; at course end restart whole course', () => {
  let current=state({speed:.5});current=reducePlayback(current,respond('再一次',current).action);
  assert.equal(current.time,16);assert.equal(current.playing,true);assert.equal(current.speed,.5);
  current=state({time:68,playing:false});current=reducePlayback(current,respond('再一次',current).action);
  assert.equal(current.time,0);assert.equal(current.playing,true);
});
test('pause: repeated pause is idempotent and does not resume the lesson', () => {
  let current=state();current=reducePlayback(current,respond('暫停',current).action);
  assert.equal(current.playing,false);assert.equal(current.time,25);
  assert.equal(respond('暫停',current).action,null);
});
test('resume: repeated resume never pauses; completed lesson requires explicit repeat', () => {
  let current=state({playing:false});current=reducePlayback(current,respond('繼續',current).action);
  assert.equal(current.playing,true);assert.equal(respond('繼續',current).action,null);
  assert.equal(respond('繼續',state({time:68,playing:false})).action,null);
});
test('all four controls wait until model is ready and cannot bypass failed loading', () => {
  for(const text of ['慢一點','再一次','暫停','繼續'])assert.equal(respond(text,state({ready:false})).action,null);
});
test('recognition grammar accepts polite Mandarin and punctuation, rejects negation and mixed commands', () => {
  assert.equal(classifyUtterance('教練，請慢一點！'),'slow');
  assert.equal(classifyUtterance('可以继续吗'),'resume');
  for(const text of ['不要暫停','暫停然後繼續','導航說繼續直走','不要再一次','我剛才說了慢一點但是現在不要'])assert.equal(classifyUtterance(text),'unknown');
  assert.equal(respond('聽不懂的話').action,null);
});
test('course questions use current movement, next movement, remaining content time and instructions', () => {
  assert.match(respond('現在做什麼').reply,/左右側伸展/);
  assert.match(respond('下一個動作').reply,/展臂開胸/);
  assert.match(respond('還有多久').reply,/43秒/);
  assert.match(respond('怎麼做').reply,/雙臂/);
  for(const text of ['現在做什麼','下一個動作','還有多久','怎麼做'])assert.equal(respond(text).action,null);
});
test('pose questions use only fresh limited observations, never guess correctness or use images', () => {
  assert.match(respond('我做得對嗎').reply,/相機還沒開啟/);
  assert.match(respond('我的姿勢如何',state(),{pose:{active:true,valid:false}}).reply,/沒有穩定/);
  const pose={active:true,valid:true,updatedAt:500,message:'目前觀察到雙手高於頭部。'};
  assert.match(respond('我的姿勢如何',state(),{pose}).reply,/不代表整個動作正確/);
  assert.match(respond('我的姿勢如何',state(),{pose:{...pose,updatedAt:-2000}}).reply,/沒有穩定/);
});
