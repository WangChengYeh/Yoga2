// One deterministic 16-second preview. No dance animation is used as yoga.
export const DURATION = 16;
export function phaseAt(time) {
  const t = Math.max(0, Math.min(DURATION, time));
  if (t < 6) return { label: '緩緩上舉', cue: '觀察雙臂從身側慢慢向上。' };
  if (t < 10) return { label: '伸展停留', cue: '雙臂向上伸展，維持自然呼吸。' };
  if (t < 16) return { label: '慢慢放下', cue: '讓雙臂緩緩回到身體兩側。' };
  return { label: '示範完成', cue: '可以重播，或換個角度再看一次。' };
}
export function armAngleAt(time) {
  const t = Math.max(0, Math.min(DURATION, time));
  const ease = (v) => (1 - Math.cos(Math.PI * v)) / 2;
  const amount = t < 6 ? ease(t / 6) : t < 10 ? 1 : 1 - ease((t - 10) / 6);
  return 0.12 + amount * (Math.PI - 0.36);
}
export function advance(time, delta, speed) {
  return Math.min(DURATION, Math.max(0, time + Math.max(0, delta) * speed));
}
