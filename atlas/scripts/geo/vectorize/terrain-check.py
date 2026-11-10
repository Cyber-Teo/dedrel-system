"""Все именованные массивы газеттира (forest/swamp/mountains/desert) имеют полигон с центром подписи рядом."""
import json
from shapely.geometry import shape, Point
T = {f['properties']['name']: f for f in json.load(open('data/geo/terrain.geojson'))['features'] if f['properties']['name']}
G = {}
for n in ('east', 'west'):
    for it in json.load(open(f'docs/research/gazetteer-{n}.json'))['labels']:
        if it['kind'] in ('forest', 'swamp', 'mountains', 'desert'): G.setdefault(it['name'], it)
miss = 0
for name, it in sorted(G.items(), key=lambda t: (t[1]['kind'], t[0])):
    f = T.get(name)
    if not f: print(f'НЕТ  {it["kind"]:9s} {name}'); miss += 1; continue
    g = shape(f['geometry']).buffer(0); d = g.distance(Point(it['x'], it['y']))
    print(f"OK   {it['kind']:9s} {name:26s} {f['properties']['area_km2']:>8} км² {f['properties']['confidence']:8s} подпись {'внутри' if d == 0 else f'в {d:.0f} px от полигона'}")
print(f'итого: именованных массивов газеттира {len(G)}, с полигоном {len(G)-miss}, без полигона {miss}; безымянных полигонов {sum(1 for f in json.load(open("data/geo/terrain.geojson"))["features"] if not f["properties"]["name"])}')
