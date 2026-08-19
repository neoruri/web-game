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
    ap.add_argument("--period", type=int, default=0,
                    help="사이클 길이 직접 지정. 0이면 자동검출")
    ap.add_argument("--period-mult", type=int, default=2,
                    help="자동검출값 배수. 폭 기반 검출은 '한 걸음'을 잡으므로 "
                         "좌우 두 걸음을 담으려면 2가 맞다")
    ap.add_argument("--azimuth", type=float, default=90.0,
                    help="카메라 방위각(도). 0=정면, 90/270=측면")
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


def pose_signature(meshes, dg):
    """프레임의 자세를 한 숫자로 요약. 주기 검출용."""
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
        ev.to_mesh_clear()
    # 가로 폭 = 보폭에 직접 비례한다. 걷기·달리기 주기를 잘 드러낸다
    return (mx[0] - mn[0]) + (mx[1] - mn[1])


def detect_period(meshes, start, end, scene, max_period=120):
    """자세 신호의 자기상관으로 한 사이클 길이를 찾는다.
    Mixamo FBX 는 같은 사이클이 여러 번 반복돼 들어있는 경우가 있다."""
    dg = bpy.context.evaluated_depsgraph_get()
    n = min(end - start + 1, 240)
    sig = []
    for i in range(n):
        scene.frame_set(start + i)
        dg.update()
        sig.append(pose_signature(meshes, dg))
    mean = sum(sig) / len(sig)
    s = [v - mean for v in sig]

    best, best_score = None, -1e9
    for p in range(8, min(max_period, n // 2) + 1):
        num = sum(s[i] * s[i + p] for i in range(n - p))
        den = (n - p)
        score = num / den
        if score > best_score:
            best_score, best = score, p
    return best or (end - start)


def main():
    args = parse_args()
    # Blender 는 상대 경로를 blend 파일 기준으로 푼다. blend 가 없으면 엉뚱한 곳에 쓰이므로
    # 반드시 절대 경로로 넘긴다 (렌더는 성공했다고 찍히는데 파일이 없는 현상의 원인)
    args.fbx = os.path.abspath(args.fbx)
    args.out = os.path.abspath(args.out)
    os.makedirs(args.out, exist_ok=True)

    clear_scene()
    meshes = import_fbx(args.fbx)
    scene = bpy.context.scene

    start, end = scene.frame_start, scene.frame_end
    total = end - start
    if total <= 0:
        raise SystemExit("애니메이션 프레임이 없다 — FBX 에 애니가 들어있는지 확인")

    period = args.period or detect_period(meshes, start, end, scene) * args.period_mult
    period = min(period, total)
    # 한 주기 안에서 균등 분할한다. 전체를 나누면 주기의 배수에 걸려
    # 6장이 전부 같은 위상으로 나온다(에일리어싱)
    picks = [start + round(period * i / args.frames) for i in range(args.frames)]
    print(f"  사이클 길이 {period} 프레임 (전체 {total}) -> 샘플 {picks}")

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

    # ── 카메라: 정사영. 방위각으로 시점을 돌린다 ──
    # azimuth 0 = 캐릭터 정면(-Y 쪽에서), 90 = 측면. FBX 마다 캐릭터가 보는 방향이
    # 달라서 고정할 수 없다. --azimuth 로 맞춘다
    cy = (gmn[1] + gmx[1]) / 2
    az = math.radians(args.azimuth)
    dist = max(span * 3, 10)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (cx + dist * math.sin(az), cy - dist * math.cos(az), cz)
    cam.rotation_euler = (math.radians(90), 0, az)
    scene.camera = cam

    # ── 조명: 정면 상단. 실루엣이 뭉치지 않게 약한 보조광 추가 ──
    key = bpy.data.lights.new("Key", type="SUN")
    key.energy = 4.0
    ko = bpy.data.objects.new("Key", key)
    scene.collection.objects.link(ko)
    ko.location = (cam.location[0], cam.location[1], cz + span)
    ko.rotation_euler = (math.radians(60), 0, az + math.radians(-30))

    fill = bpy.data.lights.new("Fill", type="SUN")
    fill.energy = 1.2
    fo = bpy.data.objects.new("Fill", fill)
    scene.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(115), 0, az + math.radians(50))

    # ── 렌더 설정 ──
    # 엔진 이름은 Blender 버전마다 다르다 (5.x 는 BLENDER_EEVEE, 4.2~4.5 는 _NEXT)
    engines = scene.render.bl_rna.properties["engine"].enum_items.keys()
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        if e in engines:
            scene.render.engine = e
            break
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
