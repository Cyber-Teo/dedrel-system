"""Цветовая сегментация местности на сетке x0.25: лес, горы, болото, пустыня (маски bool, 1980x1490)."""
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None
K = 0.25
def classes():
    full = Image.open('data/raw/media/dedrel_optimized.webp').convert('RGB')
    im = np.asarray(full.resize((int(full.width*K), int(full.height*K)), Image.BOX)); a = im.astype(int)
    hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV).astype(int); h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # суша: не синяя вода
    water = (b > r + 25) & (b > g - 5)
    land = ndi.binary_opening(~water, iterations=2)
    # плотность чёрной штриховки (деревья, скалы) на полном разрешении, затем усреднение
    gray = np.asarray(full.convert('L')); ink = (gray < 55).astype(np.float32)
    D = cv2.resize(cv2.blur(ink, (24, 24)), (im.shape[1], im.shape[0]), interpolation=cv2.INTER_AREA)
    D = cv2.GaussianBlur(D, (0, 0), 3)
    return dict(im=im, land=land, D=D, h=h, s=s, v=v, r=r, g=g, b=b)
def masks(c):
    land, D, h, s, v, r, g, b = (c[k] for k in 'land D h s v r g b'.split())
    dense = D > 0.16
    rock = dense & (s < 85) & (np.abs(r - g) < 22)                       # серо-коричневый камень
    forest = dense & ~rock & (h >= 24) & (h <= 75) & (s >= 70) & (v < 135)
    desert = (h >= 14) & (h <= 28) & (s > 105) & (v > 175) & ~dense      # светло-жёлтая и оранжевая пустыня
    teal = (h >= 75) & (h <= 100) & (s > 60) & land                      # вода внутри суши (озёра, болотная вода)
    teal = ndi.binary_opening(teal, structure=np.ones((4, 4)))      # тонкие бирюзовые границы — не вода
    swamp = cv2.GaussianBlur(teal.astype(np.float32), (0, 0), 14) > 0.03
    out = {}
    for k, m in dict(forest=forest, mountains=rock, desert=desert, swamp=swamp).items():
        m = ndi.binary_closing(m & land, iterations=3); m = ndi.binary_opening(m, iterations=2) if k != 'swamp' else m
        out[k] = m & land
    return out
if __name__ == '__main__':
    c = classes(); m = masks(c); im = c['im'].copy()
    col = dict(forest=(0, 90, 0), mountains=(150, 150, 160), desert=(255, 220, 0), swamp=(0, 230, 230))
    for k, mk in m.items(): im[mk] = (0.4*im[mk] + 0.6*np.array(col[k])).astype(np.uint8)
    Image.fromarray(im).save('/tmp/w3/tc.png')
