"""data/geo/roads.geojson: граф дорог (LineString-рёбра type paved|gravel|direction + Point-узлы-места). Запуск: python3 scripts/geo/vectorize/roads.py"""
import json, sys, heapq, numpy as np, cv2, yaml
from PIL import Image
from shapely.geometry import LineString, Point
Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, 'scripts/vectorize')
import rivers as RV
K = RV.K
from roads_config import ALIAS, EXTRA, NODE_KINDS
TYPE = {'paved': 'paved', 'gravel': 'gravel', 'direction': 'direction'}

def road_mask(im):
    a = im.astype(np.int16); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ((r > 50) & (r < 160) & (g < 30) & (b < 30) & (r - g > 45)).astype(np.uint8)

def main():
    im = np.asarray(Image.open('data/raw/media/dedrel_optimized.webp').convert('RGB'))
    m = road_mask(im); md = cv2.dilate(m, np.ones((5, 5), np.uint8))
    cost = np.where(cv2.resize(md, None, fx=K, fy=K, interpolation=cv2.INTER_NEAREST) > 0, 1.0, 7.0)
    near = cv2.dilate(m, np.ones((7, 7), np.uint8))
    places = {p['name']: p for p in yaml.safe_load(open('data/places.yaml')) if isinstance(p.get('x'), (int, float))}
    lab = {}
    for n in ('east', 'west'):
        for it in json.load(open(f'docs/research/gazetteer-{n}.json'))['labels']: lab.setdefault(it['name'], it)
    def node(name):
        name = ALIAS.get(name, name)
        if name in places: p = places[name]; return p['id'], p['name'], (p['x'], p['y']), 'places.yaml'
        if name in lab: return 'gaz:' + name, name.rstrip('?'), (lab[name]['x'], lab[name]['y']), 'gazetteer'
        return None
    routes, skipped = [], []
    rl = [(n, r) for n in ('east', 'west') for r in json.load(open(f'docs/research/gazetteer-{n}.json'))['roads']]
    rl += [('extra', {'from': a, 'to': b, 'type': t}) for a, b, t in EXTRA]
    for n, r in rl:
        if True:
            a, b = node(r['from']), node(r['to'])
            if not a or not b: skipped.append(f"{r['from']} — {r['to']} ({r['type']}): конец без пункта на карте"); continue
            pts = RV.path(cost, a[2], b[2], pad=60)
            pts[0], pts[-1] = a[2], b[2]
            ls = LineString(pts).simplify(2.5)
            on = np.mean([near[min(int(y), near.shape[0]-1), min(int(x), near.shape[1]-1)] for x, y in (ls.interpolate(d).coords[0] for d in np.arange(0, ls.length, 4))])
            routes.append((a, b, r['type'], ls, on, n))
    # узлы-места рядом с дорогой (<=30 px): режем ребро
    allp = {p['id']: (p['id'], p['name'], (p['x'], p['y']), 'places.yaml') for p in places.values() if p['kind'] in NODE_KINDS}
    edges = []
    for a, b, t, ls, on, src in routes:
        mids = []
        for q in allp.values():
            if q[0] in (a[0], b[0]): continue
            d = ls.distance(Point(q[2]))
            if d <= 30: mids.append((ls.project(Point(q[2])), q, d))
        mids.sort(key=lambda z: z[0]); chain = [(0.0, a)] + [(s, q) for s, q, _ in mids] + [(ls.length, b)]
        for (s0, u), (s1, v) in zip(chain, chain[1:]):
            if u[0] == v[0] or s1 - s0 < 1: continue
            pts = [ls.interpolate(s0).coords[0]] + [c for c in ls.coords if s0 < ls.project(Point(c)) < s1] + [ls.interpolate(s1).coords[0]]
            seg = LineString(pts)
            edges.append((u, v, t, seg, on, src))
    nodes = {}
    feats = []
    for u, v, t, seg, on, src in edges:
        for q in (u, v): nodes[q[0]] = q
        feats.append({'type': 'Feature', 'properties': {'kind': 'road', 'type': t, 'from': u[0], 'to': v[0], 'from_name': u[1], 'to_name': v[1],
            'length_km': round(seg.length*0.25, 1), 'confidence': 'canon' if on >= 0.6 and src != 'extra' else 'derived', 'on_raster': round(float(on), 2),
            'sources': ['map:растр'] + (['gazetteer-' + src] if src != 'extra' else ['gazetteer-east:текст'])},
            'geometry': {'type': 'LineString', 'coordinates': [[round(x, 1), round(y, 1)] for x, y in seg.coords]}})
    for q in nodes.values():
        feats.append({'type': 'Feature', 'properties': {'kind': 'node', 'id': q[0], 'name': q[1], 'confidence': 'canon', 'sources': ['map:растр', q[3]]},
            'geometry': {'type': 'Point', 'coordinates': list(q[2])}})
    json.dump({'type': 'FeatureCollection', 'features': feats}, open('data/geo/roads.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump(skipped, open('/tmp/w3/roads-skipped.json', 'w'), ensure_ascii=False)
    print(len(nodes), 'узлов', len(edges), 'рёбер; пропущено', len(skipped))
    for s in skipped: print('  пропущено:', s)
if __name__ == '__main__': main()
