import { writeFileSync } from 'node:fs';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createStudentModel } from '../src/student-model.js';
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
const data=await new GLTFExporter().parseAsync(createStudentModel(),{binary:true});
writeFileSync('public/models/student-v1.glb',Buffer.from(data));
console.log(`Original skinned student: ${data.byteLength} bytes`);
