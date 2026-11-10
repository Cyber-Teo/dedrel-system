"""Проверка: каждая река заканчивается в море/озере/болоте или впадает в другую реку; все именованные реки газеттира присутствуют."""
import json, glob
from shapely.geometry import shape, Point, LineString
from shapely.ops import unary_union
F = json.load(open('data/geo/rivers.geojson'))['features']
land = unary_union([shape(f['geometry']).buffer(0) for f in json.load(open('data/geo/land.geojson'))['features']])
coast = land.boundary
lakes = []
for n in ('east', 'west'):
    for it in json.load(open(f'docs/research/gazetteer-{n}.json'))['labels']:
        if it['kind'] in ('lake', 'swamp'): lakes.append((it['name'], it['kind'], Point(it['x'], it['y'])))
L = {f['properties']['id']: LineString(f['geometry']['coordinates']) for f in F}
bad = 0
for f in F:
    p = f['properties']; ln = L[p['id']]; end = Point(ln.coords[-1]); m = p['mouth']; res = None
    if m == 'sea':
        d = end.distance(coast)
        res = f"море (до берега {d:.0f} px, {'в воде' if not land.contains(end) else 'на суше'})" if d <= 30 else None
    elif m.startswith('river:'):
        d = end.distance(L['river:' + m[6:]]); res = f"впадает в {m[6:]} (расстояние {d:.0f} px)" if d <= 25 else None
    elif m == 'lake':
        c = min(lakes, key=lambda t: t[2].distance(end)); d = c[2].distance(end)
        res = f"озеро/оазис «{c[0]}» ({d:.0f} px от подписи)" if d <= 160 else None
    ok = res is not None; bad += not ok
    print(f"{'OK ' if ok else 'НЕТ'} {p['id']:32s} {p['name'] or '(без подписи)':38s} {p['length_km']:7.1f} км  -> {res or 'устье не подтверждено, mouth=' + m}")
print(f'итого: {len(F)} рек, устье подтверждено у {len(F)-bad}, не подтверждено {bad}')
names = {'р. Гиблая', 'р. Граничная', 'р. Лиор', 'р. Потерянного времени', 'р. Вертлявая', 'р. Розовая', 'р. Сонная'}
have = {f['properties']['name'] for f in F}
print('именованные реки газеттира без линии:', sorted(names - have) or 'нет')
