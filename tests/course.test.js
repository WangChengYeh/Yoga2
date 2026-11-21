import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, COURSE_DURATION, courseFrame, motionAt, cueAt, lessonStart, createPlayback, reducePlayback, formatTime } from '../src/course.js';

test('course: all three movements run in order with exact boundary countdowns', () => {
  assert.equal(COURSE_DURATION, 68);
  assert.equal(courseFrame(0).lesson.id, 'reach');
  assert.equal(courseFrame(15.99).lesson.id, 'reach');
  assert.equal(courseFrame(16).lesson.id, 'side');
  assert.equal(courseFrame(16).localTime, 0);
  assert.equal(courseFrame(16).remaining, 32);
  assert.equal(courseFrame(48).lesson.id, 'open');
  assert.equal(courseFrame(68).remaining, 0);
  assert.equal(courseFrame(68).complete, true);
  assert.deepEqual(LESSONS.map((_, index) => lessonStart(index)), [0, 16, 48]);
});
for (const lesson of LESSONS) {
  test(`${lesson.id}: movement starts and ends in the same standing pose with continuous phases`, () => {
    const start = motionAt(lesson.id, 0), end = motionAt(lesson.id, lesson.duration);
    for (const key of ['armAngle', 'lean', 'depth']) assert.ok(Math.abs(start[key] - end[key]) < 1e-10);
    let previous = start;
    for (let time = .01; time <= lesson.duration; time += .01) {
      const value = motionAt(lesson.id, time);
      for (const key of ['armAngle', 'lean', 'depth']) {
        assert.ok(Number.isFinite(value[key]));
        assert.ok(Math.abs(value[key] - previous[key]) < .02, `no snap in ${key} at ${time}`);
      }
      assert.ok(cueAt(lesson.id, time).label.length > 0);
      previous = value;
    }
  });
}
test('side: both sides have equal opposite holds and a neutral midpoint', () => {
  assert.ok(motionAt('side', 10).lean > .2);
  assert.equal(motionAt('side', 10).lean, -motionAt('side', 22).lean);
  assert.equal(motionAt('side', 16).lean, 0);
  assert.equal(cueAt('side', 10).label, '教練右側伸展');
  assert.equal(cueAt('side', 22).label, '教練左側伸展');
});
test('open: arms extend sideways with chest opening, without torso backbend', () => {
  assert.equal(motionAt('open', 10).armAngle, Math.PI / 2);
  assert.ok(motionAt('open', 10).depth < 0);
  assert.equal(motionAt('open', 10).lean, 0);
});
test('pause/resume: time freezes while paused and resumes from the same point', () => {
  let state = reducePlayback(createPlayback(), { type: 'toggle' });
  state = reducePlayback(state, { type: 'tick', delta: 5 });
  state = reducePlayback(state, { type: 'toggle' });
  state = reducePlayback(state, { type: 'tick', delta: 20 });
  assert.equal(state.time, 5);
  state = reducePlayback(state, { type: 'toggle' });
  assert.equal(reducePlayback(state, { type: 'tick', delta: 2 }).time, 7);
});
test('restart: repeated restarts reset the same clock without double counting', () => {
  let state = { ...createPlayback(), time: 42 };
  for (let i = 0; i < 10; i++) state = reducePlayback(state, { type: 'restart' });
  assert.equal(state.time, 0); assert.equal(state.playing, true);
  assert.equal(reducePlayback(state, { type: 'tick', delta: 1 }).time, 1);
});
test('speed: animation, movement countdown and course countdown share one clock', () => {
  let state = reducePlayback(createPlayback(), { type: 'restart' });
  state = reducePlayback(state, { type: 'speed', speed: .5 });
  state = reducePlayback(state, { type: 'tick', delta: 10 });
  assert.equal(state.time, 5); assert.equal(courseFrame(state.time).remaining, 11);
  state = reducePlayback(state, { type: 'speed', speed: 1.5 });
  state = reducePlayback(state, { type: 'tick', delta: 10 });
  assert.equal(state.time, 20);
  assert.equal(courseFrame(state.time).lesson.id, 'side');
  assert.equal(courseFrame(state.time).remaining, 28);
  assert.equal(COURSE_DURATION - state.time, 48);
});
test('seek and selection: paused previews do not play; bounds and completion are clamped', () => {
  let state = reducePlayback({ ...createPlayback(), playing: true }, { type: 'seek', time: lessonStart(2), pause: true });
  assert.equal(state.playing, false); assert.equal(state.time, 48);
  assert.equal(reducePlayback(state, { type: 'tick', delta: 2 }).time, 48);
  state = reducePlayback(state, { type: 'seek', time: 999 });
  assert.equal(state.time, 68); assert.equal(state.playing, false);
  state = reducePlayback(state, { type: 'toggle' });
  assert.equal(state.time, 0); assert.equal(state.playing, true);
  assert.equal(reducePlayback(state, { type: 'seek', time: -5 }).time, 0);
});
test('completion and background pause: stop exactly at end and preserve the resume point', () => {
  let state = reducePlayback(createPlayback(), { type: 'restart' });
  state = reducePlayback(state, { type: 'tick', delta: 66 });
  state = reducePlayback(state, { type: 'pause' });
  assert.equal(reducePlayback(state, { type: 'tick', delta: 60 }).time, 66);
  state = reducePlayback(state, { type: 'toggle' });
  state = reducePlayback(state, { type: 'tick', delta: 10 });
  assert.equal(state.time, 68); assert.equal(state.playing, false);
  assert.equal(reducePlayback(state, { type: 'tick', delta: 100 }).time, 68);
});
test('timing: a slow frame does not lose elapsed time and formatted countdown never goes negative', () => {
  const state = { ...createPlayback(), playing: true };
  assert.equal(reducePlayback(state, { type: 'tick', delta: 2 }).time, 2);
  assert.equal(reducePlayback(state, { type: 'tick', delta: -2 }).time, 0);
  assert.equal(reducePlayback(state, { type: 'tick', delta: NaN }).time, 0);
  assert.equal(formatTime(68), '01:08');
  assert.equal(formatTime(.1), '00:01');
  assert.equal(formatTime(-1), '00:00');
});
