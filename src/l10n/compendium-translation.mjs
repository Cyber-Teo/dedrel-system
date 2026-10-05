/**
 * Слой перевода компендиумов системы (T5, `Локализация/TRANSLATION_PLAN.md` §3.2–3.4).
 *
 * Русский — источник истины в паках. Если действующий язык системы не русский
 * (настройка `dedrel.systemLanguage`, при «auto» — язык ядра), тексты документов
 * из паков `dedrel.*` подменяются переводом из `translations/en/<pack>.json`.
 * Формат файлов и правила перевода — скилл `translate` §2.2, проверка —
 * `scripts/translation_check.py`. Список файлов задаётся в `system.json`
 * (`flags.dedrel.translations.en`), чтобы клиент не запрашивал несуществующие.
 *
 * Как устроено:
 *  - Загрузка. Хук `init` срабатывает раньше, чем ядро грузит языковые файлы, а паки
 *    поднимаются ещё позже (`Game#setupGame`). Поэтому оборачиваем `game.i18n.initialize`:
 *    ядро ждёт его, и словарь гарантированно готов до создания первого документа.
 *  - Документы. `DedrelItem#_initializeSource` вызывает `translateSource`: перевод ложится
 *    в `_source` (как у Babele), поэтому импорт из компендиума в мир даёт английский предмет.
 *    Вложенные предметы акторов из паков переводятся тем же путём (по `system.key`).
 *  - Индекс и папки. Окно компендиума берёт имена из `pack.index`, а сервер присылает индекс
 *    без `system.key` и на каждом `getIndex()` вливает русские имена заново. Поэтому `system.key`
 *    добавлен в поля индекса, `getIndex` обёрнут, а на `setup` индекс паков дозапрашивается.
 *
 * Ограничения: акторы (имена, биографии) не переводятся; документы, уже импортированные
 * в мир, остаются на языке импорта; правка переведённого текста в паке блокируется
 * (`stripTranslatedChanges`), чтобы английский не попал в русский источник.
 */

const SYSTEM_ID = "dedrel";
const SOURCE_LANG = "ru";
const TRANSLATION_LANG = "en";

/**
 * Пак (имя без `dedrel.`) → {ключ документа (`system.key` или `_id`) → запись перевода}.
 * Ключ уникален внутри пака, но не между паками: `taunt` есть и в `additional_conditions`
 * (кондиция), и в `talents` (талант).
 */
const dictionaries = new Map();

/** Русское имя папки компендиума → перевод. */
let folderNames = {};

/** Переведённые пути полей по объекту `_source` документа — для защиты от записи. */
const translatedPaths = new WeakMap();

let active = false;

/** Действующий язык контента системы: настройка `systemLanguage` либо язык ядра. */
function contentLanguage() {
  const forced = game.settings.get(SYSTEM_ID, "systemLanguage");
  return (forced && forced !== "auto") ? forced : game.i18n.lang;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

/** Загрузить словарь перевода. Вызывается из обёртки `game.i18n.initialize`. */
async function load() {
  if (contentLanguage() === SOURCE_LANG) return;
  const packs = game.system.flags?.[SYSTEM_ID]?.translations?.[TRANSLATION_LANG] ?? [];
  const base = `systems/${SYSTEM_ID}/translations/${TRANSLATION_LANG}`;
  const results = await Promise.allSettled([
    ...packs.map(pack => fetchJson(`${base}/${pack}.json`)),
    fetchJson(`${base}/_folders.json`)
  ]);
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      console.warn(`Dedrel | Compendium translation not loaded: ${result.reason?.message ?? result.reason}`);
      continue;
    }
    if (i === packs.length) folderNames = result.value;
    else dictionaries.set(packs[i], result.value);
  }
  const count = [...dictionaries.values()].reduce((n, dict) => n + Object.keys(dict).length, 0);
  active = count > 0;
  if (active) console.log(`Dedrel | Compendium translation (${TRANSLATION_LANG}): ${count} entries`);
}

function isSystemPack(pack) {
  const id = typeof pack === "string" ? pack : pack?.collection;
  return !!id && id.startsWith(`${SYSTEM_ID}.`);
}

/** Имя пака без префикса системы. */
function packName(pack) {
  const id = typeof pack === "string" ? pack : pack.collection;
  return id.slice(SYSTEM_ID.length + 1);
}

/**
 * Найти запись перевода документа. Документ своего пака ищется в его словаре.
 * Вложенный предмет актора из пака (`dedrel.actors`) своего словаря не имеет: ищем по всем,
 * а при совпадении ключа в нескольких паках берём пак с документами того же типа.
 */
function findEntry(source, pack) {
  const key = source.system?.key || source._id;
  const own = dictionaries.get(packName(pack));
  if (own) return own[key];
  const candidates = [...dictionaries].filter(([, dict]) => key in dict);
  if (candidates.length <= 1) return candidates[0]?.[1][key];
  const match = candidates.find(([name]) =>
    game.packs.get(`${SYSTEM_ID}.${name}`)?.index.some(e => e.type === source.type));
  return match?.[1][key];
}

/**
 * Применить перевод к исходным данным документа из пака системы (на месте).
 * @param {object} source         Данные документа (будущий `_source`)
 * @param {string|null} pack      Пак документа или его родителя
 * @param {object} [options]
 * @param {boolean} [options.creation]  Документ создаётся: перевод не применяется,
 *                                      иначе в пак записался бы английский текст
 * @returns {object}              Тот же объект `source`
 */
function translateSource(source, pack, { creation = false } = {}) {
  if (!active || creation || !isSystemPack(pack)) return source;
  const entry = findEntry(source, pack);
  if (!entry) return source;
  const paths = new Set();
  for (const [path, value] of Object.entries(entry)) {
    if (path === "_src") continue;
    if (path === "effects") {
      for (const [effectId, fields] of Object.entries(value)) {
        const effect = source.effects?.find(e => e._id === effectId);
        if (!effect) continue;
        for (const [field, text] of Object.entries(fields)) if (field in effect) effect[field] = text;
      }
      continue;
    }
    // Поле исчезло из RU-источника — запись устарела, не создаём его заново
    if (!foundry.utils.hasProperty(source, path)) continue;
    foundry.utils.setProperty(source, path, value);
    paths.add(path);
  }
  translatedPaths.set(source, paths);
  return source;
}

/**
 * Убрать из изменений переведённые поля документа пака, чтобы английский текст
 * не попал в русский источник. Вызывается из `DedrelItem#_preUpdate`.
 * @returns {boolean} были ли изменения отброшены
 */
function stripTranslatedChanges(document, changes) {
  const paths = translatedPaths.get(document._source);
  if (!paths?.size) return false;
  let stripped = false;
  for (const path of paths) {
    // Изменения бывают и плоскими ({"system.description": …}), и вложенными;
    // лист шлёт все поля формы, поэтому неизменённые убираем молча.
    let value;
    if (path in changes) { value = changes[path]; delete changes[path]; }
    else if (foundry.utils.hasProperty(changes, path)) {
      value = foundry.utils.getProperty(changes, path);
      foundry.utils.deleteProperty(changes, path);
    }
    else continue;
    if (value !== foundry.utils.getProperty(document._source, path)) stripped = true;
  }
  if (stripped) ui.notifications.warn("DEDREL.Notifications.TranslatedCompendiumEdit", { localize: true });
  return stripped;
}

/** Перевести имена записей индекса пака (на месте). */
function translateIndex(pack) {
  const dict = dictionaries.get(packName(pack));
  if (!dict) return;
  for (const indexEntry of pack.index) {
    const name = dict[indexEntry.system?.key || indexEntry._id]?.name;
    if (name) indexEntry.name = name;
  }
}

/** Перевести имена папок пака: только локально, без записи в базу. */
function translateFolders(pack) {
  for (const folder of pack.folders) {
    const name = folderNames[folder.name];
    if (name) folder.updateSource({ name });
  }
}

export const CompendiumTranslation = {
  translateSource,
  stripTranslatedChanges,

  get active() { return active; },

  /** Хук `init`: обёртки загрузки и индекса. */
  init() {
    const indexFields = CONFIG.Item.compendiumIndexFields;
    if (!indexFields.includes("system.key")) indexFields.push("system.key");

    const i18n = game.i18n;
    const initialize = i18n.initialize.bind(i18n);
    i18n.initialize = async (...args) => {
      await initialize(...args);
      try { await load(); }
      catch (err) { console.error("Dedrel | Compendium translation failed to load", err); }
    };

    const CompendiumCollection = foundry.documents.collections.CompendiumCollection;
    const getIndex = CompendiumCollection.prototype.getIndex;
    CompendiumCollection.prototype.getIndex = async function (...args) {
      const index = await getIndex.apply(this, args);
      if (active && isSystemPack(this)) translateIndex(this);
      return index;
    };
  },

  /**
   * Хук `setup`: паки уже созданы. Перевести папки и дозапросить индекс с `system.key`
   * (переводится обёрткой `getIndex`), затем пересобрать деревья паков и перерисовать сайдбар.
   */
  async translatePacks() {
    if (!active) return;
    const packs = game.packs.filter(p => isSystemPack(p) && (p.documentName === "Item"));
    for (const pack of packs) translateFolders(pack);
    await Promise.all(packs.map(pack => pack.getIndex().catch(err =>
      console.warn(`Dedrel | Index of ${pack.collection} not translated`, err))));
    for (const pack of packs) pack.initializeTree();
    ui.compendium?.render();
  }
};
