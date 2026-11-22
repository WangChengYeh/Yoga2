import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFullscreenTools} from '../src/fullscreen-tools.js';
function harness(){
 class Node{constructor(id){this.id=id;this.childNodes=[];this.listeners={};this.value=id;this.open=false;}get nextSibling(){const a=this.parentNode?.childNodes||[];return a[a.indexOf(this)+1]||null;}insertBefore(node,before){if(node.parentNode){const old=node.parentNode.childNodes;old.splice(old.indexOf(node),1);}let index=before?this.childNodes.indexOf(before):this.childNodes.length;if(index<0)throw Error('Invalid marker');this.childNodes.splice(index,0,node);node.parentNode=this;return node;}appendChild(node){return this.insertBefore(node,null);}addEventListener(type,fn){this.listeners[type]=fn;}hasAttribute(name){return name==='data-view'&&this.id==='front';}closest(){return this;}}
 const studio=new Node('studio'),actions=new Node('actions'),menu=new Node('practice-settings'),panel=new Node('practice-settings-content');
 const nodes=Object.fromEntries(['student-calibration-controls','task-performance','camera-options','performance-options','media-startup','local-ai-options','guidance-control','fullscreen-toggle','camera-toggle','quality','report-problem','report-local-controls','report-download','report-logs','bones','views','front'].map(id=>[id,new Node(id)]));nodes['practice-settings']=menu;nodes['practice-settings-content']=panel;
 const voiceOptions=new Node('voice-options');voiceOptions.appendChild(nodes['student-calibration-controls']);voiceOptions.appendChild(nodes['task-performance']);voiceOptions.appendChild(nodes['camera-options']);voiceOptions.appendChild(nodes['performance-options']);voiceOptions.appendChild(nodes['guidance-control']);voiceOptions.appendChild(nodes['local-ai-options']);voiceOptions.appendChild(nodes['media-startup']);
 nodes['report-local-controls'].appendChild(nodes['report-download']);nodes['report-local-controls'].appendChild(nodes['report-logs']);
 for(const id of ['fullscreen-toggle','camera-toggle','report-local-controls','report-problem','quality'])actions.appendChild(nodes[id]);studio.appendChild(actions);studio.appendChild(nodes.bones);studio.appendChild(nodes.views);actions.appendChild(menu);menu.appendChild(panel);
 const document={getElementById:id=>nodes[id],querySelector:s=>s==='.skeleton-controls'?nodes.bones:nodes.views,createComment:()=>new Node('marker')};
 const tools=setupFullscreenTools({document});return {tools,nodes,menu,panel,studio,actions,voiceOptions};
}
test('fullscreen folds original secondary controls and keeps camera and exit available',()=>{
 const h=harness();h.nodes.bones.value='user-settings';h.tools.setActive(true);
 for(const id of ['student-calibration-controls','task-performance','camera-options','performance-options','media-startup','local-ai-options','guidance-control','quality','report-problem','report-local-controls','bones','views'])assert.equal(h.nodes[id].parentNode,h.panel);
 for(const id of ['report-download','report-logs'])assert.equal(h.nodes[id].parentNode,h.nodes['report-local-controls']);
 assert.equal(h.nodes['camera-toggle'].parentNode,h.actions);assert.equal(h.nodes['fullscreen-toggle'].parentNode,h.actions);assert.equal(h.menu.open,false);assert.equal(h.nodes.bones.value,'user-settings');
 h.nodes.bones.value='changed-while-fullscreen';h.tools.setActive(false);assert.equal(h.nodes['guidance-control'].parentNode,h.voiceOptions);assert.equal(h.nodes['local-ai-options'].parentNode,h.voiceOptions);assert.equal(h.nodes.bones.parentNode,h.studio);assert.equal(h.nodes.bones.value,'changed-while-fullscreen');assert.deepEqual(h.actions.childNodes.filter(n=>n.id!=='marker').map(n=>n.id),['fullscreen-toggle','camera-toggle','report-local-controls','report-problem','quality','practice-settings']);
});
test('repeated fullscreen toggles preserve nodes, settings and original placement without duplicates',()=>{
 const h=harness(),original=h.nodes['quality'];for(let i=0;i<4;i++){h.menu.open=true;h.tools.setActive(true);h.tools.setActive(false);}assert.equal(h.nodes['quality'],original);assert.equal(h.actions.childNodes.filter(n=>n===original).length,1);assert.equal(h.panel.childNodes.length,0);assert.equal(h.menu.open,false);
});
test('report and view selection close settings before capture; adjusting quality keeps menu open',()=>{
 const h=harness();h.tools.setActive(true);for(const id of ['report-problem','report-download','report-logs','front']){h.menu.open=true;h.panel.listeners.click({target:h.nodes[id]});assert.equal(h.menu.open,false);}h.menu.open=true;h.panel.listeners.click({target:h.nodes.quality});assert.equal(h.menu.open,true);
});
test('older entry without a settings menu remains usable',()=>{assert.doesNotThrow(()=>setupFullscreenTools({document:{getElementById:()=>null}}).setActive(true));});
