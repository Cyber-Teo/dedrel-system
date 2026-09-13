/**
 * Масштаб Источника на сцене — единый резолвер.
 *
 * Источник живёт во флаге сцены `scene.flags.dedrel.sourceScale` как карта
 * `{ <ключ доктрины>: "none" | "any" | "abundant" }`. Флаг пишет ГМ виджетом
 * «Источники сцены» (src/apps/source-hud.mjs).
 *
 * Единственная точка чтения: и виджет, и Конструктор заклинаний ходят сюда,
 * иначе они разъезжаются — виджет показывает одно, селект Конструктора
 * разрешает другое. Доктрина без записи во флаге получает дефолт из конфига
 * (`CONFIG.DEDREL.magic.defaultSourceScales`), а НЕ «без ограничений».
 */

/** Порядок уровней по возрастанию: индекс = сила Источника. */
export const SOURCE_ORDER = ["none", "any", "abundant"];

/**
 * Доктрины, к которым концепция Источника применима: описанные в Конструкторе
 * и не помеченные `ignoresSource` (Биомантия: живое тело и есть источник).
 * @returns {string[]}
 */
export function doctrinesWithSource() {
  const doctrines = CONFIG.DEDREL?.magic?.doctrines || {};
  return Object.keys(doctrines).filter(k => !doctrines[k].ignoresSource);
}

/**
 * Уровень по умолчанию для сцены, которую ГМ не настраивал.
 * @param {string} doctrineKey
 * @returns {string} ключ sourceScales
 */
export function defaultSourceScale(doctrineKey) {
  const config = CONFIG.DEDREL?.magic;
  if (config?.doctrines?.[doctrineKey]?.ignoresSource) return "none";
  return config?.defaultSourceScales?.[doctrineKey] ?? "none";
}

/**
 * Фактический уровень Источника доктрины на сцене.
 * @param {string} doctrineKey
 * @param {Scene|null} [scene] сцена; по умолчанию — активная
 * @returns {string} ключ sourceScales
 */
export function sceneSourceScale(doctrineKey, scene = canvas?.scene) {
  const flag = scene?.getFlag("dedrel", "sourceScale")?.[doctrineKey];
  return SOURCE_ORDER.includes(flag) ? flag : defaultSourceScale(doctrineKey);
}

/**
 * Записывает уровень Источника доктрины на сцену (ГМ).
 * setFlag мержит карту — соседние доктрины не затрагиваются.
 * @param {string} doctrineKey
 * @param {string} scale ключ sourceScales
 * @param {Scene|null} [scene]
 */
export async function setSceneSourceScale(doctrineKey, scale, scene = canvas?.scene) {
  if (!scene) return;
  if (!SOURCE_ORDER.includes(scale)) throw new Error(`Неизвестный масштаб Источника: ${scale}`);
  await scene.setFlag("dedrel", "sourceScale", { [doctrineKey]: scale });
}

/**
 * Следующий уровень по кругу: none → any → abundant → none.
 * @param {string} scale текущий уровень
 * @param {boolean} [backwards] шаг назад (Shift+клик)
 * @returns {string}
 */
export function nextSourceScale(scale, backwards = false) {
  const i = SOURCE_ORDER.indexOf(scale);
  const step = backwards ? -1 : 1;
  return SOURCE_ORDER[(i + step + SOURCE_ORDER.length) % SOURCE_ORDER.length];
}
