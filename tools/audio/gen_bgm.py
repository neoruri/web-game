"""배경음악 생성 — 어둡고 무거운 던전 앰비언트 루프.

⚠️ 이 스크립트는 **public/ 밖에** 있어야 한다.
   Vite 는 public/ 을 dist 로 통째 복사하므로, public/ 안에 생성 스크립트나
   중간 산출물(WAV·미리보기 PNG)을 두면 그게 전부 배포된다.
   (실측: public/ 8.83MB 중 게임이 실제 로드하는 건 1.0MB뿐이었다)
   → 산출물 ogg/m4a 만 public/audio/ 로 내보내고, 중간물은 임시 폴더에 둔다.

설계 의도
  · 게임 컨셉(어두운 석재 던전, 후드 궁수)에 맞춰 낮고 탁한 음색이 기본
  · 멜로디를 거의 쓰지 않는다 — 뱀서류는 한 판이 길고 곡이 계속 반복되므로
    선율이 뚜렷하면 금방 질린다. 드론 + 심장박동 + 공간감이 주역
  · **모바일 대응**: 폰 스피커는 300Hz 이하를 거의 못 낸다. 서브/저역만 깔면
    모바일에서 "무음"처럼 들린다 → 중역(300~1700Hz)에 얇은 층을 반드시 넣는다.
    피크 정규화가 55Hz 서브에 잡히므로 서브를 크게 두면 나머지가 다 작아진다.
  · **완전 심리스 루프** — 아래 3가지를 모두 지켜야 이어진다:
      ① 모든 주파수를 1/LOOP(=0.03125Hz) 격자에 스냅  → 사인이 정확히 정수 주기
      ② 필터를 **원형(circular)** 으로 적용            → 필터 상태가 경계에서 연속
      ③ 리버브를 **원형 컨볼루션**으로                  → 잔향이 앞으로 자동 wrap
    셋 중 하나라도 빠지면 경계에 미세한 클릭이 남는다(실측으로 확인했다).

실행: python3 tools/audio/gen_bgm.py     (numpy, scipy, ffmpeg 필요)
출력: public/audio/bgm_dungeon.ogg  (+ .m4a 폴백)
"""
import pathlib
import subprocess
import tempfile
import wave

import numpy as np
from scipy import signal

HERE = pathlib.Path(__file__).resolve().parent
OUT_DIR = HERE.parent.parent / 'public' / 'audio'      # 산출물만 public 으로
OUT_DIR.mkdir(parents=True, exist_ok=True)
TMP = pathlib.Path(tempfile.gettempdir())              # 중간물은 임시 폴더

SR = 44100
LOOP = 32.0                      # 루프 길이(초)
N = int(SR * LOOP)
t = np.arange(N) / SR
GRID = 1.0 / LOOP                # 0.03125 Hz — 모든 주파수를 이 배수로 맞춘다
rng = np.random.default_rng(7)


def q(f):
    """주파수를 루프 격자에 스냅. 오차 최대 0.016Hz로 음정 차이는 안 들린다."""
    return round(f / GRID) * GRID


# --- 음정 (A 마이너) — 전부 격자에 스냅 ---
A1, A2, C3, E3, A3 = q(55.0), q(110.0), q(130.81), q(164.81), q(220.0)


def _resp(b, a):
    _, H = signal.freqz(b, a, worN=N // 2 + 1)
    return H


def clp(x, cut, order=4):
    """원형 로우패스 — 결과가 길이 N 의 주기함수가 되어 루프가 정확히 이어진다."""
    b, a = signal.butter(order, cut / (SR / 2), 'low')
    return np.fft.irfft(np.fft.rfft(x) * _resp(b, a), n=N)


def chp(x, cut, order=2):
    b, a = signal.butter(order, cut / (SR / 2), 'high')
    return np.fft.irfft(np.fft.rfft(x) * _resp(b, a), n=N)


def cbp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(0.99, hi / (SR / 2))], 'band')
    return np.fft.irfft(np.fft.rfft(x) * _resp(b, a), n=N)


def lfo(freq, phase=0.0):
    """freq 는 GRID 의 정수배여야 한다."""
    return np.sin(2 * np.pi * q(freq) * t + phase)


# ============================================================
# 1) 서브 드론 — 곡의 바닥. 55Hz + 5도 + 미세 디튠(맥놀이로 살아있게)
#    헤드폰/PC에서 "무게"를 만든다. 폰에서는 거의 안 들리는 게 정상.
# ============================================================
drone = np.zeros(N)
for f, amp, det in ((A1, 1.00, q(0.125)), (q(A1 * 1.5), 0.45, q(0.15625)),
                    (A2, 0.55, q(0.09375))):
    drone += amp * np.sin(2 * np.pi * q(f + det) * t)
    drone += amp * 0.7 * np.sin(2 * np.pi * q(f - det) * t + 1.1)
drone *= 0.55 + 0.45 * (0.5 + 0.5 * lfo(1 / 8.0))     # 8초 숨쉬기 = 루프에 4회
drone = clp(drone, 220)

# ============================================================
# 2) 로우 패드 — 마이너 3화음. 톱니를 깎아 '먼 오르간'
# ============================================================
pad = np.zeros(N)
for f, amp in ((A2, 0.9), (C3, 0.55), (E3, 0.5), (A3, 0.28)):
    ph = rng.uniform(0, 2 * np.pi)
    for k in range(1, 7):                              # 배음 6개까지만
        pad += (amp / k) * np.sin(2 * np.pi * q(f * k) * t + ph * k) * (0.9 ** k)
pad = clp(pad, 520)
pad *= 0.30 + 0.32 * (0.5 + 0.5 * lfo(1 / 16.0, -0.6))  # 16초 스웰 = 루프에 2회

# ============================================================
# 3) 중역 패드 — **모바일 스피커에서 실제로 들리는 층**
#    레벨을 낮게 유지해 어두운 성격은 지킨다. "노래"가 아니라 "공기"로 들리게.
# ============================================================
midpad = np.zeros(N)
for f, amp in ((A3, 0.7), (q(C3 * 2), 0.42), (q(E3 * 2), 0.38)):
    ph = rng.uniform(0, 2 * np.pi)
    midpad += amp * np.sin(2 * np.pi * f * t + ph)
    midpad += amp * 0.30 * np.sin(2 * np.pi * q(f * 2) * t + ph * 1.7)
    midpad += amp * 0.50 * np.sin(2 * np.pi * q(f + 0.3125) * t + ph)   # 디튠
midpad = clp(chp(midpad, 260), 1700)
midpad *= 0.16 + 0.14 * (0.5 + 0.5 * lfo(1 / 16.0, 1.9)) * (0.5 + 0.5 * lfo(3 / 32.0))

# ============================================================
# 4) 삐걱임/긁힘 — 중역 던전 질감. 폰에서도 확실히 들리는 층.
#    루프 경계를 넘지 않는 구간에만 배치한다.
# ============================================================
creak = np.zeros(N)
for at, dur_s, lo, hi, gain in ((2.2, 1.1, 380, 900, 0.5), (11.3, 1.4, 420, 1100, 0.42),
                                (18.1, 0.9, 500, 1300, 0.46), (26.4, 1.5, 340, 820, 0.38)):
    s0, d = int(at * SR), int(dur_s * SR)
    nz = np.zeros(N)
    nz[s0:s0 + d] = np.random.default_rng(int(at * 100)).normal(0, 1, d)
    env = np.zeros(N)
    env[s0:s0 + d] = np.sin(np.linspace(0, np.pi, d)) ** 1.6
    creak += cbp(nz, lo, hi) * env * gain * 0.06

# ============================================================
# 5) 심장박동 — 2초마다 낮은 쿵쿵. 유일한 리듬 요소.
#    드럼 대신 심장박동을 쓰면 '전투'보다 '잠입/긴장' 쪽으로 읽힌다.
#    중역 어택을 함께 넣어 폰 스피커에서도 박동이 들리게 한다.
# ============================================================
beat_lo = np.zeros(N)
beat_mid = np.zeros(N)
PERIOD = 2.0                                           # 32초에 16회 → 루프 정합
for i in range(int(LOOP / PERIOD)):
    for off, gain in ((0.0, 1.0), (0.28, 0.52)):       # 쿵-쿵 2연타
        s = int((i * PERIOD + off) * SR)
        dur = int(0.42 * SR)
        env = np.exp(-np.linspace(0, 9, dur))
        f0 = np.linspace(58, 38, dur)                  # 피치 하강 = 타격감
        beat_lo[s:s + dur] += np.sin(2 * np.pi * np.cumsum(f0) / SR) * env * gain
        beat_lo[s:s + dur] += rng.normal(0, 1, dur) * np.exp(-np.linspace(0, 40, dur)) * 0.22 * gain
        beat_mid[s:s + dur] += rng.normal(0, 1, dur) * np.exp(-np.linspace(0, 55, dur)) * 0.30 * gain
beat = clp(beat_lo, 190) * 0.85 + cbp(beat_mid, 300, 1200) * 0.85

# ============================================================
# 6) 공기/바람 — 공간이 비어 보이지 않게 채운다. 중역까지 올려 폰 대응.
# ============================================================
def air(seed):
    x = np.random.default_rng(seed).normal(0, 1, N)
    x = clp(chp(x, 320), 3600)
    x *= 0.5 + 0.5 * (0.5 + 0.5 * lfo(1 / 32.0)) * (0.5 + 0.5 * lfo(3 / 32.0, 2.0))
    return x * 0.10


# ============================================================
# 7) 먼 금속 타격 — 아주 드물게. "사람이 없는 곳"이라는 신호.
#    비배음 부분음을 써야 종·금속으로 들린다(정수배는 악기처럼 들려 부적합).
# ============================================================
hits = np.zeros(N)
for at, gain, base in ((6.5, 0.5, 196.0), (14.0, 0.34, 261.6), (22.5, 0.44, 174.6)):
    s, dur = int(at * SR), int(2.6 * SR)
    env = np.exp(-np.linspace(0, 7, dur))
    bell = np.zeros(dur)
    for mul, a in ((1.0, 1.0), (2.76, 0.42), (5.40, 0.22), (8.93, 0.11)):
        bell += a * np.sin(2 * np.pi * base * mul * np.arange(dur) / SR)
    hits[s:s + dur] += bell * env * gain * 0.42
hits = clp(hits, 3200)

# ============================================================
# 8) 리버브 — 합성 IR 을 **원형 컨볼루션**. 잔향이 루프 앞으로 자동 wrap 된다.
# ============================================================
def make_ir(seconds=2.8, seed=3, cut=2200):
    n = int(seconds * SR)
    ir = np.random.default_rng(seed).normal(0, 1, n) * np.exp(-np.linspace(0, 6.5, n))
    b, a = signal.butter(4, cut / (SR / 2), 'low')
    ir = signal.lfilter(b, a, ir)
    ir = np.concatenate([np.zeros(int(0.03 * SR)), ir])   # 프리딜레이 → 공간이 커 보인다
    return ir / np.abs(ir).sum() * 0.9


IR_PAD = np.zeros(N)
_ir = make_ir()
IR_PAD[:len(_ir)] = _ir
IR_SPEC = np.fft.rfft(IR_PAD)


def creverb(x, wet):
    y = np.fft.irfft(np.fft.rfft(x) * IR_SPEC, n=N)       # 원형 = 꼬리가 앞으로 감김
    return x * (1 - wet) + y * wet


# --- 레이어 게인: **핵심 밸런스** ---
# 피크 정규화는 55Hz 서브가 결정한다. 서브를 크게 두면 나머지 전부가 같이 작아져
# 폰 스피커에서 무음처럼 들린다(실측 -34dBFS). 서브는 느낌만, 중역은 확실히.
G_DRONE, G_PAD, G_MID, G_CREAK, G_BEAT, G_AIR, G_HIT = 0.42, 0.85, 2.6, 2.3, 0.95, 1.7, 1.5


def channel(seed, hit_gain):
    x = (drone * G_DRONE + pad * G_PAD + midpad * G_MID + creak * G_CREAK
         + beat * G_BEAT + air(seed) * G_AIR + hits * hit_gain * G_HIT)
    return creverb(x, 0.34)


L = channel(11, 1.00)
R = channel(23, 0.72)            # 금속 타격을 좌우 비대칭으로 → 공간감

# --- 마스터링 ---
L, R = chp(L, 28), chp(R, 28)    # 28Hz 이하는 안 들리고 헤드룸만 먹는다


def tilt(x):
    """완만한 로우셸프 감쇠 — 120Hz 이하를 약 4dB 낮춰 중역 헤드룸을 확보한다."""
    b, a = signal.butter(2, 120 / (SR / 2), 'low')
    low = np.fft.irfft(np.fft.rfft(x) * _resp(b, a), n=N)
    return x - low * 0.37


L, R = tilt(L), tilt(R)
mx = max(np.abs(L).max(), np.abs(R).max())
PEAK = 0.72                      # 배경음악이라 여유를 크게 (효과음 자리 확보)
L, R = L / mx * PEAK, R / mx * PEAK

stereo = np.empty(N * 2, dtype=np.int16)
stereo[0::2] = np.clip(L, -1, 1) * 32767
stereo[1::2] = np.clip(R, -1, 1) * 32767

raw_path = TMP / '_bgm_raw.wav'
with wave.open(str(raw_path), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(stereo.tobytes())

# OGG Vorbis — 앰비언트는 저비트레이트에서 잘 버틴다(용량 = 로딩 시간)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw_path),
                '-c:a', 'libvorbis', '-b:a', '64k',
                str(OUT_DIR / 'bgm_dungeon.ogg')], check=True)
# 폴백 (ogg 미지원 브라우저 — 구형 사파리 등)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw_path),
                '-c:a', 'aac', '-b:a', '64k',
                str(OUT_DIR / 'bgm_dungeon.m4a')], check=True)

# --- 검증 수치 ---
mono = (L + R) / 2
d = np.abs(np.diff(mono))
seam = float(mono[0] - mono[-1])
before = float(mono[-1] - mono[-2])
f, P = signal.welch(mono, SR, nperseg=8192)
tot = P.sum()
band = lambda lo, hi: 100 * P[(f >= lo) & (f < hi)].sum() / tot          # noqa: E731
sos = signal.butter(4, 400 / (SR / 2), 'high', output='sos')
phone = 20 * np.log10(np.sqrt(np.mean(signal.sosfilt(sos, mono) ** 2)))

print(f'길이 {LOOP:.0f}s  피크 {max(np.abs(L).max(), np.abs(R).max()):.3f}  '
      f'RMS {20 * np.log10(np.sqrt(np.mean(mono ** 2))):.1f} dBFS')
print(f'대역: 20-80 {band(20, 80):.0f}% / 80-300 {band(80, 300):.0f}% / '
      f'300-800 {band(300, 800):.0f}% / 800+ {band(800, 20000):.1f}%')
print(f'폰 스피커 모사(400Hz HPF) {phone:.1f} dBFS  (-40 이하면 안 들림)')
print(f'루프 이음부 점프 {seam:+.6f} / 경계 직전 기울기 {before:+.6f} '
      f'→ {"연속" if abs(seam) <= d[-500:].max() * 1.5 else "불연속 의심"}')
print(f'출력: {OUT_DIR / "bgm_dungeon.ogg"}')
