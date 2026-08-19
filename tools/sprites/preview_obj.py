"""생성된 3D 메시를 여러 각도에서 렌더해 품질을 확인한다.  ※ Blender 안에서 실행

이미지→3D 변환은 '보이지 않던 뒷면'을 모델이 추측해서 채운다.
정면만 보면 멀쩡해 보여도 측면·뒷면이 무너져 있는 경우가 많으므로 반드시 돌려봐야 한다.

실행:
    blender.exe -b -P preview_obj.py -- --obj <경로> --out <폴더> --views 6
"""
import argparse
import math
import os
import sys

import bpy


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--obj", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--views", type=int, default=6)
    ap.add_argument("--res", type=int, default=512)
    return ap.parse_args(argv)


def main():
    args = parse_args()
    args.obj = os.path.abspath(args.obj)
    args.out = os.path.abspath(args.out)
    os.makedirs(args.out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=args.obj)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not objs:
        raise SystemExit("메시 없음")

    # Blender OBJ 임포터는 Y-up -> Z-up 축 변환을 자체적으로 한다.
    # 파일 쪽에서 미리 회전해두면 이중 적용되어 인물이 눕는다.
    # 임포트 후 '가장 긴 축을 Z로' 세우면 파일이 어떤 규약이든 안전하다.
    import mathutils
    for _ in range(3):
        mn = [1e9] * 3
        mx = [-1e9] * 3
        for o in objs:
            for c in o.bound_box:
                w = o.matrix_world @ mathutils.Vector(c)
                for i in range(3):
                    mn[i] = min(mn[i], w[i])
                    mx[i] = max(mx[i], w[i])
        ext = [mx[i] - mn[i] for i in range(3)]
        longest = ext.index(max(ext))
        if longest == 2:
            break
        axis = "Y" if longest == 0 else "X"
        ang = math.radians(90 if longest == 0 else -90)
        rot = mathutils.Matrix.Rotation(ang, 4, axis)
        for o in objs:
            o.matrix_world = rot @ o.matrix_world
        bpy.context.view_layer.update()
    print(f"  세로축 정렬 완료 (가장 긴 축 -> Z)")

    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ __import__("mathutils").Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    cx, cy, cz = [(mn[i] + mx[i]) / 2 for i in range(3)]
    span = max(mx[i] - mn[i] for i in range(3)) * 1.2

    # 정점 색을 그대로 보여주기 위한 머티리얼 (TripoSR 은 vertex color 로 텍스처를 담는다)
    mat = bpy.data.materials.new("VC")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeVertexColor")
    layers = objs[0].data.color_attributes
    if len(layers):
        attr.layer_name = layers[0].name
        nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    sun = bpy.data.lights.new("Sun", type="SUN")
    sun.energy = 3.0
    so = bpy.data.objects.new("Sun", sun)
    scene.collection.objects.link(so)

    engines = scene.render.bl_rna.properties["engine"].enum_items.keys()
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        if e in engines:
            scene.render.engine = e
            break
    scene.render.resolution_x = scene.render.resolution_y = args.res
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    dist = span * 3
    for i in range(args.views):
        az = 2 * math.pi * i / args.views
        cam.location = (cx + dist * math.sin(az), cy - dist * math.cos(az), cz)
        cam.rotation_euler = (math.radians(90), 0, az)
        so.location = cam.location
        so.rotation_euler = (math.radians(60), 0, az - math.radians(30))
        scene.render.filepath = os.path.join(args.out, f"view_{i:02d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"  view {i}  az {math.degrees(az):.0f}도", flush=True)
    print(f"  완료 {args.views}장")


if __name__ == "__main__":
    main()
