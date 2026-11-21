import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path = 'public/models/selfie_multiclass_256x256.tflite';
const url = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
const expected = 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0';
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
console.log('Semantic person segmenter model verified (SHA-256).');
