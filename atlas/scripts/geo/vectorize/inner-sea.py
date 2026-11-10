"""data/geo/inner-sea.geojson: полигон Внутреннего моря — залив суши land.geojson, отсечённый хордой через Солнечный пролив
(от мыса полуострова Ройо ≈(3808,3198) до западного берега ≈(3743,3350), концы заведены на сушу). Запуск: python3 scripts/geo/vectorize/inner-sea.py"""
import json
from shapely.geometry import shape, Point, LineString, box, mapping
from shapely import make_valid
fs = json.load(open('data/geo/land.geojson'))['features']
land = make_valid(shape(fs[0]['geometry']))
for f in fs[1:]: land = land.union(make_valid(shape(f['geometry'])))
water = box(2000, 1500, 4400, 3600).difference(land)
w = water.difference(LineString([(3814, 3184), (3725, 3375)]).buffer(3))
sea = next(g for g in getattr(w, 'geoms', [w]) if g.contains(Point(3350, 2525)))   # Внутреннее море, geo:vnutrennee_more x=3350 y=2525
sea = sea.buffer(2, join_style='mitre').intersection(water).simplify(1.0)
if sea.geom_type != 'Polygon': sea = max(sea.geoms, key=lambda g: g.area)
assert sea.geom_type == 'Polygon' and sea.bounds[2] < 4300 and sea.bounds[3] < 3400, sea.bounds
r = lambda ring: [[round(x, 1), round(y, 1)] for x, y in ring.coords]
feat = {'type': 'Feature', 'properties': {'id': 'landscape:inner_sea', 'name': 'Внутреннее море', 'confidence': 'derived',
    'sources': ['map:растр', 'geo:vnutrennee_more'], 'area_km2': round(sea.area * 0.0625),
    'note': 'граница с океаном — хорда через Солнечный пролив, проведена по растру'},
    'geometry': {'type': 'Polygon', 'coordinates': [r(sea.exterior)] + [r(h) for h in sea.interiors]}}
json.dump({'type': 'FeatureCollection', 'features': [feat]}, open('data/geo/inner-sea.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
print('Внутреннее море', feat['properties']['area_km2'], 'км²', sea.bounds)
