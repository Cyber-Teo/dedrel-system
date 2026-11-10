"""Таблица контрольных точек: расстояние ручной ломаной (до) и уточнённой (после) до линии растра -> docs/review/e3/borders-refine.md"""
import json, numpy as np, cv2
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points
D = json.load(open('scripts/geo/vectorize/lines_refined.json')); M = np.load('/tmp/w3/masks.npz')
PLAN = {'etel_drinrog': 'blue', 'vyshnevodsk': 'dark', 'dragons': 'pale', 'empire_oldforest': 'yellow'}
# (граница, линия, цвет, точка на ручной ломаной, подпись)
CP = [('Дринрог — север (Ройо/Дринрог, синяя)', 'etel_drinrog', (5900, 2705)), ('Дринрог — север', 'etel_drinrog', (6270, 2600)), ('Дринрог — север', 'etel_drinrog', (6500, 2560)),
      ('Этель — Дринрог (светлая)', 'etel_drinrog', (6790, 2610)),
      ('Вышневодск — запад (чёрная)', 'vyshnevodsk', (6500, 700)), ('Вышневодск — восток/Серебряные', 'vyshnevodsk', (7300, 950)), ('Вышневодск — юг (у Старого Леса)', 'vyshnevodsk', (6700, 1200)),
      ('Страна Драконов — север (светлая)', 'dragons', (3500, 650)),
      ('Империя у Старого Леса (жёлтая)', 'empire_oldforest', (6760, 1250)), ('Империя у Старого Леса (жёлтая)', 'empire_oldforest', (6860, 1450))]
def dist_to_mask(m, x, y, R=120):
    x0, y0 = max(int(x)-R, 0), max(int(y)-R, 0); w = m[y0:int(y)+R, x0:int(x)+R]
    ys, xs = np.nonzero(w)
    if not len(xs): return None
    return float(np.sqrt(((xs + x0 - x)**2 + (ys + y0 - y)**2).min()))
rows = []; ok = 0
for name, key, pt in CP:
    m = M[PLAN[key]]
    old = [l for l in D['old'][key]]
    old_ln = min((LineString(l) for l in old), key=lambda l: l.distance(Point(pt)))
    p_old = nearest_points(old_ln, Point(pt))[0]; d0 = dist_to_mask(m, p_old.x, p_old.y)
    new_ln = min((LineString(l) for l in D['refined'][key]), key=lambda l: l.distance(Point(pt)))
    p_new = nearest_points(new_ln, Point(pt))[0]; d1 = dist_to_mask(m, p_new.x, p_new.y)
    isnew = key == 'empire_oldforest'
    good = d1 is not None and d1 <= 20; ok += good
    rows.append(f"| {name} | {pt[0]},{pt[1]} | {'новая линия' if isnew else (f'{d0:.0f}' if d0 is not None else '>120')} | {f'{d1:.0f}' if d1 is not None else '>120'} | {'да' if good else 'НЕТ'} |")
md = ['# Уточнение ручных границ (dat-nz9.9)', '', 'Метод: scripts/geo/vectorize/refine.py протягивает каждый отрезок ручной ломаной по цветной линии растра (маска цвета, коридор ±45 px); '
      'scripts/geo/vectorize/refine-table.py меряет расстояние от точки ломаной до ближайшего пикселя линии нужного цвета (px полной карты, окно 120 px).', '',
      '| Граница | Контрольная точка (x,y) | До, px | После, px | ≤20 px |', '|---|---|---|---|---|', *rows, '', f'Итого: {ok} из {len(CP)} контрольных точек ≤20 px после уточнения.']
open('docs/review/e3/borders-refine.md', 'w').write('\n'.join(md) + '\n'); print('\n'.join(md))
