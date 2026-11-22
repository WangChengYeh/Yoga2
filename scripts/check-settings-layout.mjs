// Browser layout regression using production markup, CSS and control relocation.
// No model download, camera, microphone or AI initialization.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
let chrome=process.env.CHROMIUM_BIN;
if(!chrome)for(const candidate of ['google-chrome','google-chrome-stable','chromium','chromium-browser'])try{chrome=execFileSync('which',[candidate],{encoding:'utf8'}).trim();break;}catch{/* Next executable. */}
if(!chrome)throw Error('Set CHROMIUM_BIN to an installed Chromium/Chrome executable.');
const out=resolve('test-results/settings-layout');mkdirSync(out,{recursive:true});
const production=readFileSync('src/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/href="\.\/style\.css[^\"]*"/,`href="${pathToFileURL(resolve('src/style.css'))}"`);
const relocation=readFileSync('src/fullscreen-tools.js','utf8').replace('export function','function');
const recordOnly=process.argv.includes('--record-only');
for(const [name,width,height] of [['wide',1536,710],['landscape',844,390],['portrait',428,879]])for(const opened of [false,true]){
 const label=`${name}-${opened?'expanded':'collapsed'}`,fixture=join(out,`${label}.html`);
 const script=`${relocation}\ndocument.body.classList.add('practice-fullscreen');document.getElementById('loading').hidden=true;setupFullscreenTools({document}).setActive(true);document.getElementById('practice-settings').open=true;document.getElementById('task-performance').open=${opened};
 const menu=document.getElementById('practice-settings-content'),card=document.getElementById('task-performance');card.scrollIntoView({block:'start'});
 const rect=element=>{const r=element.getBoundingClientRect(),style=getComputedStyle(element);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,fontSize:parseFloat(style.fontSize)};};
 const heading=card.querySelector(':scope > summary'),other=[...menu.children].filter(e=>e!==card&&e.getClientRects().length),metrics={viewport:{width:innerWidth,height:innerHeight},heading:rect(heading),card:rect(card),menu:rect(menu),others:other.map(rect),text:heading.textContent.trim()};
 const result=document.createElement('script');result.id='layout-result';result.type='application/json';result.textContent=JSON.stringify(metrics);document.body.appendChild(result);`;
 writeFileSync(fixture,production.replace('</body>',`<script>${script}</script></body>`));const profile=mkdtempSync(join(tmpdir(),'yoga-layout-'));
 try{
 const dom=execFileSync(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-dev-shm-usage','--no-proxy-server','--no-first-run','--hide-scrollbars','--force-device-scale-factor=1',`--user-data-dir=${profile}`,`--window-size=${width},${height}`,'--virtual-time-budget=1000',`--screenshot=${join(out,`${label}.png`)}`,'--dump-dom',pathToFileURL(fixture).href],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:2e6});
 const raw=dom.match(/<script id="layout-result" type="application\/json">(.*?)<\/script>/s);assert.ok(raw,`${label}: missing browser metrics`);const m=JSON.parse(raw[1]);writeFileSync(join(out,`${label}.json`),JSON.stringify(m,null,2));
 if(!recordOnly){assert.ok(m.heading.width>180,`${label}: title squeezed to ${m.heading.width}px`);assert.ok(m.heading.height<=40,`${label}: title wrapped to ${m.heading.height}px`);assert.ok(m.heading.fontSize<=16,`${label}: oversized title ${m.heading.fontSize}px`);assert.ok(m.heading.x>=m.menu.x&&m.heading.right<=m.menu.right,`${label}: title escaped menu`);assert.ok(m.menu.right<=m.viewport.width&&m.menu.x>=0,`${label}: menu outside viewport`);for(const r of m.others){const overlaps=Math.min(r.right,m.card.right)-Math.max(r.x,m.card.x)>1&&Math.min(r.bottom,m.card.bottom)-Math.max(r.y,m.card.y)>1;assert.equal(overlaps,false,`${label}: card overlaps another control`);}}
 console.log(`${label}: heading ${Math.round(m.heading.width)}×${Math.round(m.heading.height)}, ${m.heading.fontSize}px${recordOnly?' (record only)':' — passed'}`);
 }finally{rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
