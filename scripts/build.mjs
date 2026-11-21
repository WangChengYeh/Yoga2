import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor/three', { recursive: true });
await cp('src', 'dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
for (const name of ['three.module.js', 'three.core.js']) {
  await cp(`node_modules/three/build/${name}`, `dist/vendor/three/${name}`);
}
await mkdir('dist/vendor/addons/loaders', { recursive: true });
await mkdir('dist/vendor/addons/controls', { recursive: true });
await mkdir('dist/vendor/addons/utils', { recursive: true });
await cp('node_modules/three/examples/jsm/loaders/GLTFLoader.js', 'dist/vendor/addons/loaders/GLTFLoader.js');
await cp('node_modules/three/examples/jsm/controls/OrbitControls.js', 'dist/vendor/addons/controls/OrbitControls.js');
await cp('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'dist/vendor/addons/utils/BufferGeometryUtils.js');
await cp('node_modules/three/LICENSE', 'dist/vendor/THREE-LICENSE.txt');
await cp('THIRD_PARTY_ASSETS.md', 'dist/THIRD_PARTY_ASSETS.md');
await writeFile('dist/.nojekyll', '');
await writeFile('dist/build-info.json', JSON.stringify({ milestone: 2, three: '0.180.0' }));
console.log('Built self-contained static site in dist/');
