"""
러닝 레퍼런스를 생성한 뒤 거기서 OpenPose 스켈레톤을 '추출' 한다.

왜 이렇게 하나 (docs/SD_Forge_작업지시.md §2 ②):
좌표로 직접 그린 측면 스켈레톤은 ControlNet 이 약하게만 따른다.
OpenPose 모델은 정면·3/4 뷰 위주로 학습됐고, 완전 측면은 좌우 관절이 겹쳐 모호하다.
실제 인물 이미지에서 preprocessor 로 뽑은 스켈레톤은 모델이 훨씬 잘 인식한다.

레퍼런스는 외부에서 구하지 않고 SD 로 직접 만든다 (자급자족).
캐릭터가 아니라 '포즈만' 쓸 것이므로 평범한 러너로 뽑는다.

사용법:
    python make_pose_from_reference.py            # CONTACT 포즈 4장
    python make_pose_from_reference.py passing 4  # PASSING 포즈 4장
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
REF_DIR = os.path.join(HERE, "_pose_refs")

# 포즈별 프롬프트. 보폭이 다른 러닝 사이클 국면을 노린다 (§6)
POSES = {
    # 3·7 = CONTACT: 가장 넓은 보폭
    "contact": "(very wide stride:1.3), legs far apart, one leg stretched far behind, "
               "(both feet touching the ground:1.2), front foot planted",
    # 1·5 = PASSING: 발 모음, 무릎 들림
    "passing": "feet close together, one knee lifted forward, legs passing each other, "
               "(both feet near the ground:1.2)",
    # 2·4·6·8 = 중간 보폭
    "mid": "moderate stride, legs slightly apart, (both feet on the ground:1.2)",
}

# 팔은 프롬프트로만 요구하면 안 잡힌다. 레퍼런스 단계에서 확실히 굽혀둬야
# 추출된 스켈레톤에 그 각도가 담긴다 (§9 체크 ①: 팔이 프레임마다 다른 각도로 흔들리는가)
BASE = ("(side view:1.4), profile view, facing right, (full body:1.4), head to toe, "
        "(both feet visible:1.3), (male runner:1.2), man jogging, running, "
        "(arms bent at ninety degrees:1.45), (elbows bent sharply:1.35), "
        "(one forearm swung forward across chest:1.2), one elbow drawn back, "
        "hands near waist height, fitted athletic clothing, torso leaning forward, "
        "plain flat light grey background, studio reference photo, "
        "sharp clear silhouette")

NEG = ("(cropped:1.4), cut off, close-up, zoomed in, feet out of frame, "
       "front view, back view, three quarter view, facing viewer, "
       "(arms straight:1.4), (arms extended:1.35), arms outstretched, "
       "arms raised overhead, arms spread wide, T-pose, reaching, "
       "(woman:1.3), female, feminine, ponytail, sports bra, "
       "(jumping:1.3), leaping, both feet off the ground, "
       "multiple people, two people, crowd, "
       "loose baggy clothes, long coat, cloak, cape, dress, "
       "blurry, motion blur, dark, low contrast, text, watermark")


def post(path, payload, timeout=900):
    req = urllib.request.Request(
        API + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def detect_pose(img_b64, module="openpose", res=768):
    """ControlNet preprocessor 로 스켈레톤 추출.
    body-only('openpose') 를 쓴다. dw_openpose_full 은 얼굴·손가락 키포인트까지 넣는데,
    이 캐릭터는 후드로 얼굴을 가리고 손에는 활을 들어야 해서 오히려 방해가 된다."""
    return post("/controlnet/detect", {
        "controlnet_module": module,
        "controlnet_input_images": [img_b64],
        "controlnet_processor_res": res,
        "controlnet_threshold_a": 0.5,
        "controlnet_threshold_b": 0.5,
    }, timeout=600)


def main():
    pose = sys.argv[1] if len(sys.argv) > 1 else "contact"
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    if pose not in POSES:
        raise SystemExit(f"pose 는 {list(POSES)} 중 하나")

    os.makedirs(REF_DIR, exist_ok=True)
    print(f"  레퍼런스 생성: {pose} x{count}")
    r = post("/sdapi/v1/txt2img", {
        "prompt": f"{BASE}, {POSES[pose]}",
        "negative_prompt": NEG,
        "steps": 26, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
        "cfg_scale": 7, "width": 512, "height": 768,
        "seed": -1, "batch_size": 1, "n_iter": count,
    })

    ok = 0
    for i, img in enumerate(r["images"][:count], 1):
        ref_path = os.path.join(REF_DIR, f"{pose}_{i}_ref.png")
        with open(ref_path, "wb") as fh:
            fh.write(base64.b64decode(img))
        det = detect_pose(img)
        imgs = det.get("images") or []
        if not imgs:
            print(f"    {i}: 스켈레톤 검출 실패 ({det.get('info')})")
            continue
        pose_path = os.path.join(REF_DIR, f"{pose}_{i}_pose.png")
        with open(pose_path, "wb") as fh:
            fh.write(base64.b64decode(imgs[0]))
        ok += 1
        print(f"    {i}: {os.path.basename(ref_path)} -> {os.path.basename(pose_path)}")
    print(f"  검출 성공 {ok}/{count}")


if __name__ == "__main__":
    main()
