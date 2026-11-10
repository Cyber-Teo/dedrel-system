"""Общие части: линии границ с растра (цветовые маски) + ручные ломаные из газеттира (docs/research/gazetteer-*.json)
-> карта-барьер (x0.5). Обе задачи (states/regions) режут маску суши маркерным водоразделом по этой карте."""
import numpy as np, cv2
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
from scipy import ndimage as ndi
K = 0.5
SRC = 'data/raw/media/dedrel_optimized.webp'

def colour_masks():
    im = Image.open(SRC).convert('RGB'); a = np.asarray(im).astype(np.float32)
    hsv = np.asarray(im.convert('HSV')).astype(np.float32); h = hsv[..., 0]*360/255; s = hsv[..., 1]/255; v = hsv[..., 2]/255
    near = lambda c, t: np.sqrt(((a - np.array(c))**2).sum(-1)) < t
    def box(m, x0, y0, x1, y1):
        o = np.zeros_like(m); o[y0:y1, x0:x1] = m[y0:y1, x0:x1]; return o
    M = {}
    M['lime'] = near((141, 183, 67), 40)          # Залесское
    M['olive'] = near((119, 109, 2), 45)          # Иллиорская империя и префектуры
    M['teal'] = near((25, 190, 135), 45)          # Энфорис
    M['purple'] = box(near((80, 12, 124), 50), 6700, 1300, 7900, 2900)   # Занра
    M['orange'] = box(near((230, 131, 0), 50), 4500, 2500, 5200, 3250)   # Бастионный союз
    M['pink'] = box((h > 295) & (h < 345) & (s > .2) & (v > .5), 1000, 2400, 3900, 4800)   # Игни
    return M

def poly_mask(shape, lines, width=14):
    im = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(im)
    for ln in lines:
        d.line([(x*K, y*K) for x, y in ln], fill=255, width=max(1, int(width*K)))
    return np.asarray(im) > 0

def barrier(shape, lines):
    """True = линия границы. Цветные линии берутся с растра, остальные — из ломаных."""
    M = colour_masks(); b = np.zeros(shape, bool)
    for k, m in M.items():
        m8 = cv2.resize(m.astype(np.uint8)*255, (shape[1], shape[0]), interpolation=cv2.INTER_AREA) > 30
        b |= ndi.binary_dilation(m8, iterations=2)
    b |= poly_mask(shape, lines)
    return b
