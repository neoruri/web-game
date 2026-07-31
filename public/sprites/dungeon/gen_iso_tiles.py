"""Isometric dungeon flagstones (Under The Grave palette) + decal layer.
Reference (sampled): highlight(80,96,110) mid(48,57,67) low(31,37,45) grout(11,13,18)
=> dark, cool BLUE-gray (R<G<B). Stones are irregular: wobbly inset outlines,
cracks, wear blotches, corner chips, occasional split/broken tiles.
Outputs:
  tileset_iso_stone.png  - N diamond flagstone variants (alpha; grout shows through gaps)
  decals_iso.png         - overlay decals (crack / moss / puddle / rubble) to layer on top
"""
import numpy as np
from PIL import Image, ImageFilter

TW, TH = 128, 64
N = 16
rng = np.random.default_rng(9)

# dark cool blue-gray palette (luminance -> color)
ctrl_L = np.array([0.00, 0.18, 0.42, 0.70, 1.00])
ctrl_C = np.array([
    [11, 13, 18],     # grout / deep crack
    [28, 34, 42],     # shadow
    [46, 55, 66],     # mid
    [66, 78, 92],     # light
    [92, 108, 124],   # highlight
], float)

cx, cy = TW / 2, TH / 2
yy, xx = np.mgrid[0:TH, 0:TW].astype(float)
xd = (xx - cx) / (TW / 2)
yd = (yy - cy) / (TH / 2)
d = 1 - (np.abs(xd) + np.abs(yd))            # diamond metric: 1 center, 0 cell-edge
ang = np.arctan2(yd, xd)

def L_to_rgb(L):
    return np.stack([np.interp(L, ctrl_L, ctrl_C[:, c]) for c in range(3)], -1)

sheet = Image.new('RGBA', (TW * N, TH), (0, 0, 0, 0))

for k in range(N):
    # --- wobbly inset outline (irregular stone edge, leaves grout in gaps) ---
    ph = rng.uniform(0, 6.28, 4)
    wob = (0.030 * np.sin(2 * ang + ph[0]) + 0.024 * np.sin(3 * ang + ph[1])
           + 0.018 * np.sin(5 * ang + ph[2]) + 0.014 * np.sin(7 * ang + ph[3]))
    inset = 0.055 + wob                        # small inset -> tight stones, thin grout
    # occasional corner chip: extra bite out of one corner
    if rng.random() < 0.5:
        ca = rng.uniform(-3.14, 3.14)
        chip = np.exp(-((((ang - ca + 3.14) % 6.28) - 3.14) ** 2) / 0.12) * rng.uniform(0.08, 0.16)
        inset = inset + chip
    stone = d > inset
    hgt = np.clip((d - inset) / (0.55), 0, 1) ** 0.6      # dome height inside stone

    dome = np.array(Image.fromarray((hgt * 255).astype(np.uint8))
                    .filter(ImageFilter.GaussianBlur(1.1))) / 255.0
    L = 0.44 + 0.22 * dome                      # flatter faces
    gy, gx = np.gradient(dome)
    L += (gx + gy) * 1.4                        # top-left light
    rim = np.clip((0.08 - (d - inset)) / 0.08, 0, 1) * stone
    L -= rim * 0.5                              # dark bevel at stone rim

    # per-tile character
    dark = rng.random() < 0.20                  # damp / dark flagstone
    L += (-0.20 if dark else rng.uniform(-0.13, 0.13))

    # mottled wear: smooth low-freq blotches
    wr = rng.normal(0, 1, (TH, TW))
    wr = np.array(Image.fromarray(((wr - wr.min()) / np.ptp(wr) * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(6))) / 255.0
    L += (wr - 0.5) * 0.12

    # cracks
    for _ in range(rng.integers(1, 4)):
        x0 = rng.uniform(cx - 34, cx + 34); y0 = rng.uniform(cy - 16, cy + 16)
        a0 = rng.uniform(0, 6.28)
        for _ in range(rng.integers(10, 22)):
            x0 += np.cos(a0); y0 += np.sin(a0)
            ix, iy = int(x0), int(y0)
            if 0 <= ix < TW and 0 <= iy < TH and stone[iy, ix]:
                L[iy, ix] -= 0.22
                if 0 <= iy + 1 < TH: L[iy + 1, ix] += 0.06   # tiny lip
            a0 += rng.uniform(-0.5, 0.5)

    # occasional split: a dark seam cutting the tile into two stones
    if rng.random() < 0.3:
        m = rng.uniform(-1.2, 1.2)
        seam = np.abs(yd - m * xd) < 0.05
        L[seam & stone] -= 0.25

    L += rng.normal(0, 0.015, L.shape)
    L = np.clip(L, 0, 1)
    rgb = L_to_rgb(L)
    a = np.clip((d - inset + 0.04) / 0.04, 0, 1) * 255      # AA edge
    a[~stone] = np.clip((d[~stone] - inset[~stone] + 0.04) / 0.04, 0, 1) * 255
    a = np.clip(a, 0, 255)
    tile = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8), 'RGBA')
    tile = tile.filter(ImageFilter.SMOOTH)
    sheet.paste(tile, (k * TW, 0), tile)

sheet.save('/sessions/kind-laughing-dirac/mnt/outputs/tileset_iso_stone.png')

# ================= DECAL LAYER =================
DN = 8
DS = 64
decals = Image.new('RGBA', (DS * DN, DS), (0, 0, 0, 0))
yy2, xx2 = np.mgrid[0:DS, 0:DS].astype(float)
for k in range(DN):
    rgba = np.zeros((DS, DS, 4))
    kind = k % 4
    if kind == 0:   # crack network (dark)
        for _ in range(rng.integers(2, 4)):
            x0, y0 = rng.uniform(0, DS), rng.uniform(0, DS); a0 = rng.uniform(0, 6.28)
            for _ in range(rng.integers(20, 40)):
                x0 += np.cos(a0); y0 += np.sin(a0)
                ix, iy = int(x0) % DS, int(y0) % DS
                rgba[iy, ix, :3] = [8, 9, 12]; rgba[iy, ix, 3] = 200
                a0 += rng.uniform(-0.6, 0.6)
    elif kind == 1:  # moss patch (greenish, low alpha)
        cxp, cyp = rng.uniform(20, 44, 2); r = rng.uniform(14, 22)
        m = np.clip(1 - np.sqrt((xx2 - cxp) ** 2 + (yy2 - cyp) ** 2) / r, 0, 1) ** 1.5
        nz = rng.normal(0, 1, (DS, DS))
        nz = np.array(Image.fromarray(((nz - nz.min()) / np.ptp(nz) * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(2))) / 255.0
        m = m * (0.5 + 0.5 * nz)
        rgba[..., 0] = 48; rgba[..., 1] = 78; rgba[..., 2] = 46; rgba[..., 3] = m * 150
    elif kind == 2:  # damp puddle (dark, subtle blue sheen)
        cxp, cyp = rng.uniform(22, 42, 2); r = rng.uniform(12, 20)
        m = np.clip(1 - np.sqrt((xx2 - cxp) ** 2 + ((yy2 - cyp) * 1.7) ** 2) / r, 0, 1) ** 1.4
        rgba[..., 0] = 14; rgba[..., 1] = 20; rgba[..., 2] = 30; rgba[..., 3] = m * 150
    else:            # rubble / pebbles
        for _ in range(rng.integers(6, 12)):
            px, py = rng.uniform(8, DS - 8, 2); rr = rng.uniform(1.5, 3.5)
            mm = (np.sqrt((xx2 - px) ** 2 + (yy2 - py) ** 2) < rr)
            sh = rng.uniform(30, 70)
            for c, val in enumerate([sh * 0.8, sh * 0.9, sh]):
                rgba[..., c][mm] = val
            rgba[..., 3][mm] = 220
    decals.paste(Image.fromarray(rgba.astype(np.uint8), 'RGBA'), (k * DS, 0))
decals.save('/sessions/kind-laughing-dirac/mnt/outputs/decals_iso.png')

# ---- preview assembled floor + decals ----
PW, PH = 660, 430
prev = Image.new('RGBA', (PW, PH), (10, 12, 16, 255))
tiles = [sheet.crop((k * TW, 0, k * TW + TW, TH)) for k in range(N)]
dtiles = [decals.crop((k * DS, 0, k * DS + DS, DS)) for k in range(DN)]
def hsh(c, r): return ((c * 73856093) ^ (r * 19349663)) & 0xffffffff
for r in range(-2, 20):
    for c in range(-2, 14):
        sx = int((c - r) * (TW / 2) + PW / 2 - TW / 2)
        sy = int((c + r) * (TH / 2) - 50)
        if sx < -TW or sx > PW or sy < -TH or sy > PH: continue
        hv = hsh(c, r); tl = tiles[hv % N]
        if (hv >> 8) & 1: tl = tl.transpose(Image.FLIP_LEFT_RIGHT)
        prev.paste(tl, (sx, sy), tl)
        if hv % 5 == 0:                       # sparse decals on top
            dt = dtiles[(hv >> 12) % DN]
            prev.alpha_composite(dt, (sx + 32, sy))
prev.convert('RGB').save('/sessions/kind-laughing-dirac/mnt/outputs/_iso_preview.png')
print('done tiles', sheet.size, 'decals', decals.size)
