import { readFile, writeFile, readdir } from 'node:fs/promises';
const {version}=JSON.parse(await readFile('package.json','utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Release must use a three-part version');
// Stamp all relative module, worker, stylesheet and entry URLs together. A
// release must never combine new entry code with an older cached dependency.
for(const name of await readdir('src')) {
  if(!/\.(js|html)$/.test(name))continue;
  const path=`src/${name}`,text=await readFile(path,'utf8');
  await writeFile(path,text.replace(/\?v=[a-zA-Z0-9.-]+/g,`?v=${version}`).replace(/(id="app-version"[^>]*>)v[0-9.]+/,`$1v${version}`));
}
await writeFile('src/release.js',`// Generated from package.json by prepare-release.mjs.\nexport const APP_VERSION = '${version}';\n`);
await writeFile('version.json',JSON.stringify({version},null,2)+'\n');
console.log(`Prepared release v${version}.`);
