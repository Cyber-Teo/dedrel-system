"""data/geo/states-1006.geojson: полигоны государств. Запуск: python3 scripts/geo/vectorize/states.py"""
import json, sys, numpy as np
sys.path.insert(0, 'scripts/vectorize')
import land as L, borders as B, segment as S
from states_config import STATES, ALL_LINES, DRAGON
from shapely.geometry import Polygon, Point

def main():
    a = L.load(); land = L.land_mask(a); bar = B.barrier(land.shape, ALL_LINES) & land
    seeds = {i+1: s[4] for i, s in enumerate(STATES)}
    drag = [i+1 for i, s in enumerate(STATES) if s[0] == 'countries/dragons_country/index'][0]
    horse = [i+1 for i, s in enumerate(STATES) if s[0] == 'countries/horseshoe_islands/index'][0]
    lab = S.flood(land, bar, seeds, [(drag, Polygon(DRAGON)), (horse, Polygon([(7100,3700),(7850,3700),(7850,4350),(7100,4350)]))])
    np.save('/tmp/_states_lab.npy', lab)
    polys = S.label_polys(lab, list(seeds))
    feats = []
    for i, st in enumerate(STATES):
        g = polys[i+1]
        if g is None: print('ПУСТО', st[0]); continue
        pid, name, conf, src, _, cap = st
        icon = cap
        if cap and not g.contains(Point(cap)) and g.distance(Point(cap)) <= 12:   # значок столицы на кромке острова: точка проверки — ближайшая точка внутри полигона
            from shapely.ops import nearest_points
            q = nearest_points(g.buffer(-1) if g.buffer(-1).area else g, Point(cap))[0]; cap = (round(q.x), round(q.y))
        feats.append({'type': 'Feature', 'properties': {'id': pid, 'name': name, 'confidence': conf,
            'sources': ([pid] if pid.startswith('countries/') else []) + src, 'capital_px': cap, **({'capital_icon_px': icon} if icon != cap else {}), 'area_px2': round(g.area)},
            'geometry': {'type': 'MultiPolygon', 'coordinates': S.ring_list(g)}})
    json.dump(S.to_geojson(feats), open('data/geo/states-1006.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(feats), 'features')
main()
