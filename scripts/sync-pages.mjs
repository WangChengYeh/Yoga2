import { readFile, writeFile } from 'node:fs/promises';

// GitHub Pages is configured to publish main/root. Keep its entry identical to
// the built version, with pinned external assets so no raw character is in Git.
let html = await readFile('src/index.html', 'utf8');
html = html.replace('<html lang="zh-Hant">', '<html lang="zh-Hant" data-model-url="https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Michelle.glb">');
html = html.replace('href="./favicon.svg"', 'href="./public/favicon.svg"');
html = html.replace('href="./style.css?', 'href="./src/style.css?');
html = html.replace('"./vendor/three/three.module.js"', '"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"');
html = html.replace('"./vendor/addons/"', '"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"');
html = html.replace('src="./app.js?', 'src="./src/app.js?');
await writeFile('index.html', html);
console.log('GitHub Pages root entry synchronized.');
