"""Blender 4.3+: build the CC0 Luna mobile character from the pinned source.
Run: blender -b -t 2 --python scripts/build-coach.py -- SOURCE.glb OUTPUT.glb
"""
import bpy, sys, os, json
from mathutils import Vector, Matrix
args=sys.argv[sys.argv.index('--')+1:]
source,output=args[:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(source))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.vertices)>1000)
for o in [arm,mesh]:
 if o.animation_data:o.animation_data_clear()
for p in arm.pose.bones:p.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
# Match the existing application's stable humanoid names, from hips upward.
rename={'Spine':'LunaTempUpper','Spine02':'Spine','Spine01':'Spine1','LunaTempUpper':'Spine2','neck':'Neck'}
for old,new in rename.items():
 if arm.data.bones.get(old):arm.data.bones[old].name=new
 if mesh.vertex_groups.get(old):mesh.vertex_groups[old].name=new
# Auxiliary head influences follow Head in this application; consolidate the
# weights before simplification so the face and mouth have a stable joint.
head=mesh.vertex_groups.get('Head')
aux=[g.index for g in mesh.vertex_groups if g.name in ['headfront','head_end']]
for v in mesh.data.vertices:
 amount=sum(g.weight for g in v.groups if g.group in aux)
 if amount:head.add([v.index],amount,'ADD')
for name in ['headfront','head_end']:
 if mesh.vertex_groups.get(name):mesh.vertex_groups.remove(mesh.vertex_groups[name])
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
modifier=mesh.modifiers.new('Mobile topology','DECIMATE');modifier.ratio=.12;modifier.use_collapse_triangulate=True
bpy.ops.object.modifier_move_up(modifier=modifier.name)
bpy.ops.object.modifier_apply(modifier=modifier.name)
# Export a real facial target. Coordinates are Blender Z-up, facing -Y.
mesh.shape_key_add(name='Basis')
jaw=mesh.shape_key_add(name='jawOpen')
head_index=mesh.vertex_groups['Head'].index
front=Vector((0,-1,0))
# The source's mouth is on the lower front face, close to Head origin +4 cm.
head_origin=arm.matrix_world@arm.data.bones['Head'].head_local
lip_z=head_origin.z+.055
changed=0
for v in mesh.data.vertices:
 head_weight=sum(g.weight for g in v.groups if g.group==head_index)
 world=mesh.matrix_world@v.co
 dx=(world.x-head_origin.x)/.045;dz=(world.z-lip_z)/.045
 face_depth=(world-head_origin).dot(front)
 influence=max(0,1-dx*dx-dz*dz)
 if head_weight>.8 and face_depth>.025 and influence>0:
  lower=max(0,min(1,(lip_z-world.z)/.025+.2))
  delta=Vector((0,0,-.007*influence*lower))
  jaw.data[v.index].co=v.co+mesh.matrix_world.inverted().to_3x3()@delta
  if delta.length>1e-6:changed+=1
jaw.value=0
# Retain fair skin and cloth textures; reduce texture size and specular glare.
for image in bpy.data.images:
 if image.size[0]:
  size=1024 if 'basecolor' in image.name.lower() else 512
  image.scale(size,size)
  image.file_format='JPEG'
for material in mesh.data.materials:
 if material and material.use_nodes:
  bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  for link in list(bsdf.inputs['Metallic'].links):material.node_tree.links.remove(link)
  bsdf.inputs['Metallic'].default_value=0
  bsdf.inputs['Roughness'].default_value=.78
mesh.name='LunaBody';mesh.data.name='LunaBody'
mesh['character']='Luna';mesh['source']='Grab3D woman-base-character';mesh['license']='CC0-1.0'
# Keep only the actual character, not generated bone-display helpers.
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);arm.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(output)),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(output),export_format='GLB',use_selection=True,export_animations=False,export_morph=True,export_morph_normal=False,export_image_format='JPEG',export_jpeg_quality=82,export_extras=True,export_yup=True,export_skins=True)
print('LUNA_BUILD',json.dumps({'vertices':len(mesh.data.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'mouth_vertices':changed,'bytes':os.path.getsize(output)}))
