"""배경음악 — "던전 오스티나토" (샘플 A 채택본)

⚠️ 이 스크립트는 **public/ 밖에** 있어야 한다.
   Vite 는 public/ 을 dist 로 통째 복사하므로, public/ 안에 생성 스크립트나
   중간 산출물을 두면 그게 전부 배포된다(실측: public/ 8.8MB 중 실제 로드 1.0MB).
   → 산출물 ogg/m4a 만 public/audio/ 로 내보내고 중간물은 임시 폴더에 둔다.

=== 왜 이 구성인가 ===
1차 버전(드론·패드 위주)은 "잡음처럼 웅웅거린다"는 피드백을 받았다. 원인은 수치로 확인됐다:
  · 스펙트럴 센트로이드 92Hz (일반 게임 음악 400~1200Hz)
  · 800Hz 이상 에너지 0.3%
  · 에너지의 82%가 300Hz 이하
근본 오류는 "어둡게 = 저역만"으로 만든 것. 실제로 어두운 게임 음악은
**저역이 두껍되 중·고역에 또렷한 음원(어택)이 있다.**

그래서 이 곡의 원칙:
  ① 60Hz 이하 컷 — 서브는 헤드룸만 먹고 폰에서 안 들린다
  ② **뜯는 현(pluck)·타격(kick/shaker)** 이 주역 — 어택이 있어야 리듬·음정이 잡힌다
  ③ 코드 진행을 명확히 (Am–F–C–G × 4)
  ④ 선율은 최소 — 뱀서류는 한 판에 곡이 수십 번 반복되므로 멜로디가 뚜렷하면 질린다

=== 왜 32초 / 16마디인가 ===
16초로는 한 판(2~10분)에 8~40회 반복된다. 32초로 늘리고 **4마디 단위로 구성을 바꿔**
(도입 → 전개 → 숨돌림 → 복귀) 반복 체감을 낮춘다.

=== 심리스 루프 3원칙 ===
  ① 모든 주파수를 1/LOOP 격자에 스냅  → 사인이 정확히 정수 주기
  ② 필터를 원형(circular)으로          → 경계에서 필터 상태가 연속
  ③ 리버브를 원형 컨볼루션으로          → 잔향이 앞으로 자동 wrap
  ④ 마디를 넘는 이벤트는 add() 가 앞으로 감아 넣는다
  ⑤ ⚠️ OGG 인코더 패딩 때문에 디코드 길이가 32.00초보다 길다.
     main.js 에서 Web Audio `loopEnd = BGM_LOOP_SEC` 로 잘라야 빈틈이 없다.

실행: python3 tools/audio/gen_bgm.py     (numpy, scipy, ffmpeg 필요)
출력: public/audio/bgm_dungeon.ogg (+ .m4a 폴백)
"""
import pathlib
import subprocess
import tempfile
import wave

import numpy as np
from scipy import signal

HERE = pathlib.Path(__file__).resolve().parent
OUT_DIR = HERE.parent.parent / 'public' / 'audio'
OUT_DIR.mkdir(parents=True, exist_ok=True)
TMP = pathlib.Path(tempfile.gettempdir())

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM                # 0.5초
BAR = BEAT * 4                   # 2초
BARS = 16
LOOP = BAR * BARS                # 32.0초 정확히
N = int(SR * LOOP)
GRID = 1.0 / LOOP

# ⚠️ main.js 의 BGM_LOOP_SEC 와 **반드시 같아야 한다**
print(f'LOOP = {LOOP:.2f}s  → main.js 의 BGM_LOOP_SEC 와 일치해야 함')


def q(f):
    return round(f / GRID) * GRID


def note(name):
    """음이름 → 주파수 (A4=440). 'A2' 'C#4' 'Eb3' 형식. 격자에 스냅해 반환."""
    base = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = base[name[0]]
    i = 1
    if len(name) > 1 and name[1] in '#b':
        n += 1 if name[1] == '#' else -1
        i = 2
    return q(440.0 * 2 ** ((n + (int(name[i:]) - 4) * 12) / 12))


def _resp(b, a, n):
    _, H = signal.freqz(b, a, worN=n // 2 + 1)
    return H


def chp(x, cut, order=2):
    b, a = signal.butter(order, cut / (SR / 2), 'high')
    return np.fft.irfft(np.fft.rfft(x) * _resp(b, a, len(x)), n=len(x))


def add(buf, sig, at):
    """이벤트 배치. 루프 끝을 넘으면 앞으로 감아 심리스를 유지한다."""
    s = int(at * SR) % N
    d = len(sig)
    if s + d <= N:
        buf[s:s + d] += sig
    else:
        k = N - s
        buf[s:] += sig[:k]
        buf[:d - k] += sig[k:]


# ---------- 음원 ----------
def pluck(freq, dur, decay=5.0, bright=0.72, partials=14, seed=0):
    """뜯는 현 — 배음 가산합성. 높은 배음이 먼저 사라져 실제 현처럼 들린다.
    **어택이 있는 소리**라 1차 버전의 지속음과 근본적으로 다르다."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    rg = np.random.default_rng(seed)
    out = np.zeros(n)
    for k in range(1, partials + 1):
        amp = (bright ** (k - 1)) / k ** 1.05
        if amp < 0.002:
            break
        out += amp * np.sin(2 * np.pi * freq * k * tt + rg.uniform(0, 6.28)) \
            * np.exp(-decay * k ** 0.55 * tt)
    out *= 1 - np.exp(-tt * 500)          # 짧은 어택 램프(클릭 방지)
    return out * 0.5


def bell(freq, dur, gain=1.0):
    """맑은 종 — 고역 담당. 이게 있어야 폰 스피커에서 '음악'으로 들린다."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for mul, a in ((1.0, 1.0), (2.0, 0.5), (3.01, 0.28), (4.2, 0.14), (5.4, 0.08)):
        out += a * np.sin(2 * np.pi * freq * mul * tt) * np.exp(-tt * (2.2 + mul * 0.7))
    return out * 0.3 * gain


def kick(dur=0.34, f0=110, f1=44, gain=1.0):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(np.linspace(f0, f1, n)) / SR
    body = np.sin(ph) * np.exp(-tt * 11)
    click = np.random.default_rng(1).normal(0, 1, n) * np.exp(-tt * 90) * 0.3
    return (body + click) * 0.55 * gain


def tom(dur=0.3, f0=210, f1=120, gain=1.0, seed=2):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(np.linspace(f0, f1, n)) / SR
    body = np.sin(ph) * np.exp(-tt * 13)
    nz = np.random.default_rng(seed).normal(0, 1, n) * np.exp(-tt * 30) * 0.35
    return (body + nz) * 0.5 * gain


def shaker(dur=0.09, gain=1.0, seed=3):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    nz = np.random.default_rng(seed).normal(0, 1, n)
    sos = signal.butter(2, [2000 / (SR / 2), 0.50], 'band', output='sos')
    return signal.sosfilt(sos, nz) * np.exp(-tt * 45) * 0.42 * gain


def reverb(x, seconds=1.7, wet=0.28, cut=4200, seed=5):
    n = int(seconds * SR)
    ir = np.random.default_rng(seed).normal(0, 1, n) * np.exp(-np.linspace(0, 7, n))
    b, a = signal.butter(4, cut / (SR / 2), 'low')
    ir = signal.lfilter(b, a, ir)
    ir /= np.abs(ir).sum()
    pad = np.zeros(N)
    pad[:min(n, N)] = ir[:min(n, N)]
    y = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(pad), n=N)   # 원형 = 꼬리가 앞으로
    return x * (1 - wet) + y * wet * 3.2


# 코드 진행: Am – F – C – G, 4번 반복 = 16마디
PROG = [('A2', ['A3', 'C4', 'E4']), ('F2', ['F3', 'A3', 'C4']),
        ('C3', ['C4', 'E4', 'G4']), ('G2', ['G3', 'B3', 'D4'])]

# 4마디 블록별 구성 — 이게 32초를 "그냥 2번 반복"이 아니게 만든다
#   intro   : 뼈대만 (오스티나토 + 킥)
#   develop : 아르페지오 + 톰 추가
#   breathe : 드럼을 덜어내고 종을 넣어 숨을 돌린다 ← 대비가 반복 체감을 낮춘다
#   full    : 전부 + 마지막 마디에 톰 필로 되돌아감
SECTIONS = ['intro', 'develop', 'breathe', 'full']

x = np.zeros(N)

for bar in range(BARS):
    t0 = bar * BAR
    root, tri = PROG[bar % 4]
    sec = SECTIONS[bar // 4]
    rf = note(root)
    thin = sec == 'breathe'

    # --- 저음 오스티나토 (8분음표, 루트–5도 교대) : 곡의 엔진 ---
    for i in range(8):
        f = rf if i % 4 != 2 else rf * 1.5
        g = (1.0 if i % 2 == 0 else 0.62) * (0.55 if thin else 1.0)
        add(x, pluck(f, 0.42, decay=6.5, seed=bar * 8 + i) * g, t0 + i * BEAT / 2)

    # --- 윗성부 아르페지오 ---
    if sec != 'intro':
        for i, nm in enumerate(tri):
            g = 0.34 if thin else 0.5
            add(x, pluck(note(nm), 1.1, decay=3.4, bright=0.6, seed=100 + bar * 3 + i) * g,
                t0 + BEAT * (1 + i * 0.5))

    # --- 드럼 ---
    if thin:
        add(x, kick(gain=0.8), t0)                    # 숨돌림: 1박만
    else:
        add(x, kick(), t0)
        add(x, kick(gain=0.72), t0 + BEAT * 2)
        if sec in ('develop', 'full'):
            for i, b in enumerate((1.5, 3.5)):
                add(x, tom(f0=200 + i * 50, gain=0.5, seed=400 + bar * 2 + i), t0 + b * BEAT)

    # --- 셰이커 (8분) ---
    for i in range(8):
        g = (0.55 if i % 2 else 0.30) * (0.45 if thin else 1.0)   # 셰이커 = 중고역 담당
        add(x, shaker(gain=g, seed=200 + i), t0 + i * BEAT / 2)

    # --- 종: 숨돌림 구간에 선율 대신 '점'을 찍는다 ---
    if thin and bar % 2 == 0:
        add(x, bell(note(tri[2]) * 2, 2.2, 0.68), t0 + BEAT)
    # 4마디마다 종 한 번 — 고역에 규칙적인 점을 찍어 곡이 답답해지지 않게
    if not thin and bar % 4 == 3:
        add(x, bell(note('A5'), 1.8, 0.5), t0 + BEAT * 3)
    if sec == 'full' and bar == BARS - 1:
        # 마지막 마디: 톰 필로 1마디로 되돌아가는 추진력을 만든다
        for i, b in enumerate((2.5, 2.75, 3.0, 3.25, 3.5, 3.75)):
            add(x, tom(f0=170 + i * 22, f1=110, gain=0.34 + i * 0.06, seed=700 + i),
                t0 + b * BEAT)

# --- 마스터링 ---
x = chp(x, 62)                   # 서브 컷 — 폰에서 안 들리고 헤드룸만 먹는다
x = reverb(x)


def high_shelf(sig, cut=1500, gain=1.28):
    """1.8kHz 이상을 들어올린다. 폰 스피커는 저역을 못 내므로 이 대역이
    곧 '들리는 음악'이다. 저역을 깎는 대신 위를 드는 쪽이 무게를 유지한다."""
    return sig + chp(sig, cut, order=2) * (gain - 1.0)


x = high_shelf(x)
mono = x / np.abs(x).max() * 0.86

# 가벼운 스테레오 폭 (3ms 딜레이) — 과하면 모노 재생에서 위상이 상쇄된다
Lc = mono
Rc = np.roll(mono, int(0.003 * SR)) * 0.9 + mono * 0.1
Rc = Rc / np.abs(Rc).max() * 0.80

st = np.empty(N * 2, dtype=np.int16)
st[0::2] = np.clip(Lc, -1, 1) * 32767
st[1::2] = np.clip(Rc, -1, 1) * 32767

raw = TMP / '_bgm_raw.wav'
with wave.open(str(raw), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(st.tobytes())

subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw),
                '-c:a', 'libvorbis', '-b:a', '80k',
                str(OUT_DIR / 'bgm_dungeon.ogg')], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw),
                '-c:a', 'aac', '-b:a', '80k',
                str(OUT_DIR / 'bgm_dungeon.m4a')], check=True)

# --- 검증 ---
f, P = signal.welch(mono, SR, nperseg=8192)
tot = P.sum()
cent = (f * P).sum() / tot
hi = 100 * P[f >= 800].sum() / tot
low = 100 * P[f < 300].sum() / tot
sos = signal.butter(4, 400 / (SR / 2), 'high', output='sos')
phone = 20 * np.log10(np.sqrt(np.mean(signal.sosfilt(sos, mono) ** 2)))
# 이음부 판정: 마디 시작마다 킥 어택으로 큰 점프가 정상적으로 생긴다.
# 그래서 "직전 샘플 기울기"와 비교하면 멀쩡한 루프도 불연속으로 오판한다.
# → **다른 마디 시작들의 점프**와 비교하는 것이 맞다.
seam = abs(float(mono[0] - mono[-1]))
barjumps = [abs(float(mono[int(b * BAR * SR)] - mono[int(b * BAR * SR) - 1]))
            for b in range(1, BARS)]
thr = max(barjumps) * 1.6
before = float(mono[-1] - mono[-2])
kb = (OUT_DIR / 'bgm_dungeon.ogg').stat().st_size / 1024

print(f'센트로이드 {cent:.0f}Hz  800Hz+ {hi:.1f}%  300Hz이하 {low:.0f}%  '
      f'폰모사 {phone:.1f}dBFS')
print(f'이음부 점프 {seam:.5f} vs 다른 마디 시작 점프 최대 {max(barjumps):.5f} '
      f'→ {"연속" if seam <= thr else "확인필요"}')
print(f'RMS {20 * np.log10(np.sqrt(np.mean(mono ** 2))):.1f} dBFS   용량 {kb:.0f}KB')
print('참고 — 1차(웅웅) 버전: 센트로이드 92Hz / 800Hz+ 0.3% / 300Hz이하 82%')
