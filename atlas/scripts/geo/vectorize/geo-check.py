"""python3 geo-check.py <geojson> [parent.geojson] — центры внутри своих полигонов, пересечения, покрытие суши."""
import sys, json, itertools
from shapely.geometry import shape, Point
from shapely.ops import unary_union
def load(p): return json.load(open(p))['features']
F = load(sys.argv[1]); G = {}
for f in F:
    g = shape(f['geometry']).buffer(0); G[f['properties']['id']] = g
ok = bad = 0
print('Центр/столица внутри своего полигона:')
for f in F:
    p = f['properties']; cap = p.get('capital_px') or p.get('center_px')
    if not cap: print(f"  {p['id']}: нет точки проверки (территория «нет сведений»)"); continue
    inside = G[p['id']].contains(Point(cap)) or G[p['id']].buffer(15).contains(Point(cap))
    strict = G[p['id']].contains(Point(cap))
    print(f"  {'OK ' if strict else ('OK~' if inside else 'НЕТ')} {p['id']} {p['name']} {tuple(cap)}" + ('' if strict else ' (в пределах 15 px от границы)' if inside else ''))
    ok += inside; bad += not inside
print(f'  итого: {ok} внутри, {bad} снаружи')
tot = 0; worst = []
for (a, ga), (b, gb) in itertools.combinations(G.items(), 2):
    ar = ga.intersection(gb).area
    if ar > 1: worst.append((ar, a, b)); tot += ar
union = unary_union(list(G.values()))
print(f'Пересечения: пар с площадью >1 px²: {len(worst)}, суммарно {tot:.0f} px² ({100*tot/union.area:.4f}% площади)')
for ar, a, b in sorted(worst, reverse=True)[:5]: print(f'  {a} x {b}: {ar:.0f} px²')
if len(sys.argv) > 2:
    P = unary_union([shape(f['geometry']).buffer(0) for f in load(sys.argv[2])])
    miss = P.difference(union.buffer(2)); outside = union.difference(P.buffer(2))
    print(f'Покрытие: суша {P.area:.0f} px², покрыто {P.intersection(union.buffer(2)).area/P.area*100:.2f}%, непокрыто {miss.area:.0f} px² ({100*miss.area/P.area:.3f}%), за пределами суши {outside.area:.0f} px²')
