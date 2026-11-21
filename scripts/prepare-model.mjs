import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// The optimized CC0 model is bundled in Git; see its source manifest.
const bytes=await readFile('public/models/luna-v1.glb');
const expected='e3b864d0ec0391bfd180ebdad5309d81b9e0a96de4f7740f9217a53ffe1e3ed7';
if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Luna character checksum mismatch');
console.log('Bundled Luna character verified (SHA-256).');
