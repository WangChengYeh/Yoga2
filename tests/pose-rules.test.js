import test from 'node:test';
import assert from 'node:assert/strict';
import { observePose, FeedbackFilter, feedbackWindow, feedbackKey, REQUIRED_POINTS, isFreshResult } from '../src/pose-rules.js';
import { courseFrame } from '../src/course.js';

function body() {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .99, presence: .99 }));
  const coords = { 0:[.5,.14],11:[.6,.32],12:[.4,.32],13:[.65,.45],14:[.35,.45],15:[.64,.54],16:[.36,.54],23:[.55,.58],24:[.45,.58],25:[.56,.75],26:[.44,.75],27:[.56,.89],28:[.44,.89],31:[.58,.92],32:[.42,.92] };
  for (const [index, [x,y]] of Object.entries(coords)) Object.assign(points[index], { x,y });
  return points;
}
const up = () => { const points = body(); points[15].y = points[16].y = .07; return points; };
const check = (points, time, options = {}) => observePose([points], courseFrame(time), { playing: true, aspect: .75, ...options });

test('stale results from a previous lesson, pause state or delayed frame are rejected', () => {
  const key = feedbackKey(courseFrame(8), true), data = { context:{ key }, capturedAt:100 };
  assert.equal(isFreshResult(data,key,300),true);
  assert.equal(isFreshResult(data,feedbackKey(courseFrame(26),true),300),false);
  assert.equal(isFreshResult(data,feedbackKey(courseFrame(8),false),300),false);
  assert.equal(isFreshResult(data,key,1700),false);
  assert.equal(isFreshResult(data,key,50),false);
});

test('reach feedback: both wrists above the nose are observed; low hands get a limited hint', () => {
  assert.equal(check(up(), 8).code, 'reach-seen');
  assert.equal(check(body(), 8).code, 'reach-hands');
  const one = up(); one[16].y = .5;
  assert.equal(check(one, 8).code, 'reach-hands');
});
test('side feedback: right and left holds follow anatomical directions even when mirrored', () => {
  for (const [time, dx] of [[26,-.08],[38,.08]]) {
    const points = up();
    for (const index of [0,11,12,13,14,15,16]) points[index].x += dx;
    assert.equal(check(points, time).code, 'side-seen');
    assert.equal(check(points.map((p) => ({ ...p, x: 1 - p.x })), time).code, 'side-seen');
    assert.equal(check(points, time === 26 ? 38 : 26).code, 'side-direction');
  }
  assert.equal(check(body(), 26).code, 'side-hands');
});
test('open feedback: only spread and shoulder-level wrists are observed, no depth claim', () => {
  const points = body(); points[15].x = .8; points[16].x = .2; points[15].y = points[16].y = .32;
  const observed = check(points, 58);
  assert.equal(observed.code, 'open-seen'); assert.match(observed.message, /無法確認/);
  points[16].y = .55; assert.equal(check(points, 58).code, 'open-level');
  points[16].y = .32; points[15].x = .61; points[16].x = .39;
  assert.equal(check(points, 58).code, 'open-level');
});
test('confidence gate: each required joint can independently suppress all pose feedback', () => {
  for (const index of REQUIRED_POINTS) {
    const points = up(); points[index].visibility = .3;
    const value = check(points, 8);
    assert.equal(value.code, 'uncertain'); assert.equal(value.valid, false);
  }
  const points = up(); delete points[15].visibility;
  assert.equal(check(points, 8).code, 'uncertain');
  points[15].visibility = .99; points[15].presence = .1;
  assert.equal(check(points, 8).code, 'uncertain');
});
test('framing gate: missing person, multiple people, out-of-frame feet and hands stop judgment', () => {
  assert.equal(observePose([], courseFrame(8)).code, 'missing');
  assert.equal(observePose([up(), up()], courseFrame(8)).code, 'multiple');
  for (const index of [0,15,16,27,28,31,32]) {
    const points = up(); points[index].y = 1.02;
    assert.equal(check(points, 8).code, 'cropped');
  }
});
test('lighting and orientation: dark, sideways, malformed and too-small frames do not judge', () => {
  assert.equal(check(up(), 8, { brightness: 20 }).code, 'dark');
  const side = up(); side[11].x = .51; side[12].x = .49;
  assert.equal(check(side, 8).code, 'front');
  const invalid = up(); invalid[15].x = NaN;
  assert.equal(check(invalid, 8).code, 'uncertain');
  const small = up().map((p) => ({ ...p, x: .5 + (p.x - .5)*.4, y: .5 + (p.y - .5)*.4 }));
  assert.equal(check(small, 8).code, 'small');
});
test('transitions, paused playback and course completion never judge a yoga movement', () => {
  for (const time of [2,17,30,45,50,65]) assert.equal(check(up(), time).code, 'transition');
  assert.equal(check(up(), 8, { playing: false }).code, 'positioned');
  assert.equal(check(up(), 68).code, 'positioned');
  assert.equal(feedbackWindow(courseFrame(26)), 'side-right');
  assert.equal(feedbackWindow(courseFrame(38)), 'side-left');
  assert.notEqual(feedbackKey(courseFrame(8), true), feedbackKey(courseFrame(8), false));
});
test('stability filter: three agreeing samples over 450 ms; one bad frame clears old praise', () => {
  const filter = new FeedbackFilter(), seen = check(up(), 8), key = 'reach-hold:true';
  assert.equal(filter.update(seen, key, 0).code, 'stabilizing');
  assert.equal(filter.update(seen, key, 230).code, 'stabilizing');
  assert.equal(filter.update(seen, key, 460).code, 'reach-seen');
  assert.equal(filter.update({ code:'uncertain', message:'uncertain', valid:false }, key, 500).code, 'uncertain');
  assert.equal(filter.update(seen, key, 550).code, 'stabilizing');
});
test('filter resets at movement changes and long gaps; alternating detections do not chatter', () => {
  const filter = new FeedbackFilter(), seen = check(up(),8), hint = check(body(),8);
  for (let i = 0; i < 10; i++) assert.equal(filter.update(i%2 ? seen : hint,'reach',i*200).code,'stabilizing');
  filter.reset(); filter.update(seen,'reach',0); filter.update(seen,'reach',230);
  assert.equal(filter.update(seen,'reach',460).code,'reach-seen');
  assert.equal(filter.update(seen,'side',600).code,'stabilizing');
  assert.equal(filter.update(seen,'side',2000).code,'stabilizing');
});
