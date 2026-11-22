import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {createPracticeMat,enableAvatarShadows} from '../src/practice-stage.js';
test('both stages use matching rectangular shadow-receiving mats and all student meshes cast shadows',()=>{
 const a=createPracticeMat(),b=createPracticeMat();assert.equal(a.geometry.type,'BoxGeometry');assert.deepEqual(a.geometry.parameters,b.geometry.parameters);assert.equal(a.receiveShadow,true);const model=new THREE.Group(),skin=new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());model.add(skin);enableAvatarShadows(model);assert.equal(skin.castShadow,true);assert.equal(skin.receiveShadow,true);for(const m of [a,b,skin]){m.geometry.dispose();m.material.dispose();}
});
