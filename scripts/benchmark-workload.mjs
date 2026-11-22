// Deterministic controller replay, not a device speed/thermal measurement.
import {DualWorkload} from '../src/workload-budget.js';
import {createPlayback,reducePlayback,COURSE_DURATION} from '../src/course.js';
const replay=auto=>{
 let at=0,state=reducePlayback(createPlayback(),{type:'play'}),budget=new DualWorkload({now:()=>at}),requestedFrames=0,minimum=1;budget.configure({auto});
 for(let second=0;second<1800;second++){
  const busy=second<90||second>=600&&second<690||second>=1200&&second<1290;
  budget.recordCPU(busy?900:100);budget.recordGPU({submittedMs:at,completedMs:at+(busy?400:8)});at+=1000;
  budget.sample({completion:{supported:true,pending:0}});state=reducePlayback(state,{type:'tick',delta:1});
  requestedFrames+=Math.max(5,30*Math.min(budget.cpuFactor,budget.gpuFactor));minimum=Math.min(minimum,budget.cpuFactor,budget.gpuFactor);
 }
 if(state.time!==COURSE_DURATION)throw Error('Course clock changed under load');
 return {auto,simulatedSeconds:1800,syntheticRequestedFrames:requestedFrames,minimumFactor:minimum,finalFactors:{cpu:budget.cpuFactor,gpu:budget.gpuFactor},courseSeconds:state.time,retainedTransitions:budget.history.length,windows:budget.windows};
};
console.log(JSON.stringify({schema:1,scope:'Synthetic 30-minute controller replay. Input task/notification durations are fixed test data, not measured device results; requested frames are demand estimates, not achieved FPS.',overloadWindowsSeconds:[[0,90],[600,690],[1200,1290]],fixed:replay(false),adaptive:replay(true)},null,2));
