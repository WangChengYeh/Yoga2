// Static resource counts, not device FPS or physical/GPU memory measurements.
import * as THREE from 'three';
import {createStudentModel} from '../src/student-model.js';
import {disposeAvatar} from '../src/personal-avatar.js';
const measure=personal=>{const root=createStudentModel(personal?{faceTexture:new THREE.Texture()}:{});let meshes=0,vertices=0,triangles=0;root.traverse(m=>{if(m.isMesh){meshes++;vertices+=m.geometry.attributes.position.count;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});disposeAvatar(root);return {meshes,vertices,triangles,faceTextureRGBABytesEstimate:personal?512*512*4:0};};
console.log(JSON.stringify({schema:1,scope:'Static original/generated model geometry counts; texture estimate excludes mipmaps, driver allocation, canvas/source images and decoder buffers. Not measured FPS, device RAM or GPU memory.',default:measure(false),personal:measure(true)},null,2));
