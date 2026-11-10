// Общий мемоизированный загрузчик данных: наборы /data/<имя>.json (предсборка data/*.yaml, см. scripts/build/data-json.ts) и geojson-ассеты.
// Каждый адрес качается и разбирается один раз на сессию; повторные вызовы получают тот же промис.
const cache = new Map<string, Promise<unknown>>()
const once = <T,>(key: string, f: () => Promise<T>): Promise<T> => {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) { p = f(); cache.set(key, p); p.catch(() => cache.delete(key)) }
  return p
}
const getJson = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() })

/**
 * Набор данных по имени из scripts/build/data-json.ts.
 * Дефолт any оставлен, пока вызовы без дженерика в route/data.ts, layers/routesMap.ts и history/landscape.ts
 * не получили типы; после этого заменить на unknown.
 */
export const loadData = <T = unknown,>(name: string): Promise<T> =>
  once<T>('d:' + name, async () => {
    if (import.meta.env.MODE === 'test') return (await import('./load.node')).readData(name) as T
    return getJson(`${import.meta.env.BASE_URL}data/${name}.json`)
  })
/** geojson по адресу ассета (import x from '…geojson?url'). */
export const loadGeo = <T = unknown,>(url: string): Promise<T> =>
  once<T>('g:' + url, async () => {
    if (import.meta.env.MODE === 'test') return (await import('./load.node')).readGeo(url) as T
    return getJson(url)
  })
