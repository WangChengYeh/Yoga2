export const TASKS={
 'monitor.cpu':{label:'效能面板更新',channel:'cpu-main'},
 'render.cpu':{label:'3D 更新／提交',channel:'cpu-main'},
 'pose.cpu':{label:'骨架辨識',channel:'cpu-worker'},
 'portrait.cpu':{label:'人像去背',channel:'cpu-worker'},
 'copy.cpu':{label:'影格複製',channel:'cpu-worker'},
 'mask.cpu':{label:'遮罩合成',channel:'cpu-worker'},
 'render.submit':{label:'3D 提交 API',channel:'gpu-submit'},
 'render.gpu':{label:'3D GPU 完成通知',channel:'gpu-task'},
 'ai.load':{label:'LLM 載入往返',channel:'gpu-wall'},
 'ai.wall':{label:'LLM 回覆往返',channel:'gpu-wall'},
 'ai.gpu':{label:'LLM GPU 完成通知',channel:'gpu-task'},
 'vision.wall':{label:'相機整體往返',channel:'wall'},
 'vision.wait':{label:'相機排隊',channel:'wait'},
 'ai.wait':{label:'LLM 排隊',channel:'wait'},
 'load.wall':{label:'模型／場景載入',channel:'wall'},
 'render.frame':{label:'3D 實際更新',channel:'counter'},
 'vision.frame':{label:'辨識完成',channel:'counter'},
 'camera.frame':{label:'相機影格回呼',channel:'counter'},
};
const WINDOW=1800000;
export class TaskPerformance {
 constructor({now=()=>performance.now(),active=true}={}){this.now=now;this.active=active;this.reset();}
 reset(){this.lastPruned=-Infinity;this.startedAt=this.now();this.segments=[];this.foregroundStart=this.active?this.startedAt:null;this.buckets=new Map();this.spans=new Map();this.baseline=null;}
 prune(){if(this.now()-this.lastPruned<1000)return;this.lastPruned=this.now();const cutoff=this.now()-WINDOW;for(const key of this.buckets.keys())if(key+1000<=cutoff)this.buckets.delete(key);this.segments=this.segments.filter(([,end])=>end>cutoff);for(const [kind,spans] of this.spans)this.spans.set(kind,spans.filter(s=>s.endMs>=cutoff));}
 setActive(active){if(this.active===Boolean(active))return;const t=this.now();if(this.active)this.segments.push([this.foregroundStart,t]);this.active=Boolean(active);this.foregroundStart=this.active?t:null;this.prune();}
 intervals(start,end){return [...this.segments,...(this.active?[[this.foregroundStart,this.now()]]:[])].map(([a,b])=>[Math.max(start,a),Math.min(end,b)]).filter(([a,b])=>b>a);}
 record(kind,start,end=start,{durationMs=end-start,count=1,submittedMs,source}={}){
  if(!TASKS[kind]||![start,end,durationMs,count].every(Number.isFinite)||end<start||durationMs<0||count<0)return;
  const t=this.now(),cutoff=Math.max(this.startedAt,t-WINDOW);if(end<cutoff||end>t+1000)return;this.prune();
  const group=TASKS[kind].channel==='gpu-task'?'gpu':null;
  if(end>=cutoff){const spans=this.spans.get(kind)||[];spans.push({kind,startMs:start,endMs:end,durationMs,...(Number.isFinite(submittedMs)&&submittedMs>=start&&submittedMs<=end?{submittedMs,completionLatencyMs:end-submittedMs}:{}),...(['webgl-fence','webgpu-queue'].includes(source)?{source}: {})});this.spans.set(kind,spans.slice(-24));}
  const bucket=at=>{const key=Math.floor(at/1000)*1000;if(!this.buckets.has(key))this.buckets.set(key,{});const row=this.buckets.get(key);const metric=row[kind]||=( {ms:0,count:0,maxMs:0,firstStartMs:start,lastEndMs:end} );metric.firstStartMs=Math.min(metric.firstStartMs,start);metric.lastEndMs=Math.max(metric.lastEndMs,end);return metric;};
  for(const [a,b] of this.intervals(Math.max(start,cutoff),end))for(let at=a;at<b;){const next=Math.min(b,(Math.floor(at/1000)+1)*1000);bucket(at).ms+=durationMs*(next-at)/Math.max(Number.EPSILON,end-start);
   if(group){const row=this.buckets.get(Math.floor(at/1000)*1000);const key='@'+group,ranges=[...(row[key]||[]),[at,next]].sort((a,b)=>a[0]-b[0]),merged=[];for(const interval of ranges){const prev=merged.at(-1);if(prev&&interval[0]<=prev[1])prev[1]=Math.max(prev[1],interval[1]);else merged.push([...interval]);}while(merged.length>64){let best=0,gap=Infinity;for(let i=0;i<merged.length-1;i++)if(merged[i+1][0]-merged[i][1]<gap){gap=merged[i+1][0]-merged[i][1];best=i;}merged.splice(best,2,[merged[best][0],merged[best+1][1]]);}row[key]=merged;}
   at=next;}
  if(this.intervals(Math.max(cutoff,end-.001),end+.001).length){const row=bucket(end-.001);if(end===start)row.ms+=durationMs;row.count+=count;row.maxMs=Math.max(row.maxMs,durationMs);}
 }
 point(kind){const t=this.now();this.record(kind,t,t,{durationMs:0});}
 summary(windowMs=300000,end=this.now()){
  this.prune();const start=Math.max(this.startedAt,end-Math.min(WINDOW,Math.max(1000,windowMs))),foregroundMs=this.intervals(start,end).reduce((sum,[a,b])=>sum+b-a,0),totals={},loading={cpuMs:0,gpuMs:0};
  for(const [at,values] of this.buckets){const overlap=Math.max(0,Math.min(end,at+1000)-Math.max(start,at))/Math.max(1,Math.min(this.now(),at+1000)-at);if(!overlap)continue;for(const [kind,row] of Object.entries(values)){if(kind.startsWith('@')){for(const [a,b] of row)loading[kind==='@cpu'?'cpuMs':'gpuMs']+=Math.max(0,Math.min(end,b)-Math.max(start,a));continue;}const sum=totals[kind]||={ms:0,count:0,maxMs:0};sum.ms+=row.ms*overlap;sum.count+=row.count*overlap;sum.maxMs=Math.max(sum.maxMs,row.maxMs);}}
  const tasks=Object.entries(TASKS).map(([kind,info])=>{const row=totals[kind]||{ms:0,count:0,maxMs:0};return {kind,...info,ms:row.ms,count:row.count,averageMs:row.count?row.ms/row.count:null,maxMs:row.count?row.maxMs:null,foregroundPercent:foregroundMs?row.ms/foregroundMs*100:null,rate:foregroundMs?row.count*1000/foregroundMs:null};});
  loading.cpuMs=tasks.filter(t=>t.channel.startsWith('cpu-')).reduce((sum,t)=>sum+t.ms,0);
  return {startMs:start,endMs:end,foregroundMs,tasks,loading:{...loading,cpuPercent:foregroundMs?loading.cpuMs/foregroundMs*100:null,gpuPercent:foregroundMs&&tasks.some(t=>t.channel==='gpu-task'&&(t.count>0||t.ms>0))?loading.gpuMs/foregroundMs*100:null}};
 }
 markBaseline(windowMs,settings){this.baseline={atMs:this.now(),settings:structuredClone(settings),summary:this.summary(windowMs)};}
 get recentSpans(){return [...this.spans.values()].flat().sort((a,b)=>b.endMs-a.endMs);}
 get diagnostics(){return {schema:2,retentionMs:WINDOW,bucketMs:1000,scope:'CPU/GPU task class elapsed intervals; GPU task intervals end only at completion notification: WebGL fence or WebGPU queue checkpoint. API/load/reply intervals remain separate and do not count as confirmed GPU time. Notification includes queue and host delay, not pure GPU execution. CPU parallel durations add (may exceed 100%); GPU task overlaps unioned; CPU/GPU can overlap. Not device/core hardware utilization. At most 64 GPU union intervals/second; dense interval gaps may be merged. Per-task window edges approximate to one second.',windows:[60000,300000,900000,1800000].map(w=>({windowMs:w,...this.summary(w)})),baseline:this.baseline,recentSpans:this.recentSpans};}
 get memoryStatus(){const {recentSpans,...compact}=this.diagnostics;return compact;}
 exportTimeline(){this.prune();return {...this.diagnostics,buckets:[...this.buckets].sort((a,b)=>a[0]-b[0]).map(([atMs,tasks])=>({atMs,tasks:structuredClone(tasks)}))};}
}
