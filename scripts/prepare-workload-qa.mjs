// Production controls/modules, synthetic input only. No camera/AI/WebGL startup.
import {readFile,writeFile} from 'node:fs/promises';
const html=(await readFile('dist/index.html','utf8')).replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(whole,attrs)=>attrs.includes('importmap')?whole:'');
const script=`import {DualWorkload} from './workload-budget.js';
import {setupFullscreenTools} from './fullscreen-tools.js';
const $=id=>document.getElementById(id);let time=0;const budget=new DualWorkload({now:()=>time,onChange:render});
function render(){if(!budget)return;$('workload-status').textContent='合成驗證 · CPU '+budget.cpuFactor.toFixed(2)+' · GPU '+budget.gpuFactor.toFixed(2);$('budget-results').textContent=JSON.stringify(budget.diagnostics,null,2);}
const result=document.createElement('pre');result.id='budget-results';$('performance-options').appendChild(result);
const run=document.createElement('button');run.id='budget-pressure';run.textContent='模擬 CPU 過載';$('performance-options').appendChild(run);
run.addEventListener('click',()=>{for(let i=0;i<3;i++){budget.recordCPU(900);time+=1000;budget.sample();}render();});
const gpu=document.createElement('button');gpu.id='budget-gpu';gpu.textContent='模擬 GPU 過載';$('performance-options').appendChild(gpu);gpu.addEventListener('click',()=>{for(let i=0;i<3;i++){time+=1000;budget.sample({completion:{supported:true,pending:4,oldestPendingMs:800}});}render();});
for(const [id,key] of [['cpu-factor','cpuFactor'],['gpu-factor','gpuFactor'],['auto-workload','auto']])$(id).addEventListener('change',()=>budget.configure({[key]:key==='auto'?$(id).checked:Number($(id).value)}));
$('loading').hidden=true;$('media-startup').hidden=true;$('update-status').textContent='合成負載驗證；不是實機效能測試';document.body.classList.add('practice-fullscreen');setupFullscreenTools({document}).setActive(true);$('practice-settings').open=true;render();`;
await writeFile('dist/workload-qa.html',html.replace('</body>',`<script type="module">${script}</script></body>`));
console.log('Prepared synthetic workload QA with production modules/controls.');
