import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor/three', { recursive: true });
await cp('src', 'dist', { recursive: true });
await cp('node_modules/html2canvas/dist/html2canvas.esm.js', 'dist/vendor/html2canvas.esm.js');
await cp('node_modules/html2canvas/LICENSE', 'dist/vendor/HTML2CANVAS-LICENSE.txt');
await cp('public', 'dist', { recursive: true });
await cp('version.json', 'dist/version.json');
for (const name of ['three.module.js', 'three.core.js']) {
  await cp(`node_modules/three/build/${name}`, `dist/vendor/three/${name}`);
}
await mkdir('dist/vendor/addons/loaders', { recursive: true });
await mkdir('dist/vendor/addons/controls', { recursive: true });
await mkdir('dist/vendor/addons/exporters', { recursive: true });
await cp('node_modules/three/examples/jsm/exporters/GLTFExporter.js', 'dist/vendor/addons/exporters/GLTFExporter.js');
await mkdir('dist/vendor/addons/utils', { recursive: true });
await cp('node_modules/three/examples/jsm/loaders/GLTFLoader.js', 'dist/vendor/addons/loaders/GLTFLoader.js');
await cp('node_modules/three/examples/jsm/controls/OrbitControls.js', 'dist/vendor/addons/controls/OrbitControls.js');
await cp('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'dist/vendor/addons/utils/BufferGeometryUtils.js');
await cp('node_modules/three/LICENSE', 'dist/vendor/THREE-LICENSE.txt');
await mkdir('dist/vendor/mediapipe', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', 'dist/vendor/mediapipe/vision_bundle.mjs');
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'dist/vendor/mediapipe/wasm', { recursive: true });
await mkdir('dist/docs', { recursive: true });
await cp('docs/GLB_IMPORT.md', 'dist/docs/GLB_IMPORT.md');
await cp('THIRD_PARTY_ASSETS.md', 'dist/THIRD_PARTY_ASSETS.md');
await writeFile('dist/.nojekyll', '');
await writeFile('dist/build-info.json', JSON.stringify({ milestone: 8, version: JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8')).version, three: '0.180.0', mediapipe: '0.10.32' }));
console.log('Built self-contained static site in dist/');
