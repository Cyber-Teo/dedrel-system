"""data/geo/rivers.geojson: реки как LineString от истока к устью. Запуск: python3 scripts/geo/vectorize/rivers.py"""
import json, sys, heapq, numpy as np, cv2
from PIL import Image
from shapely.geometry import LineString
Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, 'scripts/vectorize')
import river_mask as RM
from rivers_config import RIVERS
K = 0.5

def cost_map():
    im = np.asarray(Image.open('data/raw/media/dedrel_optimized.webp').convert('RGB'))
    m = cv2.dilate(RM.mask(im), np.ones((3, 3), np.uint8))
    m = cv2.resize(m, None, fx=K, fy=K, interpolation=cv2.INTER_AREA if False else cv2.INTER_NEAREST)
    return np.where(m > 0, 1.0, 8.0)

def path(cost, a, b, pad=40):
    (x0, y0), (x1, y1) = [(int(p[0]*K), int(p[1]*K)) for p in (a, b)]
    X0, Y0 = max(min(x0, x1)-pad, 0), max(min(y0, y1)-pad, 0)
    X1, Y1 = min(max(x0, x1)+pad, cost.shape[1]-1), min(max(y0, y1)+pad, cost.shape[0]-1)
    s, t = (x0-X0, y0-Y0), (x1-X0, y1-Y0)
    c = cost[Y0:Y1+1, X0:X1+1]; H, W = c.shape
    dist = np.full((H, W), 1e18); prev = {}; dist[s[1], s[0]] = 0; q = [(0.0, s)]
    while q:
        d, (x, y) = heapq.heappop(q)
        if (x, y) == t: break
        if d > dist[y, x]: continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if not dx and not dy: continue
                nx, ny = x+dx, y+dy
                if 0 <= nx < W and 0 <= ny < H:
                    nd = d + c[ny, nx] * (1.414 if dx and dy else 1)
                    if nd < dist[ny, nx]: dist[ny, nx] = nd; prev[(nx, ny)] = (x, y); heapq.heappush(q, (nd, (nx, ny)))
    out = [t]
    while out[-1] != s: out.append(prev[out[-1]])
    return [((x+X0)/K, (y+Y0)/K) for x, y in out[::-1]]

def coast_line():
    from shapely.geometry import shape
    from shapely.ops import unary_union
    return unary_union([shape(f['geometry']).buffer(0) for f in json.load(open('data/geo/land.geojson'))['features']]).boundary

def main():
    cost = cost_map(); feats = []; coast = coast_line()
    for rid, name, conf, src, mouth, basis, wp in RIVERS:
        pts = [wp[0]]
        for a, b in zip(wp, wp[1:]):
            seg = path(cost, a, b); pts += seg[1:]
        # концы — ровно в ключевых точках
        pts[0] = wp[0]; pts[-1] = wp[-1]
        if mouth == 'sea':
            from shapely.geometry import Point
            from shapely.ops import nearest_points
            e = Point(pts[-1]); d = e.distance(coast)
            print(rid, 'устье до берега', round(d), 'px')
            if 3 < d <= 90: pts.append(tuple(nearest_points(coast, e)[0].coords[0]))
        ls = LineString(pts).simplify(2.5)
        coords = [[round(x, 1), round(y, 1)] for x, y in ls.coords]
        feats.append({'type': 'Feature', 'properties': {'id': 'river:' + rid, 'name': name, 'kind': 'river', 'confidence': conf, 'sources': src,
            'mouth': mouth, 'flow': 'от истока (первая точка) к устью (последняя)', 'direction_basis': basis, 'length_km': round(ls.length*0.25, 1)},
            'geometry': {'type': 'LineString', 'coordinates': coords}})
    json.dump({'type': 'FeatureCollection', 'features': feats}, open('data/geo/rivers.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(feats), 'рек')
if __name__ == '__main__': main()
