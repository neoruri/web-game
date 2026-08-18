"""
캐릭터 LoRA 학습 (diffusers + peft). Forge venv 에 이미 있는 라이브러리만 쓴다.

8GB VRAM 에 맞추려고:
  - 이미지 latent 와 텍스트 임베딩을 미리 계산해 캐시한 뒤 VAE·텍스트인코더를 메모리에서 내린다
  - UNet 만 학습하고 gradient checkpointing 을 켠다
  - fp16 혼합정밀도

저장은 kohya 형식으로 변환해서 내보낸다. diffusers 기본 형식은 Forge 가 못 읽는다.

사용법:
    python train_lora.py                 기본 1200 스텝
    python train_lora.py --steps 1600 --rank 24
"""
import argparse
import os
import random

# Windows 는 기본적으로 심볼릭 링크 생성 권한이 없다.
# huggingface_hub 이 캐시에 링크를 만들려다 WinError 1314 로 죽으므로 복사 모드로 바꾼다.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import torch
import torch.nn.functional as F
from PIL import Image
from safetensors.torch import save_file

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "dataset")
OUT_DIR = "E:/claude/_tools/StabilityMatrix/Data/Models/Lora"
BASE = ("E:/claude/_tools/StabilityMatrix/Data/Models/StableDiffusion/"
        "DreamShaper_8_pruned.safetensors")


def load_pairs():
    pairs = []
    for f in sorted(os.listdir(DATA)):
        if not f.endswith(".png") or f.startswith("_"):
            continue
        txt = os.path.join(DATA, f[:-4] + ".txt")
        cap = open(txt, encoding="utf-8").read().strip() if os.path.exists(txt) else ""
        pairs.append((os.path.join(DATA, f), cap))
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=1200)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--name", default="hdarcher_lora")
    args = ap.parse_args()

    from diffusers import StableDiffusionPipeline, DDPMScheduler
    from peft import LoraConfig, get_peft_model_state_dict
    from diffusers.utils import convert_state_dict_to_kohya

    dev = "cuda"
    print("  베이스 모델 로드 ...")
    pipe = StableDiffusionPipeline.from_single_file(
        BASE, torch_dtype=torch.float16, safety_checker=None, requires_safety_checker=False)
    pipe.to(dev)
    sched = DDPMScheduler.from_config(pipe.scheduler.config)

    pairs = load_pairs()
    print(f"  데이터 {len(pairs)}장 — latent/텍스트 임베딩 사전 계산 ...")
    lat_cache, emb_cache = [], []
    with torch.no_grad():
        for path, cap in pairs:
            im = Image.open(path).convert("RGB")
            x = torch.from_numpy(
                (torch.frombuffer(im.tobytes(), dtype=torch.uint8)
                 .reshape(im.height, im.width, 3).numpy())).permute(2, 0, 1).float()
            x = (x / 127.5 - 1.0).unsqueeze(0).to(dev, torch.float16)
            lat = pipe.vae.encode(x).latent_dist.sample() * pipe.vae.config.scaling_factor
            lat_cache.append(lat.cpu())

            ids = pipe.tokenizer(cap, padding="max_length", truncation=True,
                                 max_length=pipe.tokenizer.model_max_length,
                                 return_tensors="pt").input_ids.to(dev)
            emb_cache.append(pipe.text_encoder(ids)[0].cpu())

    # 인코더는 더 이상 필요 없다. VRAM 을 비운다
    del pipe.vae, pipe.text_encoder
    torch.cuda.empty_cache()

    unet = pipe.unet
    unet.requires_grad_(False)
    unet.add_adapter(LoraConfig(
        r=args.rank, lora_alpha=args.rank, init_lora_weights="gaussian",
        target_modules=["to_k", "to_q", "to_v", "to_out.0"]))
    unet.enable_gradient_checkpointing()

    params = [p for p in unet.parameters() if p.requires_grad]
    for p in params:
        p.data = p.data.float()
    print(f"  학습 파라미터 {sum(p.numel() for p in params)/1e6:.2f}M (rank {args.rank})")

    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=1e-2)
    scaler = torch.amp.GradScaler("cuda")
    unet.train()

    n = len(lat_cache)
    for step in range(1, args.steps + 1):
        i = random.randrange(n)
        lat = lat_cache[i].to(dev, torch.float16)
        emb = emb_cache[i].to(dev, torch.float16)
        noise = torch.randn_like(lat)
        t = torch.randint(0, sched.config.num_train_timesteps, (1,), device=dev).long()
        noisy = sched.add_noise(lat, noise, t)

        with torch.autocast("cuda", dtype=torch.float16):
            pred = unet(noisy, t, encoder_hidden_states=emb).sample
            loss = F.mse_loss(pred.float(), noise.float())

        scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        scaler.step(opt)
        scaler.update()
        opt.zero_grad(set_to_none=True)

        if step % 100 == 0 or step == 1:
            mem = torch.cuda.max_memory_allocated() / 1024**3
            print(f"    step {step:5d}/{args.steps}  loss {loss.item():.4f}  VRAM {mem:.1f}GB",
                  flush=True)

    # Forge 가 읽을 수 있게 kohya 형식으로 변환
    # convert_state_dict_to_kohya 는 PEFT 를 직접 받는다.
    # diffusers 형식을 거치면 타입 판별에 실패한다 (ValueError: Original type None)
    sd = convert_state_dict_to_kohya(get_peft_model_state_dict(unet))
    # diffusers 변환기는 'lora_unet_' 접두사를 붙이지 않는다.
    # 이게 없으면 Forge 가 UNet 모듈에 매칭하지 못하고 LoRA 를 조용히 무시한다
    sd = {(k if k.startswith("lora_unet_") else "lora_unet_" + k): v for k, v in sd.items()}
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"{args.name}.safetensors")
    save_file({k: v.to(torch.float16).contiguous() for k, v in sd.items()}, out)
    print(f"  ✅ 저장: {out}  ({os.path.getsize(out)/1e6:.1f} MB)")
    print(f"  프롬프트에 <lora:{args.name}:0.8> 와 트리거 'hdarcher' 를 넣어 쓴다")


if __name__ == "__main__":
    main()
