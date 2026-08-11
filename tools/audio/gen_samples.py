"""배경음악 후보 샘플 4종 — 성격을 확실히 다르게 만들어 고르게 한다.

앞선 1차 시도가 "잡음처럼 웅웅거린다"는 피드백을 받았다. 원인은 명확하다:
  · 에너지의 82%가 300Hz 이하 → 음정이 아니라 저역 덩어리로 들린다
  · 지속음(드론·패드)만 있고 **어택이 없다** → 리듬도 선율도 안 잡힌다
  · 스펙트럴 센트로이드 92Hz (일반 게임 음악은 400~1200Hz)

그래서 이번 샘플들은 전부 이 원칙을 지킨다:
  ① 60Hz 이하를 잘라낸다 — 서브는 헤드룸만 먹고 폰에서 안 들린다
  ② **뜯는 소리(pluck)·타격(drum)처럼 어택이 있는 음원**을 주역으로
  ③ 코드 진행을 명확히 (Am–F–C–G 계열) → "음악"으로 읽히게
  ④ 목표 센트로이드 400~1000Hz

공통: 120BPM, 8마디 = 16초 심리스 루프.
  루프 이음을 위해 모든 주파수를 1/16Hz 격자에 스냅하고, 노이즈는 원형 필터를 쓴다.

실행: python3 tools/audio/gen_samples.py
출력: tools/audio/samples/*.ogg   (public/ 밖 — 고른 뒤에 본 스크립트로 옮긴다)
"""
import pathlib
import subprocess
import tempfile
import wave

import numpy as np
from scipy import signal

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'samples'
OUT.mkdir(exist_ok=True)
TMP = pathlib.Path(tempfile.gettempdir())

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM                # 0.5초
BAR = BEAT * 4                   # 2초
LOOP = BAR * 8                   # 16초
N = int(SR * LOOP)
GRID = 1.0 / LOOP


def q(f):
    return round(f / GRID) * GRID


def note(name):
    """음이름 → 주파수 (A4=440). 'A2' 'C#4' 'Eb3' 형식."""
    base = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = base[name[0]]
    i = 1
    if len(name) > 1 and name[1] in '#b':
        n += 1 if name[1] == '#' else -1
        i = 2
    octv = int(name[i:])
    return q(440.0 * 2 ** ((n + (octv - 4) * 12) / 12))


def _resp(b, a, n):
    _, H = signal.freqz(b, a, worN=n // 2 + 1)
    return H


def chp(x, cut, order=2):
    """원형 하이패스 — 루프 경계에서 필터 상태가 연속이다."""
    b, a = signal.butter(order, cut / (SR / 2), 'high')
    return np.fft.irfft(np.fft.rfft(x) * _resp(b, a, len(x)), n=len(x))


def clp(x, cut, order=4):
    b, a = signal.butter(order, cut / (SR / 2), 'low')
    return np.fft.irfft(np.fft.rfft(x) * _resp(b, a, len(x)), n=len(x))


def add(buf, sig, at):
    """루프 안에 이벤트를 놓는다. 끝을 넘으면 앞으로 감아 심리스 유지."""
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
    **어택이 있는 소리**라 저역만 깔던 1차 버전과 근본적으로 다르다."""
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


def bowed(freq, dur, vib=4.5, bright=0.55):
    """활로 긋는 소리 — 톱니 + 비브라토. 지속되지만 배음이 있어 음정이 들린다."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    v = 1 + 0.004 * np.sin(2 * np.pi * vib * tt)
    for k in range(1, 11):
        out += (bright ** (k - 1)) / k * np.sin(2 * np.pi * freq * k * tt * v)
    env = np.minimum(1, tt / 0.12) * np.exp(-tt * 1.1)   # 완만한 어택 + 감쇠
    return out * env * 0.32


def bell(freq, dur, gain=1.0):
    """맑은 종 — 고역을 담당해 곡이 '어둡지만 답답하지 않게' 만든다."""
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
    sos = signal.butter(2, [3000 / (SR / 2), 0.98], 'band', output='sos')
    return signal.sosfilt(sos, nz) * np.exp(-tt * 45) * 0.42 * gain


def stab(freq, dur=0.55, gain=1.0):
    """저음 금관 스탭 — 마디 시작을 강조해 진행이 또렷해진다."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 9):
        out += (0.62 ** (k - 1)) / k * np.sin(2 * np.pi * freq * k * tt)
    env = np.minimum(1, tt / 0.03) * np.exp(-tt * 4.5)
    return out * env * 0.34 * gain


def reverb(x, seconds=1.7, wet=0.26, cut=4200, seed=5):
    n = int(seconds * SR)
    ir = np.random.default_rng(seed).normal(0, 1, n) * np.exp(-np.linspace(0, 7, n))
    b, a = signal.butter(4, cut / (SR / 2), 'low')
    ir = signal.lfilter(b, a, ir)
    ir /= np.abs(ir).sum()
    pad = np.zeros(N)
    pad[:min(n, N)] = ir[:min(n, N)]
    y = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(pad), n=N)   # 원형 = 꼬리가 앞으로
    return x * (1 - wet) + y * wet * 3.2


# 코드 진행 (Am – F – C – G) × 2 — 어둡지만 앞으로 나아가는 느낌
PROG = [('A', 'A2', ['A3', 'C4', 'E4']), ('F', 'F2', ['F3', 'A3', 'C4']),
        ('C', 'C3', ['C4', 'E4', 'G4']), ('G', 'G2', ['G3', 'B3', 'D4'])]
CHORDS = PROG + PROG                    # 8마디


# ============================================================
# A) 던전 오스티나토 — 8분음표로 계속 뜯는 저음 현 + 킥.
#    가장 "게임 음악"답고 추진력이 있다. 뱀서류의 반복 플레이와 잘 맞는다.
# ============================================================
def sample_a():
    x = np.zeros(N)
    for bar, (_, root, tri) in enumerate(CHORDS):
        t0 = bar * BAR
        rf = note(root)
        # 8분음표 오스티나토 (루트–5도 교대)
        for i in range(8):
            f = rf if i % 4 != 2 else rf * 1.5
            g = 1.0 if i % 2 == 0 else 0.62
            add(x, pluck(f, 0.42, decay=6.5, seed=bar * 8 + i) * g, t0 + i * BEAT / 2)
        # 화음 아르페지오 (윗성부)
        for i, nm in enumerate(tri):
            add(x, pluck(note(nm), 1.1, decay=3.4, bright=0.6, seed=100 + bar * 3 + i) * 0.5,
                t0 + BEAT * (1 + i * 0.5))
        # 드럼: 1·3박 킥 + 셰이커
        add(x, kick(), t0)
        add(x, kick(gain=0.72), t0 + BEAT * 2)
        for i in range(8):
            add(x, shaker(gain=0.5 if i % 2 else 0.28, seed=200 + i), t0 + i * BEAT / 2)
        if bar % 4 == 3:                       # 4마디마다 종소리 한 번
            add(x, bell(note('A5'), 2.0, 0.55), t0 + BEAT * 3)
    return chp(x, 62)


# ============================================================
# B) 첼로 + 심장박동 — 느리게 긋는 저음 현. 긴장/잠입 쪽.
#    1차 버전과 성격은 비슷하지만 **음정이 확실히 들린다**(배음 + 비브라토).
# ============================================================
def sample_b():
    x = np.zeros(N)
    for bar, (_, root, tri) in enumerate(CHORDS):
        t0 = bar * BAR
        add(x, bowed(note(root) * 2, BAR * 1.05) * 1.0, t0)          # 첼로 음역
        add(x, bowed(note(tri[1]), BAR * 1.05, bright=0.42) * 0.55, t0 + 0.02)
        # 심장박동 (쿵-쿵)
        add(x, kick(f0=90, f1=40, gain=0.9), t0)
        add(x, kick(f0=86, f1=38, gain=0.5), t0 + 0.3)
        add(x, kick(f0=90, f1=40, gain=0.8), t0 + BEAT * 2)
        add(x, kick(f0=86, f1=38, gain=0.45), t0 + BEAT * 2 + 0.3)
        # 드문 피치카토 — 정적을 깨는 점
        if bar % 2 == 1:
            add(x, pluck(note(tri[2]), 0.9, decay=4.5, seed=300 + bar) * 0.6,
                t0 + BEAT * 2.5)
        if bar == 5:
            add(x, bell(note('E5'), 2.4, 0.5), t0 + BEAT)
    return chp(x, 62)


# ============================================================
# C) 부족 타악 — 드럼이 주역. 액션/전투 쪽이고 가장 신난다.
#    저음 금관 스탭으로 코드감만 얹는다.
# ============================================================
def sample_c():
    x = np.zeros(N)
    for bar, (_, root, tri) in enumerate(CHORDS):
        t0 = bar * BAR
        add(x, stab(note(root) * 2, 0.5, 0.9), t0)                   # 마디 머리 스탭
        if bar % 2 == 1:
            add(x, stab(note(tri[0]), 0.35, 0.5), t0 + BEAT * 3)
        # 큰북 패턴
        for b, g in ((0, 1.0), (1.5, 0.6), (2, 0.85), (3.5, 0.55)):
            add(x, kick(gain=g), t0 + b * BEAT)
        # 톰 롤 — 마디마다 다른 리듬
        pat = [0.5, 1.0, 1.75, 2.5, 3.0] if bar % 2 == 0 else [0.75, 1.25, 2.25, 2.75, 3.25]
        for i, b in enumerate(pat):
            add(x, tom(f0=200 + (i % 3) * 55, f1=110, gain=0.62, seed=400 + bar * 5 + i),
                t0 + b * BEAT)
        for i in range(16):                                          # 16분 셰이커
            add(x, shaker(gain=0.42 if i % 4 == 0 else 0.2, seed=500 + i), t0 + i * BEAT / 4)
    return chp(x, 62)


# ============================================================
# D) 성가풍 앰비언트 — 지속음 위주지만 **코드 진행이 뚜렷하고 고역이 있다.**
#    1차 버전의 "웅웅"과 무엇이 다른지 비교용으로 넣었다.
# ============================================================
def sample_d():
    x = np.zeros(N)
    for bar, (_, root, tri) in enumerate(CHORDS):
        t0 = bar * BAR
        for i, nm in enumerate(tri):                                 # 3화음 지속
            add(x, bowed(note(nm) * 2, BAR * 1.1, vib=3.2, bright=0.34) * (0.5 - i * 0.06),
                t0 + i * 0.03)
        add(x, bowed(note(root) * 2, BAR * 1.1, vib=2.6, bright=0.3) * 0.5, t0)
        add(x, kick(f0=95, f1=42, gain=0.55), t0)                    # 아주 약한 박
        # 고역 반짝임 — 이게 있어야 폰에서 '음악'으로 들린다
        for i, nm in enumerate(tri):
            add(x, bell(note(nm) * 2, 1.6, 0.4), t0 + BEAT * (0.5 + i))
    return chp(x, 62)


SAMPLES = [
    ('A_ostinato', '던전 오스티나토 (뜯는 현 + 킥, 추진력)', sample_a, 0.30),
    ('B_cello', '첼로 + 심장박동 (긴장·잠입)', sample_b, 0.30),
    ('C_tribal', '부족 타악 (액션·전투)', sample_c, 0.26),
    ('D_choir', '성가풍 앰비언트 (분위기)', sample_d, 0.34),
]

print(f'{LOOP:.0f}초 루프 · {BPM:.0f}BPM · Am-F-C-G ×2\n')
print(f'{"파일":<16}{"센트로이드":>10}{"800Hz+":>9}{"폰모사":>10}{"이음":>8}  성격')
print('-' * 78)

for name, desc, fn, wet in SAMPLES:
    mono = reverb(fn(), wet=wet)
    mono = mono / np.abs(mono).max() * 0.85
    # 아주 가벼운 좌우 폭 (딜레이 3ms) — 스테레오 느낌만
    Lc, Rc = mono, np.roll(mono, int(0.003 * SR)) * 0.92 + mono * 0.08
    Rc = Rc / np.abs(Rc).max() * 0.85

    st = np.empty(N * 2, dtype=np.int16)
    st[0::2] = np.clip(Lc, -1, 1) * 32767
    st[1::2] = np.clip(Rc, -1, 1) * 32767
    raw = TMP / f'_s_{name}.wav'
    with wave.open(str(raw), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(st.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw),
                    '-c:a', 'libvorbis', '-b:a', '80k',
                    str(OUT / f'bgm_{name}.ogg')], check=True)

    f, P = signal.welch(mono, SR, nperseg=8192)
    tot = P.sum()
    cent = (f * P).sum() / tot
    hi = 100 * P[(f >= 800)].sum() / tot
    sos = signal.butter(4, 400 / (SR / 2), 'high', output='sos')
    phone = 20 * np.log10(np.sqrt(np.mean(signal.sosfilt(sos, mono) ** 2)))
    d = np.abs(np.diff(mono))
    seam = abs(float(mono[0] - mono[-1]))
    okseam = '연속' if seam <= d[-500:].max() * 1.5 else '확인필요'
    kb = (OUT / f'bgm_{name}.ogg').stat().st_size / 1024
    print(f'{name:<16}{cent:>8.0f}Hz{hi:>8.1f}%{phone:>9.1f}dB{okseam:>8}  {desc}  ({kb:.0f}KB)')

print('\n※ 참고 — 1차 버전(웅웅거린 것): 센트로이드 92Hz / 800Hz+ 0.3% / 폰모사 -27.7dB')
