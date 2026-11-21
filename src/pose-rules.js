// Conservative, image-space observations only. These are prototype thresholds,
// not a clinical assessment or a verdict that a yoga pose is safe/correct.
export const REQUIRED_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
export const CONNECTIONS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,31],[24,26],[26,28],[28,32]];
const result = (code, message, kind = 'info', valid = false) => ({ code, message, kind, valid });
export const visible = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.visibility) && point.visibility >= .65 && (point.presence === undefined || (Number.isFinite(point.presence) && point.presence >= .6));
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function feedbackWindow(frame) {
  if (frame.complete) return 'complete';
  const { id } = frame.lesson, t = frame.localTime;
  if (id === 'reach' && t >= 6 && t < 10) return 'reach-hold';
  if (id === 'side' && t >= 8 && t < 12) return 'side-right';
  if (id === 'side' && t >= 20 && t < 24) return 'side-left';
  if (id === 'open' && t >= 6 && t < 14) return 'open-hold';
  return `${id}-transition`;
}
export const feedbackKey = (frame, playing) => `${feedbackWindow(frame)}:${Boolean(playing)}`;
export const isFreshResult = (data, currentKey, now) => data?.context?.key === currentKey && Number.isFinite(data.capturedAt) && now >= data.capturedAt && now - data.capturedAt <= 1500;

export function observePose(poses, frame, { playing = false, aspect = 1, brightness = null } = {}) {
  if (Number.isFinite(brightness) && brightness < 32) return result('dark', '畫面偏暗，請增加光線，暫停動作判斷。', 'setup');
  if (!poses?.length) return result('missing', '還沒看清楚你，請讓頭、雙手與雙腳完整入鏡。', 'setup');
  if (poses.length !== 1) return result('multiple', '畫面中請只留一位練習者，暫停動作判斷。', 'setup');
  const points = poses[0];
  if (!REQUIRED_POINTS.every((index) => visible(points?.[index]))) return result('uncertain', '部分關節看不清楚，請調整站位或光線；暫停動作判斷。', 'setup');
  if (REQUIRED_POINTS.some((index) => points[index].x < .025 || points[index].x > .975 || points[index].y < .025 || points[index].y > .975)) return result('cropped', '請把手機放遠一點，讓頭、雙手與雙腳留在畫面內。', 'setup');
  const shoulder = midpoint(points[11], points[12]), hip = midpoint(points[23], points[24]);
  const torso = hip.y - shoulder.y;
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = Math.abs(points[11].x - points[12].x) * ratio;
  if (torso < .06 || width < torso * .4) return result('front', '請正面面向手機、保持手機直立，暫停動作判斷。', 'setup');
  const ys = REQUIRED_POINTS.map((index) => points[index].y);
  if (Math.max(...ys) - Math.min(...ys) < .35) return result('small', '你在畫面中有點小，請稍微靠近，並保持全身入鏡。', 'setup');
  if (!playing || frame.complete) return result('positioned', '主要關節已入鏡。按開始／繼續後，在動作停留時提供觀察。', 'info', true);
  const window = feedbackWindow(frame);
  if (window.endsWith('transition')) return result('transition', '目前是動作銜接，先跟著教練，停留時再觀察。', 'info', true);
  const handsUp = points[15].y < points[0].y - torso * .05 && points[16].y < points[0].y - torso * .05;
  if (window === 'reach-hold') return handsUp
    ? result('reach-seen', '目前觀察到雙手高於頭部。', 'observed', true)
    : result('reach-hands', '雙手還沒出現在頭部上方；請以舒適幅度跟隨教練。', 'hint', true);
  if (window.startsWith('side-')) {
    if (!handsUp) return result('side-hands', '先觀察雙手是否在頭部上方，再跟隨側伸展。', 'hint', true);
    // Anatomical right is inferred from labelled shoulders. Mirroring the
    // preview or the input does not swap the expected anatomical direction.
    const rightSign = Math.sign(points[12].x - points[11].x);
    const degrees = Math.atan2((shoulder.x - hip.x) * ratio * rightSign, torso) * 180 / Math.PI;
    const expected = window === 'side-right' ? 1 : -1;
    if (Math.abs(degrees) > 30) return result('side-range', '畫面中的側傾幅度較大，先回到較小、舒適的幅度。', 'hint', true);
    if (degrees * expected >= 6) return result('side-seen', `目前觀察到上半身向你的${expected === 1 ? '右' : '左'}側傾斜。`, 'observed', true);
    return result('side-direction', `教練目前向她的${expected === 1 ? '右' : '左'}側伸展；請留意身體左右，而非畫面左右。`, 'hint', true);
  }
  const level = [15, 16].every((index) => Math.abs(points[index].y - shoulder.y) < torso * .3);
  const spread = Math.abs(points[15].x - points[16].x) * ratio > width * 1.5;
  return level && spread
    ? result('open-seen', '目前觀察到雙臂展開，雙手接近肩膀高度；鏡頭無法確認向後開胸。', 'observed', true)
    : result('open-level', '請觀察雙臂是否展開、雙手是否接近肩膀高度。', 'hint', true);
}

// Valid feedback must agree across >=3 samples and >=450 ms. Uncertain input
// clears the previous observation immediately; stale feedback is never retained.
export class FeedbackFilter {
  reset() { this.key = null; this.code = null; this.count = 0; this.since = 0; this.last = -Infinity; this.shown = null; this.changed = -Infinity; }
  constructor() { this.reset(); }
  update(observation, key, now) {
    if (this.key !== key || now - this.last > 1200 || now < this.last) { this.reset(); this.key = key; }
    this.last = now;
    if (!observation.valid) { this.code = null; this.count = 0; this.shown = null; return observation; }
    if (this.code !== observation.code) { this.code = observation.code; this.count = 1; this.since = now; }
    else this.count++;
    if (this.count >= 3 && now - this.since >= 450 && (this.shown?.code === observation.code || now - this.changed >= 1000)) {
      if (this.shown?.code !== observation.code) this.changed = now;
      this.shown = observation;
      return observation;
    }
    return result('stabilizing', '正在確認畫面是否穩定，暫停動作判斷。', 'info');
  }
}
