"""data/geo/cells.geojson: мозаика ячеек (≈200). Внутри каждого региона 1006 (где регионов нет — государства) разбиение
Вороного по местам из places.yaml, обрезанное по суше; мелкие (<~400 км²) склеиваются с соседом, большие пустые делятся на 2–4.
Запуск: python3 scripts/geo/vectorize/cells.py"""
import json, math, sys, yaml, numpy as np
from collections import defaultdict
from scipy.cluster.vq import kmeans2
from shapely.geometry import shape, Point, MultiPoint, Polygon, MultiPolygon, mapping
from shapely.ops import unary_union, voronoi_diagram
from shapely import make_valid

KM2 = 0.0625            # км² в одном px²
MIN_PX2 = 400 / KM2     # 6400 px² ≈ 400 км²
AMAX = 280000           # px² (~17 500 км²): больше — делим k-means
KMAX = 4
SETTLE = {'capital': 0, 'city': 1, 'port': 2, 'fortress': 3, 'ruin': 4, 'mine': 5, 'school': 6, 'temple': 6, 'village': 7}

def load(n):
    d = json.load(open(f'data/geo/{n}.geojson'))
    return [(f['properties'], make_valid(shape(f['geometry']))) for f in d['features']]

def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    return [p for x in getattr(g, 'geoms', []) for p in polys(x)]

def mp(parts):
    parts = [p for g in parts for p in polys(g)]
    u = unary_union(parts) if parts else Polygon()
    return u

def neighbour_key(a, b):
    return a.intersection(b.buffer(0.5)).length if a.distance(b) < 1 else 0

def main():
    land = unary_union([g for _, g in load('land')])
    S = load('states-1006'); R = load('regions-1006')
    # государства: непересекающиеся, ∩ суша, остаток суши раздаётся соседям
    taken = Polygon(); st = []
    for p, g in S:
        g2 = g.intersection(land).difference(taken); taken = taken.union(g2); st.append([p, g2])
    for comp in polys(land.difference(taken)):
        best = max(range(len(st)), key=lambda i: (neighbour_key(comp, st[i][1]) , -comp.distance(st[i][1])))
        if neighbour_key(comp, st[best][1]) == 0: best = min(range(len(st)), key=lambda i: comp.distance(st[i][1]))
        st[best][1] = st[best][1].union(comp)
    stmap = {p['id']: (p, g) for p, g in st}
    # единицы: регион ∩ государство, остаток государства
    units = []  # (state_id, region_props|None, name, geom)
    for sid, (sp, sg) in stmap.items():
        rem = sg
        for rp, rg in R:
            if rp['parent'] != sid: continue
            g = rg.intersection(sg).intersection(rem)
            rem = rem.difference(g)
            if not g.is_empty: units.append((sid, rp, rp['name'], g))
        if rem.area > 0: units.append((sid, None, sp['name'], rem))
    # места
    pls = [p for p in yaml.safe_load(open('data/places.yaml')) if p.get('x') is not None and p['kind'] in SETTLE]
    pts = [(Point(p['x'], p['y']), p) for p in pls]

    cells = []   # dict(geom, seed place|None, unit idx)
    orphans = []  # (state_id, geom)
    for ui, (sid, rp, uname, ug) in enumerate(units):
        unit_cells = []
        for comp in polys(ug):
            if comp.area < MIN_PX2: orphans.append((sid, comp)); continue
            seeds = [(pt, p) for pt, p in pts if comp.contains(pt)]
            # убрать места ближе 60 px (15 км): оставляем более «крупное»
            seeds.sort(key=lambda t: SETTLE[t[1]['kind']]); kept = []
            for pt, p in seeds:
                if all(pt.distance(k[0]) > 60 for k in kept): kept.append((pt, p))
            seeds = kept
            if not seeds:
                k = min(KMAX, max(1, math.ceil(comp.area / AMAX)))
                parts = split_kmeans(comp, k)
                unit_cells += [dict(geom=g, seed=None, unit=ui) for g in parts]
                continue
            if len(seeds) == 1: parts = [comp]
            else:
                vor = voronoi_diagram(MultiPoint([s[0] for s in seeds]), envelope=comp.envelope.buffer(10))
                parts = []
                for s in seeds:
                    v = next(c for c in vor.geoms if c.buffer(1e-6).contains(s[0]))
                    parts.append(comp.intersection(v))
            for (pt, p), g in zip(seeds, parts):
                ps = sorted(polys(g), key=lambda x: -x.area)
                if not ps: continue
                unit_cells.append(dict(geom=ps[0], seed=p, unit=ui))
                for x in ps[1:]: orphans.append((sid, x))
        # слияние мелких внутри единицы
        merge_small(unit_cells, orphans, sid)
        # деление крупных
        out = []
        for c in unit_cells:
            if c['geom'].area > AMAX * 1.3:
                k = min(KMAX, math.ceil(c['geom'].area / AMAX))
                gs = split_kmeans(c['geom'], k, seed=c['seed'])
                for i, g in enumerate(gs):
                    out.append(dict(geom=g, seed=c['seed'] if i == 0 and c['seed'] and g.contains(Point(c['seed']['x'], c['seed']['y'])) else None, unit=ui, extra=True))
                # место достаётся части, содержащей его
                if c['seed']:
                    for o in out[-len(gs):]:
                        o['seed'] = c['seed'] if o['geom'].contains(Point(c['seed']['x'], c['seed']['y'])) else None
            else: out.append(c)
        cells += out
    # сироты — к ближайшей ячейке того же государства
    for ui, (sid, rp, uname, ug) in enumerate(units):   # государство без ячеек (мелкие острова) — одна ячейка из его обрывков
        if not any(units[c['unit']][0] == sid for c in cells):
            mine = [g for s2, g in orphans if s2 == sid]
            if mine:
                cells.append(dict(geom=mp(mine), seed=None, unit=ui)); orphans[:] = [(s2, g) for s2, g in orphans if s2 != sid]
    for sid, g in sorted(orphans, key=lambda t: -t[1].area):
        cand = [c for c in cells if units[c['unit']][0] == sid]
        if not cand: cand = cells
        c = max(cand, key=lambda c: (neighbour_key(g, c['geom']), -g.distance(c['geom'])))
        if neighbour_key(g, c['geom']) == 0: c = min(cand, key=lambda c: g.distance(c['geom']))
        c['geom'] = c['geom'].union(g)
    import shapely
    for c in cells: c['geom'] = mp([shapely.set_precision(make_valid(mp([c['geom']])), 0.1)])
    # имена
    cells.sort(key=lambda c: (list(stmap).index(units[c['unit']][0]), units[c['unit']][2], c['geom'].centroid.y, c['geom'].centroid.x))
    import re
    allpl = [(Point(p['x'], p['y']), p['name']) for p in yaml.safe_load(open('data/places.yaml')) if p.get('x') is not None and p['kind'] not in ('river', 'sea')]
    DIRS = ['восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад', 'север', 'северо-восток']
    names = []
    for c in cells:
        sid, rp, uname, ug = units[c['unit']]
        un = re.sub(r'\s*\(.*?\)', '', uname).strip()
        if c['seed']: n = c['seed']['name']
        else:
            same = [d for d in cells if d['unit'] == c['unit']]
            if len(same) == 1: n = f'{un} — безлюдье'
            else:
                uc = ug.centroid; cc = c['geom'].representative_point()
                ang = math.degrees(math.atan2(cc.y - uc.y, cc.x - uc.x)) % 360   # y вниз: 90° = юг
                n = f'{un} — ' + (DIRS[round(ang / 45) % 8] if math.hypot(cc.x - uc.x, cc.y - uc.y) > 150 else 'центр')
                near = min(allpl, key=lambda t: t[0].distance(cc))
                c['near'] = near[1] if near[0].distance(cc) < 500 else None
        names.append(n)
    cnt = defaultdict(int)
    for n in names: cnt[n] += 1
    # повторы: сначала «близ <место>», затем номер
    names2 = []
    for c, n in zip(cells, names):
        names2.append(f"{n} (близ {c['near']})" if cnt[n] > 1 and c.get('near') else n)
    cnt = defaultdict(int)
    for n in names2: cnt[n] += 1
    seen = defaultdict(int); final = []
    for n in names2:
        if cnt[n] > 1: seen[n] += 1; final.append(f'{n} {seen[n]}')
        else: final.append(n)
    feats = []
    for i, (c, n) in enumerate(zip(cells, final), 1):
        sid, rp, uname, ug = units[c['unit']]
        sp = stmap[sid][0]; g = c['geom']; cen = g.representative_point() if not g.contains(g.centroid) else g.centroid
        src = ['map:растр'] + ([c['seed']['id']] if c['seed'] else [])
        feats.append({'type': 'Feature', 'properties': {
            'id': f'cell:{i}', 'name': n, 'region': rp['id'] if rp else None, 'region_name': rp['name'] if rp else None,
            'state_1006': sid, 'area_km2': round(g.area * KM2), 'centroid': [round(cen.x), round(cen.y)],
            'place': c['seed']['id'] if c['seed'] else None, 'confidence': 'derived', 'sources': src},
            'geometry': mapping_round(g)})
    json.dump({'type': 'FeatureCollection', 'features': feats}, open('data/geo/cells.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    tot = sum(f['properties']['area_km2'] for f in feats); la = land.area * KM2
    print(len(feats), 'ячеек; площадь', round(tot), 'км² из суши', round(la), f'({tot/la:.2%})')
    a = sorted(f['properties']['area_km2'] for f in feats); print('мин/мед/макс км²', a[0], a[len(a)//2], a[-1])

def mapping_round(g):
    ps = polys(g)
    r = lambda ring: [[round(x, 1), round(y, 1)] for x, y in ring.coords]
    return {'type': 'MultiPolygon', 'coordinates': [[r(p.exterior)] + [r(h) for h in p.interiors] for p in ps]}

def split_kmeans(g, k, seed=None):
    if k <= 1: return [g]
    minx, miny, maxx, maxy = g.bounds; step = max(20, math.sqrt(g.area / 3000))
    from shapely import contains_xy
    xs, ys = np.meshgrid(np.arange(minx, maxx, step), np.arange(miny, maxy, step)); X = np.c_[xs.ravel(), ys.ravel()]
    X = X[contains_xy(g, X[:, 0], X[:, 1])]
    if len(X) < k * 5: return [g]
    rng = np.random.default_rng(7)
    best = None
    for t in range(6):
        c, lab = kmeans2(X, k, minit='++', seed=rng.integers(1 << 30))
        sse = ((X - c[lab]) ** 2).sum()
        if len(set(lab)) == k and (best is None or sse < best[0]): best = (sse, c)
    if best is None: return [g]
    c = best[1]
    vor = voronoi_diagram(MultiPoint([Point(*p) for p in c]), envelope=g.envelope.buffer(10))
    parts = []
    for p in c:
        v = next(v for v in vor.geoms if v.buffer(1e-6).contains(Point(*p)))
        parts.append(g.intersection(v))
    # несвязные куски пришиваем к соседям внутри того же g
    res = []
    extra = []
    for q in parts:
        ps = sorted(polys(q), key=lambda x: -x.area)
        if not ps: continue
        res.append(ps[0]); extra += ps[1:]
    for x in extra:
        i = max(range(len(res)), key=lambda i: (neighbour_key(x, res[i]), -x.distance(res[i])))
        res[i] = res[i].union(x)
    return res

def merge_small(cells, orphans, sid):
    while True:
        small = [c for c in cells if c['geom'].area < MIN_PX2]
        if not small or len(cells) < 2:
            for c in small:
                if len(cells) > 1: pass
            return
        c = min(small, key=lambda c: c['geom'].area)
        others = [o for o in cells if o is not c]
        nb = max(others, key=lambda o: neighbour_key(c['geom'], o['geom']))
        if neighbour_key(c['geom'], nb['geom']) == 0:
            cells.remove(c); orphans.append((sid, c['geom'])); continue
        # крупнее по рангу места остаётся основой
        nb['geom'] = nb['geom'].union(c['geom'])
        cells.remove(c)

main()
