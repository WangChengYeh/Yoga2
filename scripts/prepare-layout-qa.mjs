// Run npm run test:portrait first. Export production cutout/calibration/layout
// data plus actual web animation poses for a reproducible CPU render.
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {portraitMask} from '../src/portrait-mask.js';
import {composeCutout,calibrateFace,personPlacement} from '../src/cutout-core.js';
import {practiceLayout} from '../src/practice-layout.js';
const result=spawnSync(process.execPath,['scripts/export-pose-preview.mjs','test-results/layout-poses'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
const dir='test-results/portrait',m=JSON.parse(readFileSync(`${dir}/result.json`));
const channels=m.labels.map((_,c)=>{const b=readFileSync(`${dir}/class-${c}.f32`),a=new Float32Array(b.length/4);for(let i=0;i<a.length;i++)a[i]=b.readFloatLE(i*4);return a;});
const segmentation={...portraitMask({width:m.maskWidth,height:m.maskHeight,labels:m.labels,channels}),frame:{width:m.width,height:m.height,rgba:new Uint8ClampedArray(readFileSync(`${dir}/frame.rgba`))}};
const frame=composeCutout(segmentation),calibration=calibrateFace(segmentation.face),p=personPlacement(calibration,m.width/m.height),layout=practiceLayout({aspect:1536/710,paired:true,portrait:true});
writeFileSync('test-results/human.rgba',frame.rgba);
writeFileSync('test-results/layout.json',JSON.stringify({frame:[frame.width,frame.height],placement:{...p,x:layout.humanX+p.x-.72},cropMinY:p.y+(.5-frame.bounds.bottom)*p.height,layout}));
console.log('Exported production portrait calibration and fixed paired layout.');
