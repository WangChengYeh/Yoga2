import { GUIDANCE_TIPS } from './guidance.js?v=0.9.26';
import { LESSONS, COURSE_DURATION, courseFrame } from './course.js?v=0.9.26';

const phrases = {
  slow: ['慢一點','慢一点','放慢','放慢一點','放慢一点','慢點','慢点','速度慢一點','速度慢一点'],
  repeat: ['再一次','再來一次','再来一次','重播','重做一次'],
  pause: ['暫停','暂停','先暫停','先暂停','停一下','等一下','先等等'],
  resume: ['繼續','继续','繼續播放','继续播放','開始','开始','開始帶練','开始带练','準備好了','准备好了','我準備好了','我准备好了'],
  hello: ['你好','嗨','哈囉','哈啰','hello','hi'],
  current: ['現在做什麼','现在做什么','現在是什麼動作','现在是什么动作','這個動作叫什麼','这个动作叫什么'],
  next: ['下一個動作','下一个动作','接下來做什麼','接下来做什么'],
  remaining: ['還有多久','还有多久','剩多久','剩多少時間','剩多少时间'],
  how: ['怎麼做','怎么做','這個怎麼做','这个怎么做'],
  tips: ['要領','重點','說重點','说重点','關鍵要領','关键要领','動作要領','动作要领','動作重點','动作重点','關鍵詞','关键词','怎麼呼吸','怎么呼吸'],
  pose: ['我的姿勢如何','我的姿势如何','我做得對嗎','我做得对吗','我的動作對嗎','我的动作对吗','你有看到我嗎','你有看到我吗'],
};
export function classifyUtterance(text) {
  let normalized = String(text || '').normalize('NFKC').toLowerCase().replace(/[\s，。！？、,.!?：:；;]/g, '');
  if (normalized.length > 80) return 'unknown';
  normalized = normalized.replace(/^(?:教練|教练|老師|老师)/, '').replace(/^(?:請你|请你|麻煩你|麻烦你|請|请|幫我|帮我|可以)/, '');
  for (const [intent, values] of Object.entries(phrases)) if (values.includes(normalized)) return intent;
  normalized = normalized.replace(/(?:一下|好嗎|好吗|可以嗎|可以吗|嗎|吗)$/, '');
  for (const [intent, values] of Object.entries(phrases)) if (values.includes(normalized)) return intent;
  return 'unknown';
}

export function respondToUtterance(text, { state, pose = null, now = 0 }) {
  const intent = classifyUtterance(text), frame = courseFrame(state.time);
  const reply = (message, action = null) => ({ intent, reply: message, action });
  if (['slow','repeat','pause','resume'].includes(intent) && !state.ready) return reply('教練還沒載入完成，請稍候；也可以重新整理頁面。');
  if (intent === 'hello') return reply('嗨，我在這裡。今天想輕鬆伸展，還是先聊聊怎麼練？準備好可以說開始。');
  if (intent === 'slow') {
    const speed = state.speed > 1 ? 1 : .5;
    return state.speed <= .5 ? reply('目前已是最慢的零點五倍速。') : reply(`好，已調整為${speed === 1 ? '一' : '零點五'}倍速。`, { type:'speed', speed });
  }
  if (intent === 'pause') return state.playing ? reply('好，我等你。準備好再叫我繼續。', { type:'pause' }) : reply('好，不急，我等你。準備好再叫我繼續。');
  if (intent === 'resume') {
    if (frame.complete) return reply('這段課程已完成。想重新練習，可以說再一次。');
    return state.playing ? reply('已經在帶練中，跟著教練慢慢來。') : reply('好，繼續帶練。', { type:'play' });
  }
  if (intent === 'repeat') return reply(frame.complete ? '好，從第一個動作重新帶練。' : `好，再做一次${frame.lesson.name}。`, { type:'repeat' });
  if (intent === 'current') return reply(frame.complete ? '三個動作都完成了，教練已回到站姿。' : `現在是${frame.lesson.name}。${frame.label}。`);
  if (intent === 'next') return reply(frame.index < LESSONS.length - 1 ? `下一個動作是${LESSONS[frame.index + 1].name}。` : '這是最後一個動作，結束後就完成課程。');
  if (intent === 'remaining') {
    const seconds = Math.max(0, Math.ceil(COURSE_DURATION - state.time));
    return reply(`課程內容還剩${Math.floor(seconds / 60) ? `${Math.floor(seconds / 60)}分` : ''}${seconds % 60}秒，目前是${state.speed}倍速。`);
  }
  if (intent === 'how'||intent === 'tips') return reply(frame.complete?'課程已完成，先放鬆休息；想再練習可以按重播。':`${frame.lesson.name}。${GUIDANCE_TIPS[frame.lesson.id]}`);
  if (intent === 'pose') {
    if (!pose?.active) return reply('相機還沒開啟，暫時看不到你的動作。可以按開啟相機，或直接跟著示範。');
    if (!pose.valid || !Number.isFinite(pose.updatedAt) || now - pose.updatedAt > 2500 || now < pose.updatedAt) return reply('目前還沒有穩定的姿勢觀察，請讓全身完整入鏡。我無法保證姿勢正確。');
    return reply(`${pose.message}這只是鏡頭中的有限觀察，不代表整個動作正確。`);
  }
  return reply('我沒聽懂這句。可以說慢一點、再一次、暫停、繼續，或問現在做什麼、還有多久。');
}
