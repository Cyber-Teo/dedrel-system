"""Уточнение ручных ломаных границ по цветной линии растра (dat-nz9.9): каждый отрезок между вершинами протягивается по маске линии
нужного цвета внутри коридора ±45 px. Результат — lines_refined.json (states_config подхватывает). Запуск: python3 scripts/geo/vectorize/refine.py"""
import json, sys, numpy as np, cv2
from PIL import Image
from shapely.geometry import LineString, Point
Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, 'scripts/vectorize')
import rivers as RV
K = RV.K
def masks(im):
    a = im.astype(np.int16); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b > 85) & (b - r > 30) & (r < 85) & (g < 95) & (b - g > 18)           # тёмно-синяя линия Дринрога
    dark = cv2.morphologyEx(((r < 45) & (g < 55) & (b < 45)).astype(np.uint8), cv2.MORPH_OPEN, np.ones((4, 4), np.uint8)) > 0  # чёрный контур Вышневодска
    yellow = (r > 90) & (g > 90) & (b < 75) & (np.abs(r - g) < 28) & (r - b > 55)                      # жёлтая граница империи
    pale = ((r > 175) & (g > 185) & (b > 185) & (np.abs(r - b) < 70)) | ((r > 55) & (g > 100) & (b > 180) & (b - r < 140) & (g - r < 70))  # светлая линия Драконов/Этеля (на суше белая, на воде светло-голубая)
    return dict(blue=blue, dark=dark, yellow=yellow, pale=pale)
# ключ линии -> цвет маски
PLAN = {'etel_drinrog': 'blue', 'vyshnevodsk': 'dark', 'dragons': 'pale', 'empire_oldforest': 'yellow'}
NEW = {'empire_oldforest': [[(6650,1175),(6760,1250),(6850,1330),(6860,1450),(6880,1560)]]}
def snap_pt(m, p, R=60):
    x, y = int(p[0]), int(p[1]); x0, y0 = max(x-R, 0), max(y-R, 0); w = m[y0:y+R, x0:x+R]; ys, xs = np.nonzero(w)
    if not len(xs): return p
    d = (xs + x0 - x)**2 + (ys + y0 - y)**2; i = int(np.argmin(d)); return (float(xs[i] + x0), float(ys[i] + y0))
def snap_line(cost, pts, m=None, pad=45):
    pts = [pts[0]] + [snap_pt(m, p) for p in pts[1:-1]] + [pts[-1]]
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        if np.hypot(b[0]-a[0], b[1]-a[1]) < 4: continue
        out += RV.path(cost, a, b, pad=pad)[1:]
    out[0], out[-1] = pts[0], pts[-1]
    return [tuple(map(float, p)) for p in LineString(out).simplify(2.5).coords]
def main():
    import states_config as C
    im = np.asarray(Image.open('data/raw/media/dedrel_optimized.webp').convert('RGB')); M = masks(im); del im
    lines = {k: [list(l) for l in v] for k, v in C.LINES.items() if k in PLAN}
    lines.update({k: [list(l) for l in v] for k, v in NEW.items()})
    res = {}; dt = {}
    for k, ls in lines.items():
        m = M[PLAN[k]]; dt[k] = cv2.distanceTransform((~m).astype(np.uint8), cv2.DIST_L2, 3) if False else None
        cost = np.where(cv2.resize(cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)), None, fx=K, fy=K, interpolation=cv2.INTER_NEAREST) > 0, 1.0, 9.0)
        res[k] = [snap_line(cost, l, m) for l in ls]
    json.dump({'refined': res, 'old': {k: v for k, v in lines.items()}}, open('scripts/geo/vectorize/lines_refined.json', 'w'))
    # маски для таблицы контрольных точек
    np.savez_compressed('/tmp/w3/masks.npz', **M)
    print({k: len(v) for k, v in res.items()})
if __name__ == '__main__': main()
