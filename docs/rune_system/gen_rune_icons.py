"""MVP 룬 5종 아이콘 (framed game icons). 128x128 PNG + 시트."""
import numpy as np, math
from PIL import Image, ImageDraw, ImageFilter

SZ = 128
def frame(accent):
    im = Image.new('RGBA', (SZ, SZ), (0,0,0,0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([4,4,SZ-4,SZ-4], 22, fill=(20,27,36,255), outline=(42,55,70,255), width=3)
    d.rounded_rectangle([4,4,SZ-4,SZ-4], 22, outline=accent+(180,), width=2)
    # top sheen
    sh = Image.new('RGBA',(SZ,SZ),(0,0,0,0)); ds=ImageDraw.Draw(sh)
    ds.rounded_rectangle([10,9,SZ-10,SZ//2], 16, fill=(255,255,255,16))
    return Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(4)))

def glow(sym, color, amt=160):
    a = sym.split()[3].filter(ImageFilter.GaussianBlur(6))
    g = Image.new('RGBA', (SZ,SZ), color+(0,)); g.putalpha(a.point(lambda p:min(amt,int(p*1.3))))
    return g

def compose(accent, drawsym):
    base = frame(accent)
    sym = Image.new('RGBA',(SZ,SZ),(0,0,0,0)); drawsym(ImageDraw.Draw(sym))
    out = Image.alpha_composite(base, glow(sym, accent))
    return Image.alpha_composite(out, sym)

C = SZ/2
def burn(d):
    col=(240,150,60); dk=(200,90,30)
    pts=[(64,26),(84,58),(80,84),(64,102),(48,84),(44,58)]
    # flame body
    d.polygon([(64,24),(86,64),(78,92),(64,104),(50,92),(42,64)], fill=dk)
    d.polygon([(64,40),(78,68),(72,90),(64,100),(56,90),(50,68)], fill=col)
    d.polygon([(64,58),(71,76),(64,92),(57,76)], fill=(255,225,150))
def pierce(d):
    col=(90,180,235)
    d.ellipse([44,44,84,84], outline=col, width=5)          # target
    d.line([(20,64),(108,64)], fill=(220,240,255), width=7) # shaft
    d.polygon([(108,64),(90,52),(90,76)], fill=(220,240,255))# head
    d.polygon([(20,64),(34,56),(34,72)], fill=col)          # fletch
def multishot(d):
    col=(90,220,205)
    for ang in (-28,0,28):
        a=math.radians(ang); ex=64+56*math.cos(a); ey=64+56*math.sin(a)
        sx=40; sy=64
        d.line([(sx,sy),(ex,ey)], fill=col, width=5)
        # head
        hx=ex; hy=ey; d.polygon([(hx,hy),(hx-12*math.cos(a)-6*math.sin(a),hy-12*math.sin(a)+6*math.cos(a)),
                                  (hx-12*math.cos(a)+6*math.sin(a),hy-12*math.sin(a)-6*math.cos(a))], fill=(220,255,250))
def damage(d):
    col=(232,120,80); gold=(231,193,90)
    # bold upward chevrons + plus
    for i,y in enumerate((92,72,52)):
        c=[gold,col,(255,220,120)][i]
        d.line([(40,y),(64,y-22)], fill=c, width=8)
        d.line([(64,y-22),(88,y)], fill=c, width=8)
def cooldown(d):
    col=(120,210,190)
    d.arc([34,34,94,94], 300, 210, fill=col, width=7)       # clock ring w/ gap
    d.line([(64,64),(64,40)], fill=(230,255,248), width=5)  # hand
    d.line([(64,64),(82,72)], fill=(230,255,248), width=5)
    # curved arrow head near gap
    d.polygon([(92,58),(80,52),(86,68)], fill=col)

specs=[('burn','화상',(240,150,60),burn),
       ('pierce','관통',(90,180,235),pierce),
       ('multishot','발사체',(90,220,205),multishot),
       ('damage','데미지',(232,120,80),damage),
       ('cooldown','쿨감',(120,210,190),cooldown)]

imgs=[]
for rid,name,acc,fn in specs:
    im=compose(acc,fn); im.save(f'icon_{rid}.png'); imgs.append(im)

# sheet (dark bg) with labels
pad=18; cell=SZ+pad
sheet=Image.new('RGBA',(cell*len(imgs)+pad, SZ+56+pad),(14,18,24,255))
d=ImageDraw.Draw(sheet)
for i,(im,(rid,name,acc,fn)) in enumerate(zip(imgs,specs)):
    x=pad+i*cell; sheet.alpha_composite(im,(x,pad))
    d.text((x+SZ//2-18,SZ+pad+8),name,fill=(210,220,230))
sheet.convert('RGB').save('_rune_icons_sheet.png')
print('done', [s[0] for s in specs])
