// Bake the application's actual joint transforms into glTF for offline visual QA.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadCharacter } from '../tests/helpers/character.js';
import { prepareStandingCoach } from '../src/rig.js';
const original=readFileSync('public/models/luna-v1.glb');
const jsonLength=original.readUInt32LE(12);
const originalJson=JSON.parse(original.subarray(20,20+jsonLength).toString());
const bin=original.subarray(20+jsonLength);
const directory=process.argv[2]||'/tmp/yoga2-pose-preview';mkdirSync(directory,{recursive:true});
for(const [name,time,movement] of [['standing',0,'reach'],['reach',8,'reach'],['right',10,'side'],['left',22,'side'],['open',10,'open']]){
 const model=await loadCharacter();const pose=prepareStandingCoach(model);pose(time,movement);
 const json=structuredClone(originalJson);
 for(const node of json.nodes){const object=model.getObjectByName(node.name);if(object?.isBone){delete node.matrix;node.rotation=object.quaternion.toArray();node.translation=object.position.toArray();node.scale=object.scale.toArray();}}
 const roots=json.scenes[json.scene||0].nodes;
 const root=json.nodes.length;json.nodes.push({name:'Yoga2Frame',children:roots,translation:model.position.toArray(),rotation:model.quaternion.toArray(),scale:model.scale.toArray()});json.scenes[json.scene||0].nodes=[root];delete json.animations;
 let bytes=Buffer.from(JSON.stringify(json));bytes=Buffer.concat([bytes,Buffer.alloc((4-bytes.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+bin.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
 writeFileSync(`${directory}/${name}.glb`,Buffer.concat([header,bytes,bin]));
}
console.log('Exported five poses using the actual web animation code.');
