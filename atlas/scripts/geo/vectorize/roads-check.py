"""Граф дорог: узлы, рёбра, компоненты, путь Иллиор→Данир, покрытие тёмно-красной маски."""
import json, heapq, sys
from collections import defaultdict
import numpy as np, cv2
from shapely.geometry import shape
F = json.load(open('data/geo/roads.geojson'))['features']
nodes = {f['properties']['id']: f['properties'] for f in F if f['properties']['kind'] == 'node'}
edges = [f for f in F if f['properties']['kind'] == 'road']
adj = defaultdict(list); par = {n: n for n in nodes}
def find(x):
    while par[x] != x: par[x] = par[par[x]]; x = par[x]
    return x
for e in edges:
    p = e['properties']; adj[p['from']].append((p['to'], p['length_km'], p)); adj[p['to']].append((p['from'], p['length_km'], p)); par[find(p['from'])] = find(p['to'])
comps = defaultdict(list)
for n in nodes: comps[find(n)].append(n)
cs = sorted(comps.values(), key=len, reverse=True)
by_type = defaultdict(int)
for e in edges: by_type[e['properties']['type']] += 1
print(f'граф: узлов {len(nodes)}, рёбер {len(edges)} ({dict(by_type)}), компонент {len(cs)} (суша материка — 1 главная: {len(cs[0])} узлов)')
for i, c in enumerate(cs[1:], 2): print(f'  компонента {i}: {len(c)} узлов: ' + ', '.join(nodes[n]['name'] for n in c))
def sp(a, b):
    d = {a: 0}; pr = {}; q = [(0, a)]
    while q:
        dd, u = heapq.heappop(q)
        if u == b: break
        if dd > d[u]: continue
        for v, w, p in adj[u]:
            if dd + w < d.get(v, 1e18): d[v] = dd + w; pr[v] = (u, p); heapq.heappush(q, (dd + w, v))
    if b not in d: return None
    path = [b]
    while path[-1] != a: path.append(pr[path[-1]][0])
    return d[b], path[::-1], pr
nm = {p['name']: i for i, p in nodes.items()}
r = sp(nm['Иллиор'], nm['Данир'])
if r:
    km, path, pr = r
    print(f'путь Иллиор→Данир: {km:.1f} км, {len(path)} узлов:')
    for u, v in zip(path, path[1:]):
        e = next(p for w, _, p in adj[u] if w == v); print(f"  {nodes[u]['name']} → {nodes[v]['name']}: {e['length_km']} км ({e['type']})")
else: print('путь Иллиор→Данир: НЕТ')
low = [(e['properties']['from_name'], e['properties']['to_name'], e['properties']['on_raster']) for e in edges if e['properties']['on_raster'] < 0.6]
print(f"рёбер с долей на линии растра <0.6 (confidence derived): {len(low)} из {len(edges)}")
for l in low: print('  ', l)
