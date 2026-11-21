import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path = 'public/models/selfie_segmenter.tflite';
const url = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
const expected = '191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b';
const digest = (data) => createHash('sha256').update(data).digest('hex');
let data;
try { data = await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!data || digest(data) !== expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Portrait model download failed: HTTP ${response.status}`);
  data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== expected) throw new Error('Portrait model checksum mismatch');
  await mkdir('public/models', { recursive: true });
  await writeFile(path, data);
}
console.log('Selfie Segmenter model verified (SHA-256).');
