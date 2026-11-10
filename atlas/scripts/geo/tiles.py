"""Нарезка dedrel_optimized.webp в XYZ-пирамиду z0–6: public/tiles/{drawn,muted}/{z}/{x}/{y}.webp.
Карта (7920x5960) лежит в мировом квадрате меркатора с масштабом 2 px мира/px карты на z6,
смещение (256, 2240) на z6 — кратно 64, значит целое на всех z0–6. Держать в синхроне с src/geo/pixel.ts."""
import os, sys
from PIL import Image, ImageEnhance

SRC = 'data/raw/media/dedrel_optimized.webp'
OUT = 'public/tiles'
W, H, ZMAX, OX, OY, T = 7920, 5960, 6, 256, 2240, 256

def muted(im):
    im = ImageEnhance.Color(im).enhance(0.4)      # обесцвечено на ~60%
    return ImageEnhance.Brightness(im).enhance(1.12)  # осветлено

def build(mode, src):
    n = 0
    for z in range(ZMAX + 1):
        k = 2 ** (z - ZMAX)                        # доля от z6
        w, h = round(W * 2 * k), round(H * 2 * k)
        ox, oy = int(OX * k), int(OY * k)
        im = src.resize((w, h), Image.LANCZOS)
        for tx in range(ox // T, (ox + w - 1) // T + 1):
            for ty in range(oy // T, (oy + h - 1) // T + 1):
                tile = Image.new('RGBA', (T, T), (0, 0, 0, 0))
                x0, y0 = tx * T - ox, ty * T - oy
                box = (max(x0, 0), max(y0, 0), min(x0 + T, w), min(y0 + T, h))
                tile.paste(im.crop(box), (box[0] - x0, box[1] - y0))
                d = f'{OUT}/{mode}/{z}/{tx}'
                os.makedirs(d, exist_ok=True)
                tile.save(f'{d}/{ty}.webp', quality=85, method=4)
                n += 1
    print(mode, n, 'тайлов')

if __name__ == '__main__':
    base = Image.open(SRC).convert('RGB')
    assert base.size == (W, H), base.size
    build('drawn', base)
    build('muted', muted(base))
