"""Маркерный водораздел по маске суши и карте барьеров: общая функция для states и regions."""
import numpy as np, cv2
from scipy import ndimage as ndi
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
K = 0.5

def snap(land, pt):
    x, y = int(pt[0]*K), int(pt[1]*K)
    x = min(max(x, 0), land.shape[1]-1); y = min(max(y, 0), land.shape[0]-1)
    if land[y, x]: return x, y
    idx = ndi.distance_transform_edt(~land, return_distances=False, return_indices=True)
    return int(idx[1][y, x]), int(idx[0][y, x])

def flood(land, bar, seeds, ring_override=None, allowed=None):
    """seeds: {label:int -> [pts]}; ring_override: [(label, shapely Polygon px)] — компоненты без сидов внутри кольца -> label.
    allowed: bool-маска, где вообще идёт заливка (по умолчанию вся суша)."""
    area = land if allowed is None else (land & allowed)
    markers = np.zeros(land.shape, np.int32); seedpts = []
    for lab, pts in seeds.items():
        for p in pts:
            x, y = snap(area, p); markers[y, x] = lab; seedpts.append((x, y, lab))
    comp, n = ndi.label(area)
    have = set(comp[markers > 0].tolist())
    sp = np.array([(x, y) for x, y, _ in seedpts]); sl = [l for *_, l in seedpts]
    for c in range(1, n+1):
        if c in have: continue
        ys, xs = np.nonzero(comp == c)
        if len(xs) < 5: continue
        cx, cy = xs.mean(), ys.mean(); lab = None
        for l, poly in (ring_override or []):
            if poly.contains(Point(cx/K, cy/K)): lab = l
        if lab is None: lab = sl[int(np.argmin(((sp - [cx, cy])**2).sum(1)))]
        i = len(xs)//2; markers[ys[i], xs[i]] = lab
    out = dijkstra(area, bar, markers)
    return out

def dijkstra(area, bar, markers, wall=60, f=2):
    """Мульти-источниковая заливка; шаг по суше = 1, шаг через пиксель линии = wall. Считается на сетке x0.25 (f=2), потом nearest-вверх."""
    import heapq
    H, W = area.shape; h, w = H//f, W//f
    ar = area[:h*f, :w*f].reshape(h, f, w, f).any((1, 3)); br = bar[:h*f, :w*f].reshape(h, f, w, f).any((1, 3))
    lab = np.zeros((h, w), np.int32)
    dist = np.full((h, w), np.inf, np.float32)
    pq = []
    for y, x in zip(*np.nonzero(markers)):
        yy, xx = min(y//f, h-1), min(x//f, w-1)
        lab[yy, xx] = markers[y, x]; dist[yy, xx] = 0; pq.append((0.0, yy, xx))
    heapq.heapify(pq)
    ar_l = ar.tolist(); br_l = br.tolist(); dl = dist.tolist(); ll = lab.tolist()
    push, pop = heapq.heappush, heapq.heappop
    while pq:
        d, y, x = pop(pq)
        if d > dl[y][x]: continue
        l = ll[y][x]
        for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= ny < h and 0 <= nx < w and ar_l[ny][nx]:
                nd = d + (wall if br_l[ny][nx] else 1)
                if nd < dl[ny][nx]:
                    dl[ny][nx] = nd; ll[ny][nx] = l; push(pq, (nd, ny, nx))
    lab = np.array(ll, np.int32)
    out = np.zeros(area.shape, np.int32)
    up = np.kron(lab, np.ones((f, f), np.int32))
    out[:h*f, :w*f] = up
    out[~area] = 0
    # пиксели, не достигнутые на грубой сетке (края) — ближайшая метка
    miss = area & (out == 0)
    if miss.any():
        idx = ndi.distance_transform_edt(out == 0, return_distances=False, return_indices=True)
        out = np.where(miss, out[idx[0], idx[1]], out)
    return out

def label_polys(lab_img, labels, eps=3.0, minarea=900):
    res = {}
    for l in labels:
        m = (lab_img == l).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        cs, h = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if not cs: res[l] = None; continue
        h = h[0]; polys = []
        for i, c in enumerate(cs):
            if h[i][3] != -1: continue
            r = cv2.approxPolyDP(c, eps*K, True)[:, 0, :] / K
            if len(r) < 4: continue
            holes = []; j = h[i][2]
            while j != -1:
                hr = cv2.approxPolyDP(cs[j], eps*K, True)[:, 0, :] / K
                if len(hr) >= 4: holes.append(hr)
                j = h[j][0]
            p = Polygon(r, holes).buffer(0)
            if p.area >= minarea: polys.append(p)
        res[l] = unary_union(polys) if polys else None
    return res

def to_geojson(feats):
    return {'type': 'FeatureCollection', 'crs_note': 'px полной карты 7920x5960, x слева, y сверху', 'features': feats}

def ring_list(g):
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    out = []
    for p in polys:
        if p.is_empty or p.geom_type != 'Polygon': continue
        rings = [p.exterior.coords] + [i.coords for i in p.interiors]
        out.append([[[round(x, 1), round(y, 1)] for x, y in r] for r in rings])
    return out
