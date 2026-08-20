// 스프라이트 계약 테스트 — "빈 시트 칸을 재생하고 있지 않은가"
//
// 왜 픽셀 검사가 아니라 이 방식인가:
//   화면 픽셀로 "캐릭터가 사라졌다"를 판정해보려고 실측했더니, 버그 상태 19.9% vs
//   정상 22.9% 로 차이가 3%p 뿐이었다. 연기 오라·활·적이 계속 그려지기 때문이다.
//   → 픽셀 휴리스틱은 이 사고를 못 잡는다. 그래서 **결정적인 계약**으로 검사한다:
//     게임이 등록한 애니메이션의 프레임 번호를 실제로 읽어와, 그 칸이 시트에서
//     투명한지 PNG 를 디코딩해 대조한다.
//
// 이 테스트가 잡는 실제 사고:
//   · 캐릭터가 위로 갈 때 투명해짐 (back_run 빈 행 재생) — 배포까지 나갔던 버그
//   · 사망 시 캐릭터 사라짐 (death 빈 행)
//   · 시트를 교체하면서 행이 밀렸을 때

import { test, expect } from '@playwright/test'
import { startGame } from './helpers.js'
import fs from 'node:fs'
import zlib from 'node:zlib'

/** PNG(8bit RGBA) 를 디코딩해 알파 채널을 읽을 수 있게 한다. */
function decodePng(buf) {
  const W = buf.readUInt32BE(16)
  const H = buf.readUInt32BE(20)
  const ch = buf[25] === 6 ? 4 : 3
  const idat = []
  let p = 8
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    if (type === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len))
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = W * ch
  const out = Buffer.alloc(H * stride)
  let rp = 0
  for (let y = 0; y < H; y++) {
    const ft = raw[rp++]
    const line = raw.slice(rp, rp + stride)
    rp += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 255
    }
  }
  return { W, H, ch, data: out }
}

/** 시트에서 (col,row) 칸에 실제로 그림이 있는지 (불투명 픽셀 수) */
function opaqueCount(png, col, row, cellW, cellH) {
  const { W, ch, data } = decodePng(png)
  if (ch !== 4) return Infinity // 알파 없는 시트는 검사 대상 아님
  const stride = W * ch
  let n = 0
  for (let y = row * cellH; y < (row + 1) * cellH; y++) {
    for (let x = col * cellW; x < (col + 1) * cellW; x++) {
      if (data[y * stride + x * ch + 3] > 16) n++
    }
  }
  return n
}

test('등록된 애니메이션이 빈 시트 칸을 가리키지 않는다', async ({ page }) => {
  await startGame(page, { playSeconds: 1 })

  // 게임이 실제로 등록한 애니 목록과 프레임 번호를 가져온다.
  // (소스를 파싱하면 실제 등록 결과와 어긋날 수 있어 런타임 값을 쓴다)
  const anims = await page.evaluate(() => {
    const g = window.__game
    if (!g) return null
    // Phaser 의 Structs.Map — each 는 (key, value) 를 넘긴다. entries 를 직접 훑는다.
    const out = []
    for (const [key, anim] of Object.entries(g.anims.anims.entries)) {
      if (!anim?.frames) continue
      out.push({ key, frames: anim.frames.map((f) => Number(f.frame.name)) })
    }
    return out
  })
  expect(anims, 'window.__game 이 없다 (dev 모드가 아닌가?)').not.toBeNull()
  expect(anims.length, '등록된 애니메이션이 없다').toBeGreaterThan(0)

  const sheet = fs.readFileSync(
    'public/sprites/dungeon/deliverables/player_spritesheet.png'
  )
  const CELL_W = 96
  const CELL_H = 116
  const COLS = 8

  const empty = []
  for (const a of anims) {
    for (const f of a.frames) {
      const col = f % COLS
      const row = Math.floor(f / COLS)
      const n = opaqueCount(sheet, col, row, CELL_W, CELL_H)
      if (n < 50) empty.push(`${a.key} frame ${f} (행${row} 열${col}) 불투명 ${n}px`)
    }
  }

  console.log(`   등록된 애니 ${anims.length}종: ${anims.map((a) => a.key).join(', ')}`)
  expect(
    empty,
    `빈 칸을 재생하는 애니가 있다 — 그 동작에서 캐릭터가 투명해진다:\n${empty.join('\n')}`
  ).toEqual([])
})

test('이동해도 캐릭터 애니가 유효한 칸을 가리킨다', async ({ page }) => {
  await startGame(page, { playSeconds: 1 })

  // 네 방향으로 실제로 움직여, 그때 재생되는 애니 키를 수집한다.
  // 과거 사고: 위로 갈 때만 back_run(빈 행)이 재생돼 캐릭터가 사라졌다.
  const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD']
  const played = new Set()
  for (const k of keys) {
    await page.keyboard.down(k)
    await page.waitForTimeout(600)
    const info = await page.evaluate(() => {
      const sc = window.__game?.scene?.scenes?.find((s) => s.playerSprite)
      if (!sc?.playerSprite) return null
      return {
        animKey: sc.animKey,
        frame: Number(sc.playerSprite.frame.name),
        visible: sc.playerSprite.visible,
        alpha: sc.playerSprite.alpha,
      }
    })
    await page.keyboard.up(k)
    expect(info, '플레이어 스프라이트를 못 찾았다').not.toBeNull()
    expect(info.visible, `${k} 이동 중 스프라이트가 숨겨졌다`).toBe(true)
    expect(info.alpha, `${k} 이동 중 스프라이트가 투명하다`).toBeGreaterThan(0)
    played.add(`${info.animKey}:${info.frame}`)
  }

  // 수집한 (애니,프레임)이 전부 그림이 있는 칸인지 확인
  const sheet = fs.readFileSync(
    'public/sprites/dungeon/deliverables/player_spritesheet.png'
  )
  const bad = []
  for (const entry of played) {
    const f = Number(entry.split(':')[1])
    const n = opaqueCount(sheet, f % 8, Math.floor(f / 8), 96, 116)
    if (n < 50) bad.push(`${entry} → 불투명 ${n}px`)
  }
  console.log(`   이동 중 재생된 애니: ${[...played].join(', ')}`)
  expect(bad, `이동 중 빈 칸이 그려진다:\n${bad.join('\n')}`).toEqual([])
})
