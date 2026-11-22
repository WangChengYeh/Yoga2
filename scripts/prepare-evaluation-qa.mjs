// Browser smoke test for the shipped ESM engine. Synthetic data only.
import {readFile,writeFile} from 'node:fs/promises';
const samples=(await readFile('tests/helpers/pose-samples.js','utf8')).replace(/^import .*\n/,'').replace('export function','function');
await writeFile('dist/m2-evaluation-qa.html',`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2 姿勢評估驗證</title><style>body{font:16px/1.7 system-ui;background:#eef4ef;color:#183e35;margin:32px}main{max-width:1000px;margin:auto}h1{font-size:28px}table{width:100%;border-collapse:collapse;background:white}td,th{padding:12px;text-align:left;border-bottom:1px solid #d2dfd5}#result{font-weight:600}p{max-width:800px}</style><main><h1>M2 姿勢評估 · v0.9.27</h1><p>使用合成骨架驗證實際發布模組；不代表手機或真人動作驗收。</p><p id="result">執行中</p><table><thead><tr><th>案例</th><th>狀態</th><th>主要提示／觀察</th><th>結果</th></tr></thead><tbody id="rows"></tbody></table></main><script type="module">
import {courseFrame,motionAt} from './course.js';
import {evaluatePose,PoseEvaluationEngine} from './pose-evaluation.js';
${samples}
const cases=[['上舉目標',8,{},'matched'],['右側伸展目標',26,{},'matched'],['左側伸展目標',38,{},'matched'],['展臂目標',58,{},'matched'],['雙臂較低',8,{armOffset:-.7},'correction'],['手肘較彎',8,{elbowBend:1},'correction'],['側傾反向',26,{leanOffset:-.56},'correction'],['鏡像側伸',26,{mirror:true},'matched'],['關節遮擋',8,{occluded:true},'unknown']];let passed=0,total=0;
function row(name,r,expected){total++;const ok=r.status===expected;if(ok)passed++;const tr=document.createElement('tr');for(const value of [name,r.status,r.message,ok?'通過':'失敗']){const td=document.createElement('td');td.textContent=value;tr.appendChild(td)}document.getElementById('rows').appendChild(tr);}
for(const [name,time,settings,expected] of cases){const data=poseSample(time,settings);if(settings.occluded)data.landmarks[0][15].visibility=.1;row(name,evaluatePose(data,courseFrame(time),{now:0,playing:true,aspect:.75}),expected);}
const engine=new PoseEvaluationEngine();for(const t of [0,250,500])engine.update(poseSample(8,{capturedAt:t,armOffset:-.7}),courseFrame(8),{now:t,playing:true,aspect:.75});row('三筆觀察確認',engine.snapshot(500),'correction');
for(const t of [600,850,1100])engine.update(poseSample(8,{capturedAt:t}),courseFrame(8),{now:t,playing:true,aspect:.75});row('修正後提示清除',engine.snapshot(1100),'matched');row('過期觀察清除',engine.snapshot(2600),'unknown');
document.getElementById('result').textContent=passed+'/'+total+' 通過';document.body.dataset.passed=String(passed);document.body.dataset.total=String(total);
</script></html>`);
console.log('Prepared browser evaluation QA: dist/m2-evaluation-qa.html');
