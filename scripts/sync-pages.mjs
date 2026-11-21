import { readFile, writeFile } from 'node:fs/promises';

// GitHub Pages is configured to publish main/root. Keep its entry identical to
// the built version, with pinned vendor modules and the bundled mobile character.
let html = await readFile('src/index.html', 'utf8');
html = html.replace('<html lang="zh-Hant">', '<html lang="zh-Hant" data-model-url="./public/models/luna-v1.glb" data-vision-root="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/" data-pose-model-url="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task">');
html = html.replace('href="./favicon.svg"', 'href="./public/favicon.svg"');
html = html.replace('href="./style.css?', 'href="./src/style.css?');
html = html.replace('"./vendor/three/three.module.js"', '"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"');
html = html.replace('"./vendor/addons/"', '"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"');
html = html.replace('src="./app.js?', 'src="./src/app.js?').replace('src="./update-entry.js?', 'src="./src/update-entry.js?');
await writeFile('index.html', html);
console.log('GitHub Pages root entry synchronized.');
