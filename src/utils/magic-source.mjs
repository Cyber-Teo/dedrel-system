/**
 * Source Scale on the scene — a single resolver.
 *
 * The Source lives in the scene flag `scene.flags.dedrel.sourceScale` as a map
 * `{ <doctrine key>: "none" | "any" | "abundant" }`. The GM writes the flag with the
 * Scene Sources widget (src/apps/source-hud.mjs).
 *
 * The only reading point: both the widget and the Spell Constructor come here,
 * otherwise they drift apart — the widget shows one thing, the Constructor's selector
 * allows another. A doctrine without an entry in the flag gets the default from the config
 * (`CONFIG.DEDREL.magic.defaultSourceScales`), NOT "unrestricted".
 */

/** Order of levels, ascending: index = Source strength. */
export const SOURCE_ORDER = ["none", "any", "abundant"];

/**
 * Doctrines the Source concept applies to: described in the Constructor
 * and not marked `ignoresSource` (Biomancy: the living body is the source).
 * @returns {string[]}
 */
export function doctrinesWithSource() {
  const doctrines = CONFIG.DEDREL?.magic?.doctrines || {};
  return Object.keys(doctrines).filter(k => !doctrines[k].ignoresSource);
}

/**
 * Default level for a scene the GM hasn't configured.
 * @param {string} doctrineKey
 * @returns {string} sourceScales key
 */
export function defaultSourceScale(doctrineKey) {
  const config = CONFIG.DEDREL?.magic;
  if (config?.doctrines?.[doctrineKey]?.ignoresSource) return "none";
  return config?.defaultSourceScales?.[doctrineKey] ?? "none";
}

/**
 * The doctrine's actual Source level on the scene.
 * @param {string} doctrineKey
 * @param {Scene|null} [scene] scene; the active one by default
 * @returns {string} sourceScales key
 */
export function sceneSourceScale(doctrineKey, scene = canvas?.scene) {
  const flag = scene?.getFlag("dedrel", "sourceScale")?.[doctrineKey];
  return SOURCE_ORDER.includes(flag) ? flag : defaultSourceScale(doctrineKey);
}

/**
 * Writes the doctrine's Source level to the scene (GM).
 * setFlag merges the map — neighboring doctrines aren't affected.
 * @param {string} doctrineKey
 * @param {string} scale sourceScales key
 * @param {Scene|null} [scene]
 */
export async function setSceneSourceScale(doctrineKey, scale, scene = canvas?.scene) {
  if (!scene) return;
  if (!SOURCE_ORDER.includes(scale)) throw new Error(game.i18n.format("DEDREL.Magic.SourceHUD.UnknownScale", { scale }));
  await scene.setFlag("dedrel", "sourceScale", { [doctrineKey]: scale });
}

/**
 * Next level in a cycle: none → any → abundant → none.
 * @param {string} scale current level
 * @param {boolean} [backwards] step back (Shift+click)
 * @returns {string}
 */
export function nextSourceScale(scale, backwards = false) {
  const i = SOURCE_ORDER.indexOf(scale);
  const step = backwards ? -1 : 1;
  return SOURCE_ORDER[(i + step + SOURCE_ORDER.length) % SOURCE_ORDER.length];
}
