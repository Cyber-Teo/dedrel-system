/**
 * Translation layer for the system's compendiums (T5, `Локализация/TRANSLATION_PLAN.md` §3.2–3.4).
 *
 * Russian is the source of truth in the packs. If the active system language isn't Russian
 * (the `dedrel.systemLanguage` setting; with "auto" — core's language), the texts of documents
 * from the `dedrel.*` packs are replaced with the translation from `translations/en/<pack>.json`.
 * File format and translation rules — the `translate` skill §2.2, validation —
 * `scripts/translation_check.py`. The file list is set in `system.json`
 * (`flags.dedrel.translations.en`) so that the client doesn't request nonexistent ones.
 *
 * How it works:
 *  - Loading. The `init` hook fires before core loads the language files, and the packs
 *    come up even later (`Game#setupGame`). So we wrap `game.i18n.initialize`:
 *    core awaits it, and the dictionary is guaranteed to be ready before the first document is created.
 *  - Documents. `DedrelItem#_initializeSource` calls `translateSource`: the translation goes
 *    into `_source` (as in Babele), so importing from a compendium into the world yields an English item.
 *    Embedded actor items from packs are translated the same way (by `system.key`).
 *  - Index and folders. The compendium window takes names from `pack.index`, while the server sends the index
 *    without `system.key` and pours the Russian names back in on every `getIndex()`. So `system.key`
 *    is added to the index fields, `getIndex` is wrapped, and on `setup` the packs' index is re-requested.
 *
 * Limitations: actors (names, biographies) aren't translated; documents already imported
 * into the world stay in the language of the import; editing translated text in a pack is blocked
 * (`stripTranslatedChanges`) so that English doesn't end up in the Russian source.
 */

const SYSTEM_ID = "dedrel";
const SOURCE_LANG = "ru";
const TRANSLATION_LANG = "en";

/**
 * Pack (name without `dedrel.`) → {document key (`system.key` or `_id`) → translation entry}.
 * A key is unique within a pack but not across packs: `taunt` exists both in `additional_conditions`
 * (a condition) and in `talents` (a talent).
 */
const dictionaries = new Map();

/** Russian compendium folder name → translation. */
let folderNames = {};

/** Translated field paths per document `_source` object — for write protection. */
const translatedPaths = new WeakMap();

let active = false;

/** The active system content language: the `systemLanguage` setting or core's language. */
function contentLanguage() {
  const forced = game.settings.get(SYSTEM_ID, "systemLanguage");
  return (forced && forced !== "auto") ? forced : game.i18n.lang;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

/** Load the translation dictionary. Called from the `game.i18n.initialize` wrapper. */
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

/** Pack name without the system prefix. */
function packName(pack) {
  const id = typeof pack === "string" ? pack : pack.collection;
  return id.slice(SYSTEM_ID.length + 1);
}

/**
 * Find a document's translation entry. A document of its own pack is looked up in its dictionary.
 * An embedded actor item from a pack (`dedrel.actors`) has no dictionary of its own: we search all of them,
 * and when the key matches in several packs we take the pack with documents of the same type.
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
 * Apply the translation to the source data of a document from a system pack (in place).
 * @param {object} source         Document data (the future `_source`)
 * @param {string|null} pack      The pack of the document or of its parent
 * @param {object} [options]
 * @param {boolean} [options.creation]  The document is being created: the translation isn't applied,
 *                                      otherwise English text would be written into the pack
 * @returns {object}              The same `source` object
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
    // The field has disappeared from the RU source — the entry is stale, don't recreate the field
    if (!foundry.utils.hasProperty(source, path)) continue;
    foundry.utils.setProperty(source, path, value);
    paths.add(path);
  }
  translatedPaths.set(source, paths);
  return source;
}

/**
 * Remove the document's translated fields from the changes of a pack document, so that English text
 * doesn't end up in the Russian source. Called from `DedrelItem#_preUpdate`.
 * @returns {boolean} whether any changes were discarded
 */
function stripTranslatedChanges(document, changes) {
  const paths = translatedPaths.get(document._source);
  if (!paths?.size) return false;
  let stripped = false;
  for (const path of paths) {
    // Changes can be both flat ({"system.description": …}) and nested;
    // the sheet sends all form fields, so unchanged ones are removed silently.
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

/** Translate the names of the pack's index entries (in place). */
function translateIndex(pack) {
  const dict = dictionaries.get(packName(pack));
  if (!dict) return;
  for (const indexEntry of pack.index) {
    const name = dict[indexEntry.system?.key || indexEntry._id]?.name;
    if (name) indexEntry.name = name;
  }
}

/** Translate the pack's folder names: locally only, without writing to the database. */
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

  /** The `init` hook: the loading and index wrappers. */
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
   * The `setup` hook: the packs are already created. Translate the folders and re-request the index with `system.key`
   * (translated by the `getIndex` wrapper), then rebuild the pack trees and redraw the sidebar.
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
