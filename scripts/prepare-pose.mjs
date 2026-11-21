import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path = 'public/models/pose_landmarker_lite.task';
const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const expected = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
const digest = (data) => createHash('sha256').update(data).digest('hex');
let data;
try { data = await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!data || digest(data) !== expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Pose model download failed: HTTP ${response.status}`);
  data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== expected) throw new Error('Pose model checksum mismatch');
  await mkdir('public/models', { recursive: true });
  await writeFile(path, data);
}
console.log('Pose Landmarker Lite model verified (SHA-256).');
