"""Render baked web poses with Cycles CPU (no browser/GPU dependency)."""
import bpy,sys,os,math
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];source,out=args[:2]
os.makedirs(out,exist_ok=True)
for name in ['standing','reach','right','left','open']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=os.path.join(source,name+'.glb'))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=False
 scene.render.resolution_x=480;scene.render.resolution_y=640;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Studio World');scene.world.color=(.35,.4,.35)
 scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
 for o in scene.objects:
  if o.type=='ARMATURE' and o.animation_data:o.animation_data_clear()
  if o.type=='MESH' and len(o.data.vertices)<100:bpy.data.objects.remove(o,do_unlink=True)
 def area(n,loc,power,size,color):
  data=bpy.data.lights.new(n,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
  o=bpy.data.objects.new(n,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
 area('Softbox',(-3,-4,5),450,4,(1,.94,.91));area('Fill',(3,-1,3),250,3,(.88,.94,1));area('Rim',(1,3,4),300,3,(1,1,1))
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));floor=bpy.context.object
 m=bpy.data.materials.new('Studio green');m.diffuse_color=(.43,.56,.46,1);floor.data.materials.append(m)
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,.005));mat=bpy.context.object;mat.scale=(.72,1.65,.01)
 m=bpy.data.materials.new('Yoga mat');m.diffuse_color=(.12,.25,.19,1);mat.data.materials.append(m)
 data=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',data);scene.collection.objects.link(camera);scene.camera=camera
 camera.location=(.2,-4.2,1.3);target=Vector((0,0,1.12));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();data.lens=50
 scene.render.filepath=os.path.join(out,name+'.png');bpy.ops.render.render(write_still=True)
 if name=='standing':
  camera.location=(.1,-1.2,1.61);target=Vector((0,0,1.48));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();data.lens=65
  scene.render.filepath=os.path.join(out,'portrait.png');bpy.ops.render.render(write_still=True)
 print('RENDER_COMPLETE',name,flush=True)
