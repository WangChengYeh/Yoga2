import * as THREE from 'three';
import { personPlacement } from './cutout-core.js?v=0.9.20';

export function createHumanLayer({ scene, createCanvas=()=>document.createElement('canvas') }) {
  let mesh, texture, canvas, ctx, calibration, aspect, bounds, layout, referenceBottom;
  let placement={x:.72,scale:1}, disposed=false;
  function align() {
    if(!mesh||!calibration)return;
    const p=personPlacement(calibration,aspect,placement);
    if(layout){
      const offset=p.x-.72;
      mesh.position.set(layout.x+Math.cos(layout.yaw)*offset,p.y,layout.z-Math.sin(layout.yaw)*offset);
    }else mesh.position.set(p.x,p.y,p.z);
    mesh.scale.set(p.width,p.height,1);
  }
  function clear() {
    if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();texture.dispose();}
    if(canvas)canvas.width=canvas.height=1;
    mesh=texture=canvas=ctx=calibration=bounds=null;
  }
  return {
    get mesh(){return mesh;},
    get calibration(){return calibration;},
    get cropMinY(){if(!mesh||calibration?.mode!=='face')return 0;const p=personPlacement(calibration,aspect,placement);return p.y+(.5-(referenceBottom??1))*p.height;},
    get bounds(){
      if(!mesh||!bounds)return null;
      const p=personPlacement(calibration,aspect,placement);
      return {width:2*Math.max(Math.abs(bounds.left-(calibration.anchorX??calibration.hipX)),Math.abs(bounds.right-(calibration.anchorX??calibration.hipX)))*p.width,height:Math.max(1.72,p.y+(.5-bounds.top)*p.height)};
    },
    setLayout(value){layout=value;align();},
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
      texture.needsUpdate=true;bounds=frame.bounds;if(calibration!==alignment)referenceBottom=frame.bounds?.bottom??1;calibration=alignment;aspect=frame.width/frame.height;align();
    },
    setPlacement(value){placement={...placement,...value};align();},
    update(camera){if(mesh)mesh.rotation.y=Math.atan2(camera.position.x-mesh.position.x,camera.position.z-mesh.position.z);},
    clear,
    dispose(){clear();disposed=true;},
  };
}
