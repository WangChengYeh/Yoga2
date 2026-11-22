# Offline CPU visual check of actual Three.js-exported skin transforms.
# This is not a browser or mobile acceptance screenshot.
import bpy,math,os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for pose in ['standing','reach','side','open']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=root+'/test-results/dual-avatar/'+pose+'.glb')
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=False
 scene.render.resolution_x=1000;scene.render.resolution_y=650;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.86,.8,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
 bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.location.z=-.02
 mat=bpy.data.materials.new('Floor');mat.diffuse_color=(.74,.82,.75,1);floor.data.materials.append(mat)
 for loc in [(-3,-4,5),(3,-2,4)]:
  light=bpy.data.lights.new('Softbox','AREA');light.energy=250;light.size=4;obj=bpy.data.objects.new('Softbox',light);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=3.7;camera.location=(0,-6,1.2);camera.rotation_euler=(Vector((0,0,1.2))-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.view_settings.view_transform='Standard';scene.render.filepath=root+'/test-results/dual-avatar/'+pose+'.png';bpy.ops.render.render(write_still=True)
