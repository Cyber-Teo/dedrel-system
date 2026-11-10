"""Маска рек: голубовато-серая тонкая линия на суше (b > r+22), без озёр (толстые капли) и без текста подписей (бирюза)."""
import numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
def mask(full):
    a = full.astype(np.int16); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (b > r + 22) & (b > g - 12) & (r > 70) & (g < 200)
    return m.astype(np.uint8)
if __name__ == '__main__':
    im = np.asarray(Image.open('data/raw/media/dedrel_optimized.webp').convert('RGB'))
    m = mask(im)
    Image.fromarray(m*255).resize((1980, 1490), Image.BOX).save('/tmp/w3/rm.png')
