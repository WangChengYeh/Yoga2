import * as THREE from 'three';
import { personPlacement } from './cutout-core.js?v=0.6.0';

export function createHumanLayer({ scene, createCanvas=()=>document.createElement('canvas') }) {
  let mesh, texture, canvas, ctx, calibration, aspect;
  let placement={x:.72,scale:1}, disposed=false;
  function align() {
    if(!mesh||!calibration)return;
    const p=personPlacement(calibration,aspect,placement);
    mesh.position.set(p.x,p.y,p.z);mesh.scale.set(p.width,p.height,1);
  }
  function clear() {
    if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();texture.dispose();}
    if(canvas)canvas.width=canvas.height=1;
    mesh=texture=canvas=ctx=calibration=null;
  }
  return {
    get mesh(){return mesh;},
    apply(frame,alignment) {
      if(disposed)return;
      if(!mesh) {
        canvas=createCanvas();ctx=canvas.getContext('2d');
        if(!ctx)throw new Error('Canvas unavailable');
        texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        texture.repeat.x=-1;texture.offset.x=1;texture.generateMipmaps=false;
        texture.minFilter=texture.magFilter=THREE.LinearFilter;
        mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,alphaTest:.02,side:THREE.DoubleSide,toneMapped:false}));
        mesh.name='Yoga2HumanCutout';mesh.frustumCulled=false;scene.add(mesh);
      }
      if(canvas.width!==frame.width)canvas.width=frame.width;if(canvas.height!==frame.height)canvas.height=frame.height;
      const pixels=ctx.createImageData(frame.width,frame.height);pixels.data.set(frame.rgba);ctx.putImageData(pixels,0,0);
      texture.needsUpdate=true;calibration=alignment;aspect=frame.width/frame.height;align();
    },
    setPlacement(value){placement={...placement,...value};align();},
    update(camera){if(mesh)mesh.rotation.y=Math.atan2(camera.position.x-mesh.position.x,camera.position.z-mesh.position.z);},
    clear,
    dispose(){clear();disposed=true;},
  };
}
