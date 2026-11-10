"""data/flows.yaml -> data/routes.yaml + data/geo/routes.geojson. Запуск: python3 scripts/geo/build-routes.py [--report]
Отбирает торговые пути, караваны, работорговлю и военные походы, у которых концы резолвятся в места с положением на карте
(x,y или привязка из anchors.yaml); миграции, паломничества, бегство и пр. не берутся. Геометрия:
суша — кратчайший путь по roads.geojson между ближайшими узлами; река — отрезок реки; море — путь по воде (A* по сетке, суша обходится);
нет пути — прямая (geom: straight, confidence: derived, на карте пунктир)."""
import json, re, sys, heapq, math, yaml, collections
from shapely.geometry import shape, Point, LineString, MultiLineString
from shapely.ops import unary_union, substring
from shapely.prepared import prep
import networkx as nx

D = 'data/'
places = {p['id']: p for p in yaml.safe_load(open(D + 'places.yaml'))}
anchors = {a['place']: a['anchor'] for a in yaml.safe_load(open(D + 'anchors.yaml'))}
flows = yaml.safe_load(open(D + 'flows.yaml'))

def xy(pid):
    p = places.get(pid)
    if p and p.get('x') is not None: return (p['x'], p['y'])
    a = anchors.get(pid); q = places.get(a) if a else None
    return (q['x'], q['y']) if q and q.get('x') is not None else None

norm = lambda s: re.sub(r'\s+', ' ', re.sub(r'\(.*?\)', '', s.lower().replace('ё', 'е'))).strip(' .')
RANK = {'capital': 0, 'city': 1, 'port': 1, 'fortress': 2, 'region': 3, 'country': 3}
idx = collections.defaultdict(list)
for p in places.values():
    idx[norm(p['name'])].append(p)
ALIAS = {  # слово из flows -> id места (страны и стороны света сведены к столицам/ориентирам по тексту вики)
 'империя': 'countries/illior_empire/cities/city_illior', 'иллиорская империя': 'countries/illior_empire/cities/city_illior', 'иллиор': 'countries/illior_empire/cities/city_illior',
 'рун': 'geo:greyheld', 'залесск': 'geo:zalessk', 'залесское княжество': 'geo:zalessk', 'вышневодское княжество': 'geo:vyshnevodsk', 'вышневодск': 'geo:vyshnevodsk',
 'махаратха': 'geo:maharatha_gorod', 'дринрог': 'geo:drinrog', 'данир': 'geo:danir', 'ройо': 'geo:danir', 'игни': 'geo:tarpet', 'тарпет': 'geo:tarpet', 'занра': 'geo:mikris',
 'энфорис': 'geo:olifanor', 'гросс': 'geo:bersan', 'страна драконов': 'countries/dragons_country/index', 'самрун': 'geo:samrun',
 'плато архидемона': 'geo:madakish', 'край оазисов': 'geo:vandatari', 'побережье работорговцев': 'countries/slavetraders_coast/index', 'хрэлл': 'countries/khrell/index', 'земли хрэлл': 'countries/khrell/index',
}

def resolve(tok):
    t = norm(tok)
    t = re.sub(r'^(префектура|город|порт|крепость|земли|княжество|королевство) ', '', t) if t not in idx and t not in ALIAS else t
    for k in (t, tok and norm(tok)):
        if k in ALIAS and xy(ALIAS[k]): return ALIAS[k]
    c = [p for p in idx.get(t, []) if xy(p['id'])]
    if not c: return None
    c.sort(key=lambda p: (RANK.get(p.get('kind'), 5), p.get('x') is None))
    return c[0]['id']

def tokens(s):
    if not s: return [], []
    via = re.findall(r'через ([^)]+)', s)
    s2 = re.sub(r'\(.*?\)', '', s)
    out = [x.strip() for x in re.split(r'[,;/→]|\s+и\s+|\s+затем\s+', s2) if x.strip()]
    return out, via

# ---- классификация
def kind_of(f):
    k, w = f['kind'].lower(), (f['what'] or '').lower()
    if re.search(r'воен|поход|вторжен|налёт|налет|^military', k) and not re.search(r'развёртыван|переброск|набор', k): return 'campaign'
    if re.search(r'миграц|бегств|паломнич|посольств|телепорт|шпион|миссия|дань|репарац|съезд|шествие|налоги|финанс|валют|хранение|ссылк|переезд|охота|казн|патруль|перераспред|мигра|экспедиц|краден|пират', k): return None
    if re.search(r'работорг|slave|рабство', k) or re.search(r'\bраб(ы|ов|ам|ами|ство)\b', w): return 'slave'
    if re.search(r'караван|caravan', k): return 'caravan'
    if re.search(r'река|речн|river|водный', k): return 'trade_river'
    if re.search(r'мор|океан|фрахт|sea|перевалка', k): return 'trade_sea'
    if re.search(r'торг|trade|тракт|дорог|road|сухопут|экспорт|товарн|поставки|ресурс|вывоз|контрабанд|складск|аукцион', k): return 'trade_land'
    return None

def years(f):
    txt = ' '.join(str(f.get(x) or '') for x in ('what', 'to', 'from'))
    txt = re.sub(r'\d{1,3}\s?000|\d+\s*(тыс|легион|км|золот|человек)|\d+\.\d+\.(\d+)', lambda m: ('' if m.group(2) is None else m.group(2)), txt)
    m = re.search(r'(?<![\d.])(\d{2,4})\s*[–\-]\s*(\d{2,4})(?!\d)', txt)
    if m: a, b = int(m.group(1)), int(m.group(2)); b = b if b >= a else a + (b - a) % 100
    else:
        m = re.search(r'(?<![\d.−])(\d{2,4})(?![\d])', txt)
        if not m: return None
        a = b = int(m.group(1))
    m2 = re.search(r'(?<!\d)[−-](\d{2,3})(?!\d)', txt)
    return (a, b) if a >= 20 and b <= 1006 else None

# ---- геометрия
land = unary_union([shape(f['geometry']).buffer(0) for f in json.load(open(D + 'geo/land.geojson'))['features']])
pland = prep(land)
G = nx.Graph(); nodepos = {}
for f in json.load(open(D + 'geo/roads.geojson'))['features']:
    p = f['properties']; c = f['geometry']['coordinates']
    if f['geometry']['type'] != 'LineString' or not p.get('from') or not p.get('to'): continue
    for n, pt in ((p['from'], c[0]), (p['to'], c[-1])): nodepos[n] = tuple(pt)
    G.add_edge(p['from'], p['to'], weight=p['length_km'], line=c)
rivers = [(f['properties']['id'], f['properties']['name'], LineString(f['geometry']['coordinates'])) for f in json.load(open(D + 'geo/rivers.geojson'))['features']]
dist = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])

def road_path(a, b, maxsnap=380):
    na = min(nodepos, key=lambda n: dist(nodepos[n], a)); nb = min(nodepos, key=lambda n: dist(nodepos[n], b))
    if dist(nodepos[na], a) > maxsnap or dist(nodepos[nb], b) > maxsnap or not nx.has_path(G, na, nb): return None
    path = nx.shortest_path(G, na, nb, weight='weight'); pts = [list(a)]
    for u, v in zip(path, path[1:]):
        c = G[u][v]['line']; c = c if dist(c[0], nodepos[u]) <= dist(c[-1], nodepos[u]) else c[::-1]; pts += c
    if len(path) == 1: pts.append(list(nodepos[na]))
    return pts + [list(b)]

def river_path(a, b, maxd=260, b_sea=False):
    best = None
    for rid, nm, ln in rivers:
        da, db = ln.distance(Point(a)), ln.distance(Point(b))
        if (da <= maxd and (db <= maxd or b_sea)) and (best is None or da + db < best[0]): best = (da + db, ln, nm)
    if not best: return None
    ln = best[1]; ta, tb = ln.project(Point(a)), (ln.length if b_sea else ln.project(Point(b)))
    seg = substring(ln, min(ta, tb), max(ta, tb)); pts = [list(c) for c in seg.coords]
    if ta > tb: pts = pts[::-1]
    return [list(a)] + pts + ([] if b_sea else [list(b)])

CELL = 20
W, H = 7920 // CELL + 1, 5960 // CELL + 1
water = [[not pland.contains(Point(i * CELL, j * CELL)) for i in range(W)] for j in range(H)]
def sea_path(a, b):
    def snap(p):
        ci, cj = int(p[0] / CELL), int(p[1] / CELL)
        for r in range(0, 40):
            for di in range(-r, r + 1):
                for dj in range(-r, r + 1):
                    if max(abs(di), abs(dj)) == r and 0 <= ci + di < W and 0 <= cj + dj < H and water[cj + dj][ci + di]: return (ci + di, cj + dj)
        return None
    sa, sb = snap(a), snap(b)
    if not sa or not sb: return None
    dd = {sa: 0}; prev = {}; pq = [(0, sa)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == sb: break
        if d > dd[u]: continue
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            v = (u[0] + di, u[1] + dj)
            if 0 <= v[0] < W and 0 <= v[1] < H and water[v[1]][v[0]]:
                nd = d + (1.414 if di and dj else 1)
                if nd < dd.get(v, 1e9): dd[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    if sb not in prev and sa != sb: return None
    path = [sb]
    while path[-1] != sa: path.append(prev[path[-1]])
    pts = [(i * CELL, j * CELL) for i, j in path[::-1]]
    pts = [tuple(c) for c in LineString(pts).simplify(CELL * 0.9).coords] if len(pts) > 2 else pts
    return [list(a)] + [list(p) for p in pts] + [list(b)]

def geometry(kind, seq, sea=False, ids=()):
    out, how = [], set()
    for (a, b), bid in zip(zip(seq, seq[1:]), ids[1:]):
        if kind == 'trade_sea' or sea: g, h = sea_path(a, b), 'sea'
        elif kind == 'trade_river': g, h = river_path(a, b, b_sea=places[bid].get('kind') == 'sea'), 'river'
        else: g, h = road_path(a, b), 'road'
        if g is None: g, h = [list(a), list(b)], 'straight'
        out += g if not out else g[1:]; how.add(h)
    return [[round(x, 1), round(y, 1)] for x, y in out], ('straight' if 'straight' in how else sorted(how)[0] if len(how) == 1 else 'mixed')

# ---- сборка
routes, feats, skipped = {}, [], collections.Counter()
unres = collections.Counter()
for f in flows:
    kind = kind_of(f)
    if not kind: skipped['другой вид потока'] += 1; continue
    ft, fv = tokens(f.get('from')); tt, tv = tokens(f.get('to'))
    fids = [(t, resolve(t)) for t in ft]; tids = [(t, resolve(t)) for t in tt]
    for t, r in fids + tids:
        if not r: unres[t] += 1
    origin = next((r for t, r in fids if r), None)
    dests = [r for t, r in tids if r]
    if not origin or not dests: skipped['конец не резолвится в место на карте'] += 1; continue
    if kind == 'trade_land' and (places[dests[0]].get('kind') == 'sea' or places[origin].get('kind') == 'sea'): kind = 'trade_sea'
    yr = years(f) if kind == 'campaign' else None
    if kind == 'campaign' and not yr: skipped['поход без даты'] += 1; continue
    sea = kind == 'campaign' and bool(re.search(r'морск|флот|десант', f['kind'].lower() + ' ' + f['what'].lower()))
    legs = [dests] if kind == 'campaign' else [[d] for d in dests[:3]]
    for leg in legs:
        seq = [origin] + [r for r in leg if r != origin]
        if len(seq) < 2: continue
        key = (kind, seq[-1], yr) if kind == 'campaign' else (kind, tuple(seq), yr)  # один поход пересказан на нескольких страницах вики
        if key in routes:
            r = routes[key]; r['flows'].append(f['id']); r['sources'] = sorted(set(r['sources'] + f['sources']))
            if len(seq) > len(r.get('via', [])) + 2 and r['geom'] != 'sea': pass  # сохраняем первую запись: маршрут и состав via у неё
            continue
        pts = [xy(s) for s in seq]
        coords, how = geometry(kind, pts, sea, seq)
        conf = f['confidence'] if how != 'straight' or f['confidence'] == 'speculative' else 'derived'
        if how in ('straight',) and conf == 'canon': conf = 'derived'
        routes[key] = {'id': '', 'flows': [f['id']], 'kind': kind, 'name': (f['what'] or '').strip()[:90], 'from': seq[0], 'to': seq[-1],
                       **({'via': seq[1:-1]} if len(seq) > 2 else {}), 'year_from': yr[0] if yr else None, 'year_to': yr[1] if yr else None,
                       'what': (f['what'] or '').strip(), 'geom': how, 'confidence': conf, 'sources': list(f['sources']), '_c': coords}
out = []
cnt = collections.Counter()
for r in routes.values():
    cnt[r['kind']] += 1; r['id'] = f"route:{r['kind']}-{cnt[r['kind']]:03d}"
    feats.append({'type': 'Feature', 'properties': {'id': r['id'], 'kind': r['kind'], 'geom': r['geom'], 'confidence': r['confidence'], 'year_from': r['year_from'], 'year_to': r['year_to']}, 'geometry': {'type': 'LineString', 'coordinates': r.pop('_c')}})
    out.append(r)
hdr = '# Пути и походы. Собрано scripts/geo/build-routes.py из data/flows.yaml (flows — id исходных потоков); геометрия — data/geo/routes.geojson.\n# kind: trade_land|trade_river|trade_sea|caravan|slave|campaign; from/to/via — id мест; geom: road|river|sea|mixed|straight (straight = прямая, на карте пунктир, confidence не выше derived).\n'
open(D + 'routes.yaml', 'w').write(hdr + yaml.safe_dump(out, allow_unicode=True, sort_keys=False, width=200))
json.dump({'type': 'FeatureCollection', 'features': feats}, open(D + 'geo/routes.geojson', 'w'), ensure_ascii=False)
print('маршрутов', len(out), dict(cnt), 'geom', dict(collections.Counter(r['geom'] for r in out)))
print('пропущено', dict(skipped))
if '--report' in sys.argv: print('не разрешились:', unres.most_common(60))
