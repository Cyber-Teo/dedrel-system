"""20 контрольных точек берега: отклонение вершины полигона от перехода вода/суша на растре ПОЛНОГО разрешения
(без медианы и уменьшения) вдоль нормали, окно ±40 px. Вывод — markdown-таблица."""
import json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
from scipy import ndimage as ndi
a = np.asarray(Image.open('data/raw/media/dedrel_optimized.webp').convert('RGB')).astype(np.int16)
w = (a[..., 2] > a[..., 0] + 30) & (a[..., 2] > a[..., 1])
w = ndi.uniform_filter(w.astype(np.float32), 5) > 0.5
geo = json.load(open('data/geo/land.geojson'))['features']
big = sorted(geo, key=lambda f: -f['properties']['area_px2'])
pts = []
for f in big:
    ring = np.array(f['geometry']['coordinates'][0]); L = len(ring) - 1
    pts.append((f['properties']['id'], ring, L))
# 20 точек: распределяем по периметру (большие контуры получают больше), шаг по длине
tot = sum(L for _, _, L in pts[:12]); sel = []
for name, ring, L in pts[:12]:
    n = max(1, round(20 * L / tot))
    for i in np.linspace(L * 0.13, L * 0.93, n, endpoint=False).astype(int): sel.append((name, ring, int(i), L))
sel = sel[:20]
rows = []
for name, ring, i, L in sel:
    p = ring[i]; d = ring[(i + 3) % L] - ring[(i - 3) % L]; d /= np.hypot(*d) + 1e-9
    nrm = np.array([-d[1], d[0]])
    ts = np.arange(-40, 41)
    xs = np.clip((p[0] + nrm[0] * ts).round().astype(int), 0, 7919); ys = np.clip((p[1] + nrm[1] * ts).round().astype(int), 0, 5959)
    s = w[ys, xs]
    tr = [t for k, t in enumerate(ts[:-1]) if s[k] != s[k + 1]]
    dev = min(tr, key=abs) if tr else None
    rows.append((name, int(p[0]), int(p[1]), dev))
print('| # | контур | x | y | отклонение, px |\n|--:|---|--:|--:|--:|')
for k, (n, x, y, dv) in enumerate(rows, 1): print(f'| {k} | {n} | {x} | {y} | {"нет перехода в ±40" if dv is None else abs(dv)} |')
ok = [abs(r[3]) for r in rows if r[3] is not None]
print(f'\nточек {len(rows)}; с переходом {len(ok)}; макс {max(ok)} px; среднее {np.mean(ok):.1f} px; <=20 px: {sum(v<=20 for v in ok)}/{len(rows)}')
