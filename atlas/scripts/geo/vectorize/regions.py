"""data/geo/regions-1006.geojson: префектуры/регионы внутри полигона своей страны (states-1006.geojson).
Запуск: python3 scripts/geo/vectorize/regions.py"""
import json, sys, numpy as np, cv2
sys.path.insert(0, 'scripts/vectorize')
import land as L, borders as B, segment as S
from shapely.geometry import shape
from states_config import tr

G0 = (4850, 1800)  # кроп Гросса, 1:1
IG = lambda pts: tr(pts, 2, 1000, 2500)   # кроп Игни, 0.5
RJ = lambda pts: tr(pts, 4/3, 3700, 2650)  # кроп Ройо, 0.75
SRC = 'map:растр'
GROUPS = [
 ('countries/illior_empire/index', [
   ('countries/illior_empire/regions/illior_empire_run_region', 'Префектура Рун', 'canon', [(5685,1563),(5500,1800),(5600,1650)], (5685,1563)),
   ('countries/illior_empire/regions/illior_empire_vilarin_region', 'Префектура Виларин', 'canon', [(6428,1573),(6250,1550),(6600,1500)], (6428,1573)),
   ('countries/illior_empire/regions/illior_empire_illior_region', 'Префектура Иллиор', 'canon', [(5791,1953),(6300,1920),(6600,1930)], (5791,1953)),
   ('countries/illior_empire/regions/illior_empire_sark_region', 'Префектура Сарк', 'canon', [(6141,2322),(6400,2400),(5900,2500)], (6141,2322)),
 ], [[(6700,1195),(6500,1160),(6390,1230),(6250,1280),(6190,1360),(6180,1450),(6050,1500),(5950,1600),(5940,1700)],
     [(5270,1700),(5600,1760),(5940,1800),(6700,1800),(6860,1700),(6860,1400)],
     [(5900,2055),(6800,2050)]]),
 ('countries/gross/index', [
   ('countries/gross/regions/gross_changeling_forest', 'Подменный лес (регион Гросса)', 'canon', [(5100,2000),(5000,1900)], (5150,1944)),
   ('countries/gross/regions/gross_central_region', 'Центральный регион Гросса', 'canon', [(5109,2363),(5250,2330)], (5109,2363)),
   ('countries/gross/regions/gross_eastern_green_lands', 'Восточные зелёные земли', 'canon', [(5365,2600),(5262,2593)], (5262,2593)),
   ('countries/gross/regions/gross_lior_delta', 'Дельта Лиора', 'canon', [(5400,2830),(5289,2991)], (5289,2991)),
 ], [tr([(0,525),(150,500),(400,420),(520,385),(570,390),(720,470)], 1, *G0), tr([(85,730),(250,680),(500,590),(720,490)], 1, *G0),
     tr([(250,1020),(450,985),(610,915),(700,925),(770,1140)], 1, *G0)]),
 ('countries/igni/index', [
   ('countries/igni/regions/igni_ash_mountains_region', 'Пепельные горы (регион Игни)', 'canon', [(1694,3478),(1400,4000),(1750,3300)], (1694,3478)),
   ('countries/igni/regions/west_bank', 'Западный берег', 'canon', [(3663,3371),(3015,3759),(2545,3047),(3300,3438)], (3663,3371)),
   ('countries/igni/regions/no_man_s_desert', 'Ничья пустыня', 'canon', [(2400,3780),(2700,3650)], (2400,3780)),
   ('countries/igni/regions/igni_sarati_region', 'Регион Сарати (Игни)', 'canon', [(2464,4415),(3658,4004),(1933,3993),(2800,4350)], (2464,4415)),
 ], [IG([(640,290),(560,420),(480,540),(410,610),(330,740)]),
     IG([(640,300),(700,350),(760,395),(830,470),(880,540),(920,630),(960,670),(1080,690),(1170,710),(1240,715),(1310,688)]),
     IG([(410,620),(500,650),(560,730),(640,810),(760,860),(880,870),(1000,850),(1100,810),(1180,780),(1230,720),(1310,688)])]),
 ('countries/rojo/index', [
   ('countries/rojo/regions/rojo_danir_region', 'Регион Данир', 'derived', [(4035,3054),(3880,3150),(3950,2950)], (4035,3054)),
   ('countries/rojo/regions/rojo_golden_coast_regeion', 'Золотое побережье', 'derived', [(4785,3208),(4500,3290)], (4353,3303)),
   (None, 'прочее Ройо (регион не нарисован)', None, [(4570,2902),(4700,2700)], None),
 ], [RJ([(275,75),(300,140),(350,250),(395,330),(410,385)]),
     RJ([(300,330),(410,385),(550,420),(700,395),(800,350),(900,305),(1010,300),(1030,330)])]),
]

def raster(g, shape_):
    m = np.zeros(shape_, np.uint8)
    for p in ([g] if g.geom_type == 'Polygon' else g.geoms):
        cv2.fillPoly(m, [np.round(np.array(p.exterior.coords)*S.K).astype(np.int32)], 1)
        for i in p.interiors: cv2.fillPoly(m, [np.round(np.array(i.coords)*S.K).astype(np.int32)], 0)
    return m.astype(bool)

def main():
    a = L.load(); land = L.land_mask(a)
    states = {f['properties']['id']: shape(f['geometry']).buffer(0) for f in json.load(open('data/geo/states-1006.geojson'))['features']}
    feats = []
    for parent, regs, lines in GROUPS:
        allowed = raster(states[parent], land.shape) & land
        bar = B.barrier(land.shape, lines) & land
        seeds = {i+1: r[3] for i, r in enumerate(regs)}
        lab = S.flood(land, bar, seeds, allowed=allowed)
        polys = S.label_polys(lab, list(seeds), minarea=400)
        for i, (rid, name, conf, _, cen) in enumerate(regs):
            g = polys[i+1]
            if rid is None or g is None: continue
            feats.append({'type': 'Feature', 'properties': {'id': rid, 'name': name, 'parent': parent, 'confidence': conf,
                'sources': [rid, parent, SRC], 'center_px': cen, 'area_px2': round(g.area)},
                'geometry': {'type': 'MultiPolygon', 'coordinates': S.ring_list(g)}})
    json.dump(S.to_geojson(feats), open('data/geo/regions-1006.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(feats), 'features')
main()
