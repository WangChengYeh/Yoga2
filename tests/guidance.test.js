import test from 'node:test';
import assert from 'node:assert/strict';
import {CourseNarrator,guidanceAt,GUIDANCE} from '../src/guidance.js';
import {respondToUtterance} from '../src/voice-intents.js';
function harness(){const said=[],cancelled=[];let allowed=true;const narrator=new CourseNarrator({speak:(text,options)=>said.push({text,options}),cancel:()=>cancelled.push(true),canSpeak:()=>allowed});const state={ready:true,time:0,playing:false,speed:1};return {narrator,state,said,cancelled,set allowed(v){allowed=v;},update(type='tick'){narrator.update(state,{type});}};}
test('cue times match the actual rise, hold, return, side change and course completion',()=>{
 for(const [time,key] of [[0,'reach:0'],[5.9,'reach:0'],[6,'reach:6'],[10,'reach:10'],[16,'side:0'],[20,'side:4'],[28,'side:12'],[32,'side:16'],[40,'side:24'],[44,'side:28'],[48,'open:0'],[54,'open:6'],[62,'open:14'],[68,'complete']])assert.equal(guidanceAt(time).key,key);
 assert.match(guidanceAt(0).text,/站姿上舉伸展/);assert.match(guidanceAt(16).text,/左右側伸展/);assert.match(guidanceAt(48).text,/展臂開胸/);assert.match(guidanceAt(32).text,/換邊/);
 for(const cues of Object.values(GUIDANCE)){assert.ok(cues.every(c=>c[1].length<=20));}
});
test('no speech on page load or before coach ready; user play speaks one current cue',()=>{
 const h=harness();h.update();assert.equal(h.said.length,0);h.state.playing=true;h.state.ready=false;h.update('toggle');assert.equal(h.said.length,0);h.state.ready=true;h.update('toggle');assert.equal(h.said.length,1);assert.equal(h.said[0].options.kind,'guidance');
 for(let i=0;i<30;i++){h.state.time=i/10;h.update();}assert.equal(h.said.length,1);
});
test('pause cancels guide; resume/repeat/restart announce current phase once without stale backlog',()=>{
 const h=harness();h.state.playing=true;h.update('toggle');h.state.time=7;h.update();assert.equal(h.said.length,2);h.state.playing=false;h.update('pause');assert.equal(h.cancelled.length,1);h.update('pause');assert.equal(h.cancelled.length,1);
 h.state.playing=true;h.update('play');assert.match(h.said.at(-1).text,/肩膀/);h.state.time=0;h.update('restart');assert.match(h.said.at(-1).text,/站姿上舉/);
 h.state.time=48;h.update('seek');assert.match(h.said.at(-1).text,/展臂開胸/);assert.equal(h.said.length,5);
});
test('large forward tick skips obsolete cues; backwards seek and repeated lesson reset correctly',()=>{
 const h=harness();h.state.playing=true;h.update();h.state.time=36;h.update();assert.equal(h.said.length,2);assert.match(h.said.at(-1).text,/胸口/);
 h.state.time=16;h.update('repeat');assert.match(h.said.at(-1).text,/左右側伸展/);h.state.playing=false;h.state.time=50;h.update('seek');const n=h.said.length;h.state.playing=true;h.update('play');assert.equal(h.said.length,n+1);assert.match(h.said.at(-1).text,/展臂開胸/);
});
test('completion is spoken once on actual finish, never by seeking to the end',()=>{
 const h=harness();h.state.playing=true;h.state.time=67;h.update();h.state.time=68;h.state.playing=false;h.update();assert.match(h.said.at(-1).text,/完成/);const n=h.said.length;h.update();assert.equal(h.said.length,n);
 const other=harness();other.state.time=68;other.update('seek');assert.equal(other.said.length,0);
});
test('muting/background cancels; re-enable/resume uses current cue and no microphone permission',()=>{
 const h=harness();h.state.playing=true;h.update();h.narrator.setEnabled(false,h.state);h.state.time=24;h.update();assert.equal(h.said.length,1);h.narrator.setEnabled(true,h.state);assert.match(h.said.at(-1).text,/腰側/);h.narrator.suspend();h.state.playing=false;h.update();assert.equal(h.narrator.running,false);
});
test('questions have priority and missed instructions are not replayed later',()=>{
 const h=harness();h.state.playing=true;h.update();h.allowed=false;h.state.time=6;h.update();h.allowed=true;h.state.time=7;h.update();assert.equal(h.said.length,1);h.state.time=10;h.update();assert.equal(h.said.length,2);assert.match(h.said.at(-1).text,/放下/);
});
test('playback speed changes speech rate only within understandable bounds and never repeats cue',()=>{
 const h=harness();h.state.playing=true;h.state.speed=1.5;h.update('play');assert.equal(h.said[0].options.rate,1.2);h.state.speed=.5;h.update('speed');assert.equal(h.said.length,1);h.state.time=6;h.update();assert.equal(h.said.at(-1).options.rate,.95);
});
test('Mandarin key-point questions return lesson-specific essentials, with no invented pose assessment',()=>{
 for(const phrase of ['關鍵要領','教練，請說重點','怎麼呼吸','關鍵詞']){const response=respondToUtterance(phrase,{state:{ready:true,time:20,playing:true,speed:1}});assert.equal(response.intent,'tips');assert.match(response.reply,/胸口朝前/);assert.equal(response.action,null);}
 assert.match(respondToUtterance('要領',{state:{time:68}}).reply,/課程已完成/);
});
