import { TASKS } from './task-performance.js?v=0.9.28';
const number=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'未知';
const groups={'cpu-main':'CPU 主緒','cpu-worker':'CPU 辨識','gpu':'GPU 計時','gpu-task':'GPU 完成通知','gpu-submit':'GPU 提交（另列）','gpu-wall':'GPU 往返（另列）','wall':'任務往返','wait':'排隊','counter':'更新率'};
export function setupTaskPerformancePanel({log,getSettings=()=>({}),doc=document,setIntervalFn=(fn,ms)=>setInterval(fn,ms),clearIntervalFn=clearInterval,now=()=>performance.now()}={}){
 const $=id=>doc.getElementById(id),panel=$('task-performance');let timer=null,lastChart=-Infinity,windowMs=300000;
 const stats=summary=>{const task=kind=>summary.tasks.find(t=>t.kind===kind);return `3D ${number(task('render.frame')?.count?task('render.frame').rate:null)} FPS · 相機回呼 ${number(task('camera.frame')?.count?task('camera.frame').rate:null)} FPS · 辨識 ${number(task('vision.frame')?.count?task('vision.frame').rate:null)} FPS`;};
 function chart(summary){
  const end=summary.endMs,start=summary.startMs,span=end-start;
  const curves=[['cpu','#b2681d','CPU task'],['gpu','#536eb4','GPU task']].map(([kind,color])=>({color,values:Array.from({length:30},(_,i)=>{const slice=span/30,s=log.summary(Math.max(1000,slice),start+(i+1)*slice);return s.loading[kind+'Percent'];})}));
  const maximum=Math.max(100,Math.ceil((Math.max(0,...curves.flatMap(c=>c.values).filter(Number.isFinite))-1e-7)/50)*50),series=curves.map(({color,values})=>{const paths=[];let points=[];const flush=()=>{if(points.length)paths.push(`<polyline fill="none" stroke="${color}" stroke-width="2" points="${points.join(' ')}"/>`);points=[];};values.forEach((v,i)=>{if(!Number.isFinite(v)){flush();return;}points.push(`${Math.round(i*600/29)},${Math.round(140-v/maximum*130)}`);});flush();return paths.join('');}).join('');
  $('task-trend').innerHTML=`<svg viewBox="0 0 600 150" role="img" aria-label="CPU 與 GPU task loading 估算，縱軸零至百分之${maximum}，橫軸由舊到新"><path d="M0 10H600 M0 140H600" stroke="#b7c9bd"/>${series}</svg><small><span style="color:#b2681d">CPU task（平行累加）</span> · <span style="color:#536eb4">GPU 完成通知（含 LLM）</span><br>縱軸 0–${maximum}%，由舊到新。CPU 可超過 100%；GPU 重疊只計一次。</small>`;
 }
 function refresh(force=false){if(doc.hidden||!panel.open&&!force)return;const started=now(),summary=log.summary(windowMs),settings=getSettings(),baseline=log.baseline;
  $('task-fps').textContent=`近 5 秒：${stats(log.summary(5000))}；區間平均：${stats(summary)}`;
  $('task-loading').textContent=`前景觀測 ${(summary.foregroundMs/1000).toFixed(0)} 秒 · CPU task ${number(summary.loading.cpuPercent)}% · GPU 已確認 task ${number(summary.loading.gpuPercent)}%（loading 估算）`;
  $('task-current').textContent=`設定 3D ${settings.preferences?.renderFPS??'未知'}／相機 ${settings.camera?.cameraFPS??'未知'} FPS；生效 3D ${settings.scheduler?.renderFPS??'未知'}／相機協商 ${settings.effectiveCamera?.negotiated??'未知'} FPS；降規 ${settings.level??0}/2。${settings.currentTask?`目前 ${settings.currentTask.kind} 已占用 ${number(settings.currentTask.runningMs/1000)} 秒。`:'目前沒有重任務占用通道。'}`;
  const completion=settings.gpuCompletion||{},status=s=>!s||s.status==='initializing'?'準備中':s.supported===false?'不支援，未知':`${s.status} · 待完成 ${s.pending||0} · 失敗 ${s.failed||0} · 略過 ${s.skipped||0}`;
  $('task-gpu-state').textContent=`3D fence：${status(completion.render)}；LLM queue：${status(completion.llm)}。GPU loading 只計收到完成通知的區間；提交 API／模型載入／回覆往返另外列出，不當作 GPU 完成。通知時間含排隊與回呼延遲，非純 GPU 運算時間。`;
  const rows=summary.tasks.filter(t=>t.channel!=='counter').map(t=>{const known=t.count>0||t.ms>0,base=baseline?.summary.tasks.find(b=>b.kind===t.kind),delta=known&&base?.averageMs!=null?t.averageMs-base.averageMs:null;return `<tr><td>${groups[t.channel]}<br>${t.label}</td><td>${known?number(t.foregroundPercent)+'%':'—'}</td><td>${known?number(t.ms/1000,2):'—'}</td><td>${known?number(t.averageMs):'—'}</td><td>${delta==null?'—':(delta>0?'+':'')+number(delta)}</td></tr>`;}).join('');
  $('task-rows').innerHTML=rows;
  const recent=log.recentSpans,seen=new Set(),latest=recent.filter(s=>{if(seen.has(s.kind))return false;seen.add(s.kind);return TASKS[s.kind].channel!=='counter';});
  $('task-spans').innerHTML=latest.map(s=>`<tr><td>${TASKS[s.kind].label}</td><td>${groups[TASKS[s.kind].channel]}</td><td>${number(s.startMs/1000,3)}</td><td>${number(s.submittedMs==null?null:s.submittedMs/1000,3)}</td><td>${number(s.endMs/1000,3)}</td><td>${number(s.durationMs)}</td><td>${number(s.completionLatencyMs)}</td></tr>`).join('');
  $('task-baseline-status').textContent=baseline?`基準：CPU ${number(baseline.summary.loading.cpuPercent)}%／GPU ${number(baseline.summary.loading.gpuPercent)}%；${stats(baseline.summary)}；3D 設定 ${baseline.settings.preferences?.renderFPS??'未知'}／相機 ${baseline.settings.camera?.cameraFPS??'未知'} FPS。平均耗時差為本期減基準，負值代表每次較快。`:'先觀察一段時間，記錄基準，再調整上方 FPS；基準不會因調整而消失。';
  if(now()-lastChart>=5000||force){chart(summary);lastChart=now();}log.record('monitor.cpu',started,now());
 }
 const start=()=>{if(timer==null)timer=setIntervalFn(()=>refresh(),1000);},stop=()=>{if(timer!=null)clearIntervalFn(timer);timer=null;};
 $('task-window').addEventListener('change',()=>{const v=Number($('task-window').value);windowMs=[60000,300000,900000,1800000].includes(v)?v:300000;refresh(true);});
 $('task-baseline').addEventListener('click',()=>{log.markBaseline(windowMs,getSettings());refresh(true);});
 $('task-reset').addEventListener('click',()=>{log.reset();refresh(true);});panel.addEventListener('toggle',()=>{if(panel.open)refresh(true);});start();
 return {refresh,start,stop};
}
