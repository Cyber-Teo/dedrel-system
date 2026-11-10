"""python3 fill-overlay.py <geojson> <out.png> [x0 y0 x1 y1 scale] — полупрозрачная заливка по id + контур + подписи."""
import sys, json, colorsys, hashlib
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
def col(i):
    h = (int(hashlib.md5(i.encode()).hexdigest()[:8], 16) % 997) * 0.61803398875 % 1
    r, g, b = colorsys.hsv_to_rgb(h, .85, 1); return int(r*255), int(g*255), int(b*255)
def main(geo, out, box=(0, 0, 7920, 5960), sc=0.25, labels=True):
    x0, y0, x1, y1 = box
    im = Image.open('data/raw/media/dedrel_optimized.webp').convert('RGB').crop(box).resize((int((x1-x0)*sc), int((y1-y0)*sc))).convert('RGBA')
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
    for ft in json.load(open(geo))['features']:
        c = col(ft['properties']['id']); g = ft['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        big = (0, 0, 0)
        for p in polys:
            pts = [((x-x0)*sc, (y-y0)*sc) for x, y in p[0]]
            d.polygon(pts, fill=c + (110,))
            for r in p[1:]: d.polygon([((x-x0)*sc, (y-y0)*sc) for x, y in r], fill=(0, 0, 0, 0))
        for p in polys:
            for r in p: d.line([((x-x0)*sc, (y-y0)*sc) for x, y in r], fill=c + (255,), width=2)
        cap = ft['properties'].get('capital_px') or ft['properties'].get('center_px')
        if cap: 
            px, py = (cap[0]-x0)*sc, (cap[1]-y0)*sc; d.ellipse([px-4, py-4, px+4, py+4], outline=(255, 255, 255, 255), fill=(0, 0, 0, 255))
        if labels:
            pts = max(polys, key=lambda p: len(p[0]))[0]; cx = sum(x for x, y in pts)/len(pts); cy = sum(y for x, y in pts)/len(pts)
            d.text(((cx-x0)*sc-30, (cy-y0)*sc), ft['properties']['name'][:22], fill=(255, 255, 255, 255), font=f, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    Image.alpha_composite(im, ov).convert('RGB').save(out)
if __name__ == '__main__':
    a = sys.argv
    if len(a) > 3: main(a[1], a[2], tuple(map(int, a[3:7])), float(a[7]))
    else: main(a[1], a[2])
