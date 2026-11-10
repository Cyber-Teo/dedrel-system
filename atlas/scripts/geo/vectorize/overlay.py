"""python3 overlay.py <geojson> <out.png> <x0> <y0> <x1> <y1> [scale]  — контуры поверх растра (px полной карты)."""
import sys, json
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
def draw(geo, out, box, scale=1.0, src='data/raw/media/dedrel_optimized.webp', width=2, color=(255, 0, 255)):
    x0, y0, x1, y1 = box
    im = Image.open(src).convert('RGB').crop(box)
    im = im.resize((int((x1-x0)*scale), int((y1-y0)*scale)))
    d = ImageDraw.Draw(im)
    for f in json.load(open(geo))['features']:
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for p in polys:
            for ring in p:
                d.line([((x-x0)*scale, (y-y0)*scale) for x, y in ring], fill=color, width=width)
    im.save(out)
if __name__ == '__main__':
    a = sys.argv
    draw(a[1], a[2], tuple(map(int, a[3:7])), float(a[7]) if len(a) > 7 else 1.0)
