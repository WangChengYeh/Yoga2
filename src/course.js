import { armAngleAt, phaseAt } from './motion.js';

export const LESSONS = Object.freeze([
  Object.freeze({ id: 'reach', name: '站姿上舉伸展', english: 'Standing arm stretch', duration: 16, description: '雙臂從身側緩緩上舉，停留，再慢慢放下。' }),
  Object.freeze({ id: 'side', name: '左右側伸展', english: 'Standing side stretch', duration: 32, description: '雙臂上舉，依序向兩側輕輕伸展，再回到站姿。' }),
  Object.freeze({ id: 'open', name: '展臂開胸', english: 'Standing chest opening', duration: 20, description: '雙臂向兩側展開，輕輕向後舒展，再放回身側。' }),
]);
export const COURSE_DURATION = LESSONS.reduce((sum, lesson) => sum + lesson.duration, 0);
export const lessonStart = (index) => LESSONS.slice(0, index).reduce((sum, lesson) => sum + lesson.duration, 0);
const clamp = (time, duration) => Math.max(0, Math.min(duration, Number.isFinite(time) ? time : 0));
const ease = (v) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, v)))) / 2;

export function motionAt(id, time) {
  const lesson = LESSONS.find((item) => item.id === id);
  if (!lesson) throw new Error(`Unknown movement: ${id}`);
  const t = clamp(time, lesson.duration);
  if (id === 'reach') return { armAngle: armAngleAt(t), lean: 0, depth: .06 };
  if (id === 'open') {
    const amount = t < 6 ? ease(t / 6) : t < 14 ? 1 : 1 - ease((t - 14) / 6);
    return { armAngle: .12 + (Math.PI / 2 - .12) * amount, lean: 0, depth: .06 - .3 * amount };
  }
  const raised = t < 4 ? ease(t / 4) : t < 28 ? 1 : 1 - ease((t - 28) / 4);
  let lean = 0;
  if (t >= 4 && t < 8) lean = .28 * ease((t - 4) / 4);
  else if (t < 12 && t >= 8) lean = .28;
  else if (t < 16 && t >= 12) lean = .28 * (1 - ease((t - 12) / 4));
  else if (t < 20 && t >= 16) lean = -.28 * ease((t - 16) / 4);
  else if (t < 24 && t >= 20) lean = -.28;
  else if (t < 28 && t >= 24) lean = -.28 * (1 - ease((t - 24) / 4));
  return { armAngle: .12 + (Math.PI - .36) * raised, lean: lean || 0, depth: .06 };
}

export function cueAt(id, time) {
  if (id === 'reach') return phaseAt(time);
  if (id === 'open') {
    if (time < 6) return { label: '緩緩展臂', cue: '觀察雙臂向兩側打開，維持自然呼吸。' };
    if (time < 14) return { label: '展胸停留', cue: '雙臂微微向後，保持身體直立。' };
    return { label: '慢慢收回', cue: '將雙臂放回身側，完成這段練習。' };
  }
  if (time < 4) return { label: '雙臂上舉', cue: '先回到直立，再將雙臂慢慢上舉。' };
  if (time < 12) return { label: '教練右側伸展', cue: '觀察教練向她的右側輕輕彎身，雙腳保持不動。' };
  if (time < 16) return { label: '回到中間', cue: '慢慢回正，準備換另一側。' };
  if (time < 24) return { label: '教練左側伸展', cue: '換到教練的左側，保持自然呼吸。' };
  if (time < 28) return { label: '回到中間', cue: '上半身回正，準備放下雙臂。' };
  return { label: '回到站姿', cue: '雙臂慢慢回到身側。' };
}

export function courseFrame(time) {
  const t = clamp(time, COURSE_DURATION);
  let start = 0;
  for (let index = 0; index < LESSONS.length; index++) {
    const lesson = LESSONS[index];
    if (t < start + lesson.duration || index === LESSONS.length - 1) {
      const localTime = t - start;
      return { index, lesson, localTime, remaining: Math.max(0, lesson.duration - localTime), complete: t === COURSE_DURATION, ...cueAt(lesson.id, localTime) };
    }
    start += lesson.duration;
  }
}

export const createPlayback = () => ({ time: 0, playing: false, speed: 1 });
export function reducePlayback(state, action) {
  switch (action.type) {
    case 'toggle': return { ...state, time: state.time >= COURSE_DURATION ? 0 : state.time, playing: !state.playing };
    case 'restart': return { ...state, time: 0, playing: true };
    case 'play': return { ...state, playing: state.time < COURSE_DURATION };
    case 'repeat': return { ...state, time: state.time >= COURSE_DURATION ? 0 : lessonStart(courseFrame(state.time).index), playing: true };
    case 'pause': return { ...state, playing: false };
    case 'seek': {
      const time = clamp(action.time, COURSE_DURATION);
      return { ...state, time, playing: action.pause || time === COURSE_DURATION ? false : state.playing };
    }
    case 'speed': return [0.5, 1, 1.5].includes(action.speed) ? { ...state, speed: action.speed } : state;
    case 'tick': {
      if (!state.playing || !Number.isFinite(action.delta) || action.delta <= 0) return state;
      const time = clamp(state.time + action.delta * state.speed, COURSE_DURATION);
      return { ...state, time, playing: time < COURSE_DURATION };
    }
    default: return state;
  }
}
export function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
