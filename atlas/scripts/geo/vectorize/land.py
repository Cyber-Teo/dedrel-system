"""Маска суши и береговая линия из растра -> data/geo/land.geojson (координаты в px полной карты 7920x5960).
Метод: вода = (b > r+30) & (b > g) на копии x0.5; медиана 5; надписи на воде стираются прямоугольниками+цветом текста;
реки/озёра удаляются открытием воды и порогом площади водных компонент; рамка, легенда, роза ветров и шкала вырезаны;
Подковные острова (бледные, оранжевые на светлой воде) берутся отдельным порогом r > b+20; контур cv2.findContours,
упрощение Douglas-Peucker 3 px (полной карты)."""
import json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None
SRC = 'data/raw/media/dedrel_optimized.webp'
K = 0.5
FRAME = (92, 92, 7830, 5868)  # внутренняя рамка карты, px полной карты
CUT = [(6560, 4800, 7830, 5868),   # легенда, шкала
       (6800, 4180, 7500, 4820)]   # роза ветров
# подписи на воде (px полной карты): всё «светло-золотое» внутри — не суша
TEXT_RECTS = [(6400, 2650, 7800, 4600),   # Тёмный океан
              (2950, 2440, 3960, 2620),   # Внутреннее море
              (4200, 3500, 5600, 3720),   # Монструозное море
              (3640, 3850, 4260, 3950),   # Залив бритвенных скал
              (7180, 3740, 7830, 3870)]
HORSE = (7180, 3750, 7833, 4300)  # Подковные острова

def load():
    im = Image.open(SRC).convert('RGB')
    return np.asarray(im.resize((int(im.width*K), int(im.height*K)), Image.LANCZOS)).astype(np.int16)

def rect(m, r, v):
    x0, y0, x1, y1 = [int(t*K) for t in r]
    m[y0:y1, x0:x1] = v

STRIPS = [((3500, 3135), (4040, 3370), 48)]   # Солнечный пролив: наклонная полоса (p0, p1, полуширина)

def strip_mask(shape):
    from PIL import ImageDraw
    im = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(im)
    for p0, p1, hw in STRIPS: d.line([(p0[0]*K, p0[1]*K), (p1[0]*K, p1[1]*K)], fill=255, width=int(hw*2*K))
    return np.asarray(im) > 0

def land_mask(a):
    # белый текст/якоря (низкая насыщенность, светлый): значение берём у ближайшего небелого пикселя
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    wh = (np.minimum(np.minimum(r, g), b) > 170) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 45)
    wh = ndi.binary_dilation(wh, iterations=2)
    idx = ndi.distance_transform_edt(wh, return_distances=False, return_indices=True)
    a = a[idx[0], idx[1]]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    w = (b > r + 30) & (b > g)
    w = ndi.median_filter(w.astype(np.uint8), size=5).astype(bool)
    gold = (r - b > 30) & (r > 140)
    txt = np.zeros_like(w)
    for t in TEXT_RECTS: rect(txt, t, True)
    txt |= strip_mask(w.shape)
    w |= ndi.binary_dilation(txt & gold, iterations=6) & txt
    w = ndi.binary_dilation(w, iterations=1) & ~(~ndi.binary_erosion(w | ~gold | ~txt, iterations=1) & False) if False else w
    # подкова: отдельный порог
    hm = np.zeros_like(w); rect(hm, HORSE, True)
    white = (np.minimum(np.minimum(r, g), b) > 150) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 45)
    dark = np.maximum(np.maximum(r, g), b) < 75
    horse_land = (b < r + 12) & ~white & ~dark & (r > 90)
    horse_land = ndi.binary_opening(ndi.median_filter(horse_land.astype(np.uint8), size=3).astype(bool), structure=np.ones((3, 3), bool))
    horse_land = ndi.binary_dilation(horse_land, iterations=1)
    rect(horse_land, (7100, 3890, 7310, 3950), False)  # подпись Тэрранова
    w[hm] = ~horse_land[hm]
    # открытие воды: убирает реки (тонкие), потом мелкие водоёмы -> суша
    wo = ndi.binary_opening(w, structure=np.ones((7, 7), bool))
    lab, n = ndi.label(wo)
    sz = ndi.sum(wo, lab, range(1, n+1))
    keep = np.zeros(n+1, bool); keep[1:] = sz > 3000
    wo = keep[lab]
    # подкова: водой остаётся всё, что не суша (мелочь не открываем)
    wo[hm] = w[hm]
    land = ~wo
    land = ndi.binary_opening(land, structure=np.ones((5, 5), bool)) | (land & hm)   # якоря/значки у берега
    # вне рамки и вырезы
    out = np.ones_like(land); x0, y0, x1, y1 = [int(t*K) for t in FRAME]; out[y0:y1, x0:x1] = False
    land[out] = False
    for c in CUT: rect(land, c, False)
    lab, n = ndi.label(land)
    sz = ndi.sum(land, lab, range(1, n+1))
    keep = np.zeros(n+1, bool); keep[1:] = sz > 120   # ~ 480 px² полной карты
    land = keep[lab]
    return land

def polygons(land, eps_full=3.0):
    cs, hier = cv2.findContours(land.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    hier = hier[0]
    def simp(c):
        c = cv2.approxPolyDP(c, eps_full*K, True)[:, 0, :].astype(float) / K
        return c
    polys = []
    for i, c in enumerate(cs):
        if hier[i][3] != -1: continue
        ring = simp(c)
        if len(ring) < 4: continue
        holes = []
        j = hier[i][2]
        while j != -1:
            h = simp(cs[j])
            if len(h) >= 4 and cv2.contourArea(cs[j]) > 120: holes.append(h)
            j = hier[j][0]
        polys.append((ring, holes))
    return polys

def main():
    a = load(); land = land_mask(a)
    print('land share', land.mean())
    feats = []
    for k, (ring, holes) in enumerate(sorted(polygons(land), key=lambda p: -cv2.contourArea(p[0].astype(np.float32)))):
        rings = [np.vstack([ring, ring[:1]]).round(1).tolist()] + [np.vstack([h, h[:1]]).round(1).tolist() for h in holes]
        area = float(cv2.contourArea(ring.astype(np.float32)))
        feats.append({'type': 'Feature', 'properties': {'id': f'land/{k}', 'name': 'Суша' if area > 2e6 else 'Остров', 'confidence': 'canon',
                      'sources': ['map:растр'], 'area_px2': round(area)}, 'geometry': {'type': 'Polygon', 'coordinates': rings}})
    json.dump({'type': 'FeatureCollection', 'crs_note': 'px полной карты 7920x5960, x слева, y сверху', 'features': feats},
              open('data/geo/land.geojson', 'w'), ensure_ascii=False, separators=(',', ':'))
    np.save('/tmp/_land.npy', land)
    print(len(feats), 'polygons')
if __name__ == '__main__':
    main()
