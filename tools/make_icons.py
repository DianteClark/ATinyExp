"""Compose the app icon from the pack's sprites (64x64 native, upscaled with nearest-neighbour)."""
import os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'img')
OUT = os.path.join(ROOT, 'icons')
L = lambda n: Image.open(os.path.join(IMG, n + '.png')).convert('RGBA')
tilesA, leader, spider, muzzle, cursor, insignia = L('tilesA'), L('leader'), L('spider'), L('muzzle'), L('selcursor'), L('insignia')

def scale(im, k): return im.resize((im.width * k, im.height * k), Image.NEAREST)
def crop(im, x, y, w, h): return im.crop((x, y, x + w, y + h))

N = 64
base = Image.new('RGBA', (N, N), (11, 16, 48, 255))
# ground: pavement (top-left) meeting dark badlands, like the mission map
for ty in range(4):
    for tx in range(4):
        src = (0, 0) if (tx + ty) % 3 else (1, 0)
        t = crop(tilesA, src[0] * 16, src[1] * 16, 16, 16) if tx + ty < 4 else crop(tilesA, (tx % 2) * 16, 9 * 16, 16, 16)
        base.alpha_composite(t, (tx * 16, ty * 16))
# night vignette
vig = Image.new('RGBA', (N, N)); d = ImageDraw.Draw(vig)
for i in range(18):
    a = int(10 + i * 9)
    d.rectangle([i, i, N - 1 - i, N - 1 - i], outline=None)
mask = Image.new('L', (N, N), 0); md = ImageDraw.Draw(mask)
for r in range(32, 0, -1):
    md.ellipse([32 - r * 1.25, 30 - r * 1.25, 32 + r * 1.25, 30 + r * 1.25], fill=int(max(0, 200 - r * 6.5)))
dark = Image.new('RGBA', (N, N), (4, 6, 26, 255))
base = Image.composite(base, dark, mask)
# enemy spider, top-right, 2x, facing the hero, inside red target brackets
sp = scale(crop(spider, 0, 0, 16, 16), 2).transpose(Image.FLIP_LEFT_RIGHT)
base.alpha_composite(sp, (31, 3))
for i, (ox, oy) in enumerate([(29, 2), (55, 2), (29, 27), (55, 27)]):
    base.alpha_composite(crop(cursor, (1 * 4 + i) * 8, 0, 8, 8), (ox, oy))
# tracer from the gun to the spider
d = ImageDraw.Draw(base)
d.line([(43, 32), (46, 22)], fill=(255, 236, 160, 255))
d.line([(44, 32), (47, 22)], fill=(255, 190, 80, 160))
# hero: squad leader, idle frame, 3x, bottom-left
hero = scale(crop(leader, 0, 0, 16, 16), 3)
base.alpha_composite(hero, (-3, 21))
mz = scale(crop(muzzle, 8, 0, 8, 8), 2)
base.alpha_composite(mz, (34, 28))
base = base.convert('RGB')
os.makedirs(OUT, exist_ok=True)
for size in (512, 192, 180, 64):
    k = size // N if size % N == 0 else None
    im = scale(base, size // N) if size % N == 0 else base.resize((size, size), Image.NEAREST)
    im.save(os.path.join(OUT, f'icon-{size}.png'))
base.resize((32, 32), Image.NEAREST).save(os.path.join(OUT, 'favicon-32.png'))
base.save(os.path.join(ROOT, 'assets', 'img', 'logo.png'))  # 64x64, used on the title screen
print('icons written')
