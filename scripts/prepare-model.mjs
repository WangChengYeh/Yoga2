import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Download from a fixed upstream release rather than republishing the raw asset in Git.
const path = 'public/models/michelle.glb';
const url = 'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Michelle.glb';
const expected = '7a87e15a99ccbc5e5877be66e1e4ecae0a581adcafa0cce1a5569f49909e968e';
const digest = (data) => createHash('sha256').update(data).digest('hex');
let data;
try { data = await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!data || digest(data) !== expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Character download failed: HTTP ${response.status}`);
  data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== expected) throw new Error('Character checksum mismatch; refusing to use changed bytes');
  await mkdir('public/models', { recursive: true });
  await writeFile(path, data);
}
console.log('Character asset verified (SHA-256).');
