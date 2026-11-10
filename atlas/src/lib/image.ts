// Загрузка картинок по адресу с общим кэшем: один адрес грузится один раз, повторные вызовы получают тот же промис.
const cache = new Map<string, Promise<HTMLImageElement>>()
const loaded = new Map<string, HTMLImageElement>()

/** Загрузить картинку; ошибка загрузки отклоняет промис (и остаётся в кэше). */
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const im = new Image()
      im.onload = () => {
        loaded.set(url, im)
        resolve(im)
      }
      im.onerror = reject
      im.src = url
    })
    cache.set(url, p)
  }
  return p
}

/** Уже загруженная картинка или undefined, если загрузка не завершилась. */
export const loadedImage = (url: string): HTMLImageElement | undefined => loaded.get(url)
