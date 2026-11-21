import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraSession, cameraMessage } from '../src/camera-session.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function harness(overrides = {}) {
  let time = 0, next = 0, stopped = 0, closed = 0, calls = 0, stale = 0;
  const frames = new Map(), timers = new Map(), states = [], results = [];
  const listeners = {};
  const track = { stop: () => stopped++, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = { readyState:2, currentTime:0, play:async () => {}, pause:() => {}, srcObject:null };
  const engine = { detect:async () => ({ landmarks:[] }), close:() => closed++ };
  const session = new CameraSession({ video, mediaDevices: { getUserMedia:async (constraints) => { calls++; assert.equal(constraints.audio,false); assert.equal(constraints.video.facingMode.ideal,'user'); return stream; } }, createEngine:async () => engine,
    onState:(state) => states.push(state), onResult:(value) => results.push(value), onStale:() => stale++,
    now:() => time, requestFrame:(fn) => { frames.set(++next,fn); return next; }, cancelFrame:(id) => frames.delete(id),
    setTimer:(fn) => { timers.set(++next,fn); return next; }, clearTimer:(id) => timers.delete(id),
    getContext:() => ({ key:'reach-hold:true' }), ...overrides });
  return { session, stream, engine, video, states, results, frames, timers, trackEnded: () => listeners.ended(),
    get stopped(){return stopped;}, get closed(){return closed;}, get calls(){return calls;}, get stale(){return stale;},
    async frame(ms = 250, advance = true) { time += ms; if(advance)video.currentTime += .2; const [id,fn] = frames.entries().next().value; frames.delete(id); await fn(); },
  };
}
test('camera is opt-in: creation does not request camera, then start asks only front video', async () => {
  const h = harness(); assert.equal(h.calls,0); await h.session.start();
  assert.equal(h.calls,1); assert.equal(h.session.phase,'active'); assert.equal(h.video.srcObject,h.stream);
  await h.session.start(); assert.equal(h.calls,1); h.session.stop();
});
test('permission denial and insecure/unsupported contexts preserve normal lesson controls', async () => {
  for (const name of ['NotAllowedError','NotFoundError','NotReadableError']) {
    const h = harness({ mediaDevices:{ getUserMedia:async () => { throw { name }; } } });
    await h.session.start(); assert.equal(h.session.phase,'error'); assert.equal(h.video.srcObject,null); assert.equal(h.frames.size,0);
    assert.equal(h.states.at(-1).message,cameraMessage({name}));
  }
  for (const options of [{secure:false},{mediaDevices:null}]) {
    const h = harness(options); await h.session.start(); assert.equal(h.session.phase,'error'); assert.equal(h.calls,0);
  }
});
test('stop releases stream, detector, frame callbacks and clears the video', async () => {
  const h = harness(); await h.session.start(); h.session.stop();
  assert.equal(h.stopped,1); assert.equal(h.closed,1); assert.equal(h.frames.size,0); assert.equal(h.video.srcObject,null);
});
test('device disconnection releases resources and returns to an explicit restart state', async () => {
  const h = harness(); await h.session.start(); h.trackEnded();
  assert.equal(h.session.phase,'idle'); assert.equal(h.closed,1); assert.equal(h.stopped,1);
  assert.equal(h.frames.size,0); assert.match(h.states.at(-1).message,/中斷/);
});
test('cancel while permission dialog is pending: late stream is immediately stopped', async () => {
  const request = deferred(); const h = harness({mediaDevices:{getUserMedia:() => request.promise}});
  const starting = h.session.start(); h.session.stop(); request.resolve(h.stream); await starting;
  assert.equal(h.session.phase,'idle'); assert.equal(h.stopped,1); assert.equal(h.video.srcObject,null);
});
test('cancel while model loads closes a late detector and never restarts analysis', async () => {
  const loading = deferred(); const h = harness({ createEngine:() => loading.promise });
  const starting = h.session.start(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.session.phase,'loading'); h.session.stop(); loading.resolve(h.engine); await starting;
  assert.equal(h.stopped,1); assert.equal(h.closed,1); assert.equal(h.frames.size,0);
});
test('model load failure closes camera and supports a clean retry', async () => {
  const h = harness({createEngine:async () => {throw new Error('download failed');}});
  await h.session.start(); assert.equal(h.session.phase,'error'); assert.equal(h.stopped,1);
  h.session.createEngine = async () => h.engine; await h.session.start(); assert.equal(h.session.phase,'active'); h.session.stop();
});
test('frame throttling: no duplicate video frame; only one inference can be in flight', async () => {
  const waiting = deferred(); const h = harness(); let count = 0;
  h.engine.detect = async () => { count++; return waiting.promise; };
  await h.session.start(); const first = h.frame(); await Promise.resolve();
  assert.equal(count,1); assert.equal(h.frames.size,0);
  waiting.resolve({landmarks:[]}); await first; assert.equal(h.frames.size,1);
  await h.frame(250,false); assert.equal(count,1); h.session.stop();
});
test('late inference after stop is discarded without publishing old observations', async () => {
  const waiting = deferred(); const h = harness(); h.engine.detect = () => waiting.promise;
  await h.session.start(); const first = h.frame(); h.session.stop(); waiting.resolve({landmarks:[[{}]]}); await first;
  assert.equal(h.results.length,0); assert.equal(h.frames.size,0); assert.equal(h.timers.size,0);
});
test('a stalled video or slow inference clears stale feedback', async () => {
  const h = harness(); await h.session.start(); await h.frame();
  await h.frame(1600,false); assert.equal(h.stale,1); h.session.stop();
  const waiting = deferred(); const slow = harness(); slow.engine.detect = () => waiting.promise;
  await slow.session.start(); const pending = slow.frame();
  for (const fn of slow.timers.values()) fn(); assert.equal(slow.stale,1);
  slow.session.stop(); waiting.resolve({landmarks:[]}); await pending;
});
test('inference failure stops camera and detector instead of keeping stale feedback', async () => {
  const h = harness(); h.engine.detect = async () => {throw new Error('inference failed');};
  await h.session.start(); await h.frame(); assert.equal(h.session.phase,'error'); assert.equal(h.stopped,1); assert.equal(h.closed,1); assert.equal(h.results.length,0);
});
test('human segmentation is opt-in per captured context and follows the same single-frame scheduler', async () => {
  let segment=false;const options=[];
  const h=harness({getContext:()=>({key:'reach',segment,humanToken:segment?2:1})});
  h.engine.detect=async (video,stamp,option)=>{options.push(option);return {landmarks:[]};};
  await h.session.start();await h.frame();assert.equal(options[0].segment,false);
  segment=true;await h.frame();assert.equal(options[1].segment,true);assert.equal(h.results[1].context.humanToken,2);
  segment=false;await h.frame();assert.equal(options[2].segment,false);h.session.stop();
});

test('camera diagnostics distinguish an in-flight first inference from video that stopped advancing',async()=>{
 const pending=deferred(),h=harness();h.engine.detect=()=>pending.promise;h.engine.diagnostics={stage:'portrait-loading'};await h.session.start();const run=h.frame(250);await Promise.resolve();
 const busy=h.session.diagnostics;assert.equal(busy.inFlight,true);assert.equal(busy.attempts,1);assert.equal(busy.accepted,0);assert.equal(busy.lastAcceptedAgeMs,null);assert.equal(busy.engine.stage,'portrait-loading');
 pending.resolve({landmarks:[]});await run;assert.equal(h.session.diagnostics.accepted,1);assert.equal(h.session.diagnostics.inFlight,false);
 await h.frame(1600,false);assert.equal(h.session.diagnostics.attempts,1);assert.ok(h.session.diagnostics.lastAcceptedAgeMs>=1600);h.session.stop();
});
test('camera failure has a stable error code and stopped inference cannot modify later session counters',async()=>{
 const h=harness();h.engine.detect=async()=>{throw Object.assign(new Error('not persisted'),{code:'POSE_REQUEST_TIMEOUT'});};await h.session.start();await h.frame();assert.equal(h.session.diagnostics.lastError,'POSE_REQUEST_TIMEOUT');assert.equal(h.session.diagnostics.inFlight,false);assert.doesNotMatch(JSON.stringify(h.session.diagnostics),/not persisted/);h.session.stop();
});
