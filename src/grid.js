// 균일 공간 분할(uniform spatial hash).
//
// 화살마다 모든 적을 검사하면 O(화살 × 적) 이다. 적 400 × 화살 20 = 8000회/프레임.
// 그리드를 쓰면 화살은 자기 주변 셀만 본다 — 보통 적 몇 마리로 줄어든다.
//
// 셀 배열은 매 프레임 재사용한다 (length = 0). 새 배열을 만들면 GC 가 돌면서
// 프레임이 튄다.

export class Grid {
  constructor(width, height, cellSize, margin = 64) {
    this.cell = cellSize
    this.margin = margin
    this.cols = Math.ceil((width + margin * 2) / cellSize)
    this.rows = Math.ceil((height + margin * 2) / cellSize)

    this.cells = new Array(this.cols * this.rows)
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = []
  }

  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0
  }

  cellX(x) {
    const c = Math.floor((x + this.margin) / this.cell)
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c
  }

  cellY(y) {
    const c = Math.floor((y + this.margin) / this.cell)
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c
  }

  insert(item) {
    this.cells[this.cellY(item.y) * this.cols + this.cellX(item.x)].push(item)
  }

  // (x, y) 반경 r 안에 있을 수 있는 후보를 out 에 채운다.
  // 정확한 거리 판정은 호출한 쪽에서 한다 (여기서 걸러주는 건 '가능성 있는 것'까지).
  query(x, y, r, out) {
    out.length = 0
    const x0 = this.cellX(x - r)
    const x1 = this.cellX(x + r)
    const y0 = this.cellY(y - r)
    const y1 = this.cellY(y + r)

    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells[row + cx]
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i])
      }
    }
    return out
  }
}
