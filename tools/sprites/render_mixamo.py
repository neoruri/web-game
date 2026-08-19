"""
Mixamo FBX(달리기 모캡)를 측면 스프라이트 프레임으로 렌더한다.  ※ Blender 안에서 실행

3D 프리렌더 방식의 핵심 이점: 같은 모델을 포즈만 바꿔 렌더하므로
프레임 간 캐릭터 동일성이 '보장'된다. AI 생성처럼 매번 추첨하지 않는다.

카메라는 정사영(orthographic)으로 고정한다. 원근 카메라를 쓰면 프레임마다
팔다리 길이가 미묘하게 달라져 2D 스프라이트로 쓰면 흔들려 보인다.

실행:
    blender.exe -b -P render_mixamo.py -- --fbx <경로> --frames 6 --out <폴더>
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
    ap.add_argument("--fbx", required=True)
    ap.add_argument("--frames", type=int, default=6)
    ap.add_argument("--out", required=True)
    ap.add_argument("--res", type=int, default=768)
    ap.add_argument("--transparent", action="store_true",
                    help="배경을 알파로. 크로마키 작업이 아예 없어진다")
    return ap.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("메시를 못 찾음 — 'With Skin' 으로 받았는지 확인")
    return meshes


def world_bounds(objs, dg):
    """애니메이션 적용된 실제 경계. 카메라 프레이밍에 쓴다."""
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
        ev.to_mesh_clear()
    return mn, mx


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)

    clear_scene()
    meshes = import_fbx(args.fbx)
    scene = bpy.context.scene

    start, end = scene.frame_start, scene.frame_end
    total = end - start
    if total <= 0:
        raise SystemExit("애니메이션 프레임이 없다 — FBX 에 애니가 들어있는지 확인")

    # 사이클을 균등 분할. 마지막 프레임은 첫 프레임과 같아 루프가 겹치므로 제외한다
    picks = [start + round(total * i / args.frames) for i in range(args.frames)]

    # 전 프레임을 훑어 최대 경계를 구한다. 프레임마다 따로 맞추면 크기가 흔들린다
    dg = bpy.context.evaluated_depsgraph_get()
    gmn = [1e9] * 3
    gmx = [-1e9] * 3
    for f in picks:
        scene.frame_set(f)
        dg.update()
        mn, mx = world_bounds(meshes, dg)
        for i in range(3):
            gmn[i] = min(gmn[i], mn[i])
            gmx[i] = max(gmx[i], mx[i])

    cx = (gmn[0] + gmx[0]) / 2
    cz = (gmn[2] + gmx[2]) / 2
    height = gmx[2] - gmn[2]
    width = gmx[0] - gmn[0]
    span = max(height, width) * 1.15          # 여백 15%

    # ── 카메라: 우향 측면. -Y 에서 바라본다 ──
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (cx, gmn[1] - max(span * 3, 10), cz)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam

    # ── 조명: 정면 상단. 실루엣이 뭉치지 않게 약한 보조광 추가 ──
    key = bpy.data.lights.new("Key", type="SUN")
    key.energy = 4.0
    ko = bpy.data.objects.new("Key", key)
    scene.collection.objects.link(ko)
    ko.location = (cx - span, cam.location[1], cz + span)
    ko.rotation_euler = (math.radians(65), 0, math.radians(-35))

    fill = bpy.data.lights.new("Fill", type="SUN")
    fill.energy = 1.2
    fo = bpy.data.objects.new("Fill", fill)
    scene.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(110), 0, math.radians(40))

    # ── 렌더 설정 ──
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = args.res
    scene.render.resolution_y = args.res
    scene.render.film_transparent = args.transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if args.transparent else "RGB"
    if not args.transparent:
        world = bpy.data.worlds.new("W")
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[0].default_value = (0.0, 0.85, 0.0, 1)
        scene.world = world

    for i, f in enumerate(picks, 1):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(args.out, f"run_f{i}.png")
        bpy.ops.render.render(write_still=True)
        print(f"  f{i}  (blender frame {f}) -> {scene.render.filepath}", flush=True)

    print(f"  완료: {args.frames}장 / 인물높이 {height:.2f} / ortho {span:.2f}")


if __name__ == "__main__":
    main()
