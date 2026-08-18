"""플레이어_애니메이션_요청문.md 의 요청 블록을 **붙여넣기 전용 txt 9개**로 쪼갠다.

파일 안에는 프롬프트만 넣는다(한국어 해설 없음) — 전체 선택 → 복사 → 붙여넣기가 되게.
무엇을 첨부하는지는 **파일명**에 담는다.

실행: python3 tools/split_requests.py
출력: docs/요청문/ 안에 9개 txt
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / '플레이어_애니메이션_요청문.md'
OUT = ROOT / 'docs' / '요청문'
OUT.mkdir(exist_ok=True)

# 요청번호 → 실행순서 파일명.
# ⚠️ 파일명은 **ASCII 만** 쓴다 — 한글 파일명이 전달 과정에서 깨졌다.
# 파일명 규칙:  <실행순서>_<저장할 스트립 이름>__attach_<첨부할 것>.txt
#   → 뒤쪽 스트립 이름이 그대로 player_strips/ 에 저장할 파일명이 된다.
MAP = {
    2: 'A1_run_a__attach_C3.txt',
    3: 'A2_run_b__attach_C3_and_A1result.txt',
    6: 'A3_attack__attach_C3.txt',
    7: 'A4_multishot__attach_C3.txt',
    8: 'A5_hit__attach_C3.txt',
    9: 'A6_death_a__attach_C3.txt',
    10: 'A7_death_b__attach_C3_and_A6result.txt',
    4: 'B1_backrun_a__attach_C3.txt',
    5: 'B2_backrun_b__attach_C3_and_B1result.txt',
}

text = SRC.read_text(encoding='utf-8')
# "# 요청 N — ..." 부터 다음 "# 요청" 또는 "## " 까지를 한 덩어리로
blocks = {}
for m in re.finditer(r'^# 요청 (\d+)[^\n]*\n(.*?)(?=^# 요청 |\Z)', text, re.S | re.M):
    n = int(m.group(1))
    body = m.group(2)
    codes = re.findall(r'```\n(.*?)```', body, re.S)
    if codes:
        blocks[n] = codes[0].rstrip() + '\n'

missing = [n for n in MAP if n not in blocks]
if missing:
    raise SystemExit(f'요청 블록을 못 찾음: {missing}')

# 첨부 안내 줄([...첨부])은 파일명으로 옮겼으므로 본문에서 제거한다
for n, fname in MAP.items():
    body = re.sub(r'^\[[^\]]*첨부[^\]]*\]\n+', '', blocks[n])
    (OUT / fname).write_text(body, encoding='utf-8')

print(f'{OUT} 에 {len(MAP)}개 생성\n')
for n, f in sorted(MAP.items(), key=lambda kv: kv[1]):
    lines = (OUT / f).read_text(encoding='utf-8')
    frames = re.search(r'FRAMES: (\d+)', lines)
    print(f'  {f:44} (요청 {n:>2}, {frames.group(1) if frames else "?"}프레임, '
          f'{len(lines)}자)')

# 검증 — 치환 잔여·금지사항 누락 확인
print()
bad = 0
for f in MAP.values():
    s = (OUT / f).read_text(encoding='utf-8')
    for cond, msg in [
        ('{{' not in s, '치환 슬롯 잔여'),
        ('#00FF00' in s, '초록 배경 지정 없음'),
        ('NO smoke' in s or 'NO aura' in s, '연기 금지 문구 없음'),
        ('#e05cff' in s, '발광색 지정 없음'),
        ('한글' not in s and not re.search(r'[가-힣]', s), '한국어 섞임'),
    ]:
        if not cond:
            print(f'  ❌ {f}: {msg}')
            bad += 1
print('검증 전부 통과' if not bad else f'⚠️ {bad}건 실패')
