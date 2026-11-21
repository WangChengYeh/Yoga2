import bpy,sys,math,json,os
from mathutils import Vector
import numpy as np
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m=json.load(open(root+'/test-results/layout.json'));p=m['placement'];layout=m['layout'];w,h=m['frame']
for pose in ['standing','open']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=root+'/test-results/layout-poses/'+pose+'.glb')
 for o in list(bpy.context.scene.objects):
  if not o.parent:o.location.x+=layout['coachX']
  if o.type=='MESH':
   for mat in o.data.materials:
    if not mat or not mat.use_nodes:continue
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;out=nodes.get('Material Output')
    if not out or not out.inputs['Surface'].links:continue
    old=out.inputs['Surface'].links[0].from_socket
    geo=nodes.new('ShaderNodeNewGeometry');sep=nodes.new('ShaderNodeSeparateXYZ');compare=nodes.new('ShaderNodeMath');compare.operation='GREATER_THAN';compare.inputs[1].default_value=m['cropMinY']
    transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader')
    links.new(geo.outputs['Position'],sep.inputs[0]);links.new(sep.outputs['Z'],compare.inputs[0]);links.new(compare.outputs[0],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(old,mix.inputs[2]);links.new(mix.outputs[0],out.inputs['Surface'])
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False
 scene.render.resolution_x=960;scene.render.resolution_y=444;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
 scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.88,.81,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
 for name,loc,energy in [('Key',(-3,-4,5),450),('Fill',(3,-1,3),200)]:
  light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.size=4;obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1.5))-obj.location).to_track_quat('-Z','Y').to_euler()
 mesh=bpy.data.meshes.new('HumanPlane');mesh.from_pydata([(-p['width']/2,0,-p['height']/2),(p['width']/2,0,-p['height']/2),(p['width']/2,0,p['height']/2),(-p['width']/2,0,p['height']/2)],[],[(0,1,2,3)]);mesh.update()
 obj=bpy.data.objects.new('Human',mesh);scene.collection.objects.link(obj);obj.location=(p['x'],-p['z'],p['y']);obj.rotation_euler.z=math.atan2(-p['x'],layout['distance']-p['z'])
 uv=mesh.uv_layers.new();coords=[(1,0),(0,0),(0,1),(1,1)]
 for poly in mesh.polygons:
  for li in poly.loop_indices:uv.data[li].uv=coords[mesh.loops[li].vertex_index]
 data=np.fromfile(root+'/test-results/human.rgba',dtype=np.uint8).reshape(h,w,4)[::-1].astype(np.float32)/255
 image=bpy.data.images.new('ActualModelCutout',w,h,alpha=True);image.pixels.foreach_set(data.ravel());image.update()
 mat=bpy.data.materials.new('Human');mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
 tex=nodes.new('ShaderNodeTexImage');tex.image=image;em=nodes.new('ShaderNodeEmission');tr=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');out=nodes.new('ShaderNodeOutputMaterial')
 links.new(tex.outputs['Color'],em.inputs[0]);links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(tr.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],out.inputs[0]);obj.data.materials.append(mat)
 camera_data=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera;camera_data.sensor_fit='VERTICAL';camera_data.sensor_height=32;camera_data.lens=32/(2*math.tan(math.radians(35)/2));camera.location=(0,-layout['distance'],1.25);camera.rotation_euler=(Vector((0,0,layout['targetY']))-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.view_settings.view_transform='Standard';scene.render.filepath=root+'/test-results/layout-'+pose+'.png';bpy.ops.render.render(write_still=True);print('QA_RENDER',pose,flush=True)
