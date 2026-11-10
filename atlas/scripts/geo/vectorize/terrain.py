"""data/geo/terrain.geojson: полигоны лесов, болот, гор, пустынь. Маски — цветовая сегментация (terrain_classes.py); каждому именованному
массиву газеттира — свой полигон: связная область маски вокруг подписи в радиусе R, спорные пиксели — ближайшему центру.
Запуск: python3 scripts/geo/vectorize/terrain.py"""
import json, sys, numpy as np, cv2
from scipy import ndimage as ndi
sys.path.insert(0, 'scripts/vectorize')
import terrain_classes as T
K = T.K
# имя в газеттире, вид, маска(и), радиус px полной карты
NAMED = [
 ('Безмолвный лес', 'forest', ['forest'], 1300), ('Лес Ужасов', 'forest', ['forest'], 800), ('Подменный лес', 'forest', ['forest'], 700),
 ('Старый Лес', 'forest', ['forest', 'mountains'], 600), ('Друидова пуща', 'forest', ['forest'], 320), ('Императорский лес', 'forest', ['forest'], 260),
 ('Маленький лес', 'forest', ['forest'], 200), ('Галерный лес', 'forest', ['forest'], 600), ('Межевой лес', 'forest', ['forest'], 350),
 ('Долгое болото', 'swamp', ['swamp'], 1100), ('Морозное болото', 'swamp', ['swamp'], 800), ('Болото чёрного пламени', 'swamp', ['mountains', 'forest', 'swamp'], 380),
 ('Болото пляшущих молний', 'swamp', ['swamp'], 450),
 ('Белоголовые горы', 'mountains', ['mountains'], 900), ('Серебряные горы', 'mountains', ['mountains'], 700), ('Мёртвые горы', 'mountains', ['mountains'], 900),
 ('Барьерные горы', 'mountains', ['mountains'], 1300), ('Пепельные горы', 'mountains', ['mountains'], 1300), ('Драконья гора', 'mountains', ['mountains'], 350),
 ('Золотые пески', 'desert', ['desert'], 1100), ('Ничья пустыня', 'desert', ['desert'], 900), ('Великая пустыня', 'desert', ['desert'], 1800),
]
MIN_UNNAMED = 250000  # px² полной карты

def gaz():
    out = {}
    for n in ('east', 'west'):
        for it in json.load(open(f'docs/research/gazetteer-{n}.json'))['labels']:
            if it['kind'] in ('forest', 'swamp', 'mountains', 'desert'): out.setdefault(it['name'], (it['x'], it['y'], it['kind']))
    return out

def snap(mask, x, y, maxd):
    X, Y = int(x*K), int(y*K)
    if mask[Y, X]: return X, Y, 0
    idx = ndi.distance_transform_edt(~mask, return_distances=True, return_indices=True)
    d, i = idx; return int(i[1][Y, X]), int(i[0][Y, X]), float(d[Y, X])/K

def polys(m, simp=2.0):
    m = cv2.medianBlur(m.astype(np.uint8)*255, 5)
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    res = []
    if hier is None: return res
    hier = hier[0]
    for i, c in enumerate(cs):
        if hier[i][3] != -1 or cv2.contourArea(c) < 40: continue
        rings = [c] + [cs[j] for j in range(len(cs)) if hier[j][3] == i and cv2.contourArea(cs[j]) > 400]
        res.append([[[round(float(p[0][0])/K, 1), round(float(p[0][1])/K, 1)] for p in cv2.approxPolyDP(r, simp, True)] for r in rings])
    return res

def main():
    c = T.classes(); M = T.masks(c); G = gaz(); H, W = c['land'].shape
    yy, xx = np.mgrid[0:H, 0:W]
    cand = []
    for name, kind, cls, R in NAMED:
        if name not in G: print('НЕТ в газеттире:', name); continue
        gx, gy, gk = G[name]
        allowed = np.zeros((H, W), bool)
        for k in cls: allowed |= M[k]
        sx, sy, dsnap = snap(allowed, gx, gy, R)
        comp, _ = ndi.label(allowed); disk = (xx - gx*K)**2 + (yy - gy*K)**2 <= (R*K)**2
        region = (comp == comp[sy, sx]) & disk
        cand.append((name, kind, (gx*K, gy*K), region, dsnap, gk))
    # спорные пиксели — ближайшему центру
    best = np.full((H, W), 1e18); lab = np.full((H, W), -1)
    for i, (_, _, (cx, cy), reg, *_r) in enumerate(cand):
        d = (xx - cx)**2 + (yy - cy)**2; upd = reg & (d < best); best[upd] = d[upd]; lab[upd] = i
    feats = []; used = np.zeros((H, W), bool)
    for i, (name, kind, _, reg, dsnap, gk) in enumerate(cand):
        m = lab == i; used |= m
        m = ndi.binary_opening(m, iterations=1); l, n = ndi.label(m)
        if n > 1: sizes = ndi.sum(m, l, range(1, n+1)); m = l == (1 + int(np.argmax(sizes)))
        P = polys(m)
        if not P: print('ПУСТО', name); continue
        area = int(m.sum() / K / K)
        feats.append(('named', name, kind, P, area, 'canon' if dsnap <= 60 and name != 'Болото чёрного пламени' else 'derived', gk))
    # безымянные массивы
    for kind in ('forest', 'swamp', 'mountains', 'desert'):
        rest = M[kind] & ~ndi.binary_dilation(used, iterations=2); l, n = ndi.label(rest)
        for j in range(1, n+1):
            m = l == j; area = int(m.sum() / K / K)
            if area >= MIN_UNNAMED:
                P = polys(m)
                if P: feats.append(('unnamed', None, kind, P, area, 'canon', None))
    out = []
    for k, (typ, name, kind, P, area, conf, gk) in enumerate(feats):
        out.append({'type': 'Feature', 'properties': {'id': f'terrain:{kind}:{k}', 'name': name, 'terrain': kind, 'confidence': conf,
            'sources': ['map:растр'] + (['gazetteer'] if name else []), 'area_km2': round(area*0.0625), 'method': 'цветовая сегментация'},
            'geometry': {'type': 'MultiPolygon', 'coordinates': P}})
    json.dump({'type': 'FeatureCollection', 'features': out}, open('data/geo/terrain.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'полигонов, из них именованных', sum(1 for f in out if f['properties']['name']))
if __name__ == '__main__': main()
