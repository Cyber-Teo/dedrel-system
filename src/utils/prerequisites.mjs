/**
 * Checks an item's prerequisites (talent, mutation, maneuver, etc.) against an actor.
 *
 * Syntax of the prerequisites_* array elements:
 *  - Elements of one array combine with AND (all must be met).
 *  - Within an element the `|` character sets OR alternatives:
 *      "@attributes.log.rank 3 | @attributes.int.rank 3" — one is enough.
 *  - Attributes/skills: "@attributes.str.rank 2", "str 2", "@skills.athletics.rank 3",
 *    "athletics 3" — the "@attributes." / "@skills." prefix and the ".rank" suffix are optional;
 *    the type is determined by the array the element came from.
 *  - Talents/mutations: a key (system.key) or the item's display name.
 *  - Bloodlines: "human 3", "Human" (default rank 1); the legacy pair is supported
 *    ["Human", "3"] — a numeric element refines the rank of the previous one.
 */

/** Parses "prefix.key.rank N" | "key N" → { key, rank }. */
function parseRankRequirement(token) {
  const m = token.trim().match(/^(?:@?\w+\.)?([a-zA-Z_]+)(?:\.rank)?\s+(\d+)$/);
  if (!m) return null;
  return { key: m[1].toLowerCase(), rank: Number(m[2]) };
}

/** One alternative of a rank requirement against a {key: {rank}} collection. */
function rankAltMet(collection, token) {
  const req = parseRankRequirement(token);
  if (!req) return false;
  return (collection?.[req.key]?.rank ?? 0) >= req.rank;
}

/** One alternative of the requirement "has an item of type type with this key/name". */
function itemAltMet(actor, type, token) {
  const needle = token.trim().toLowerCase();
  if (!needle) return false;
  return actor.items.some(i =>
    i.type === type &&
    ((i.system.key || "").toLowerCase() === needle || i.name.toLowerCase() === needle)
  );
}

/** Array element: alternatives via `|`, true if at least one is met. */
function entryMet(entry, altMet) {
  return String(entry).split("|").some(alt => altMet(alt.trim()));
}

/**
 * Checks all prerequisites in the item's system data against the actor.
 * @param {Actor} actor
 * @param {object} system - item data (item.system or itemObj.system)
 * @returns {{ ok: boolean, failed: string[] }} failed — unmet requirements as is
 */
export function checkPrerequisites(actor, system) {
  const failed = [];
  const sys = actor.system;

  // Empty/blank array elements are NOT requirements but an import artifact
  // (an empty CSV cell → [""] instead of []). They must be dropped, otherwise an "empty"
  // prerequisite is wrongly considered unmet and the dialog pops up for no reason.
  const clean = arr => (arr || []).filter(e => String(e).trim().length > 0);

  for (const entry of clean(system.prerequisites_attributes)) {
    if (!entryMet(entry, alt => rankAltMet(sys.attributes, alt))) failed.push(entry);
  }

  for (const entry of clean(system.prerequisites_skills)) {
    if (!entryMet(entry, alt => rankAltMet(sys.skills, alt))) failed.push(entry);
  }

  for (const entry of clean(system.prerequisites_talents)) {
    if (!entryMet(entry, alt => itemAltMet(actor, "talent", alt))) failed.push(entry);
  }

  for (const entry of clean(system.prerequisites_mutations)) {
    if (!entryMet(entry, alt => itemAltMet(actor, "mutation", alt))) failed.push(entry);
  }

  // Bloodlines: a numeric element is a legacy refinement of the previous name's rank.
  const bloodlineEntries = [];
  for (const entry of clean(system.prerequisites_bloodlines)) {
    const str = String(entry).trim();
    if (/^\d+$/.test(str) && bloodlineEntries.length > 0) {
      const prev = bloodlineEntries[bloodlineEntries.length - 1];
      bloodlineEntries[bloodlineEntries.length - 1] = `${prev} ${str}`;
    } else {
      bloodlineEntries.push(str);
    }
  }
  for (const entry of bloodlineEntries) {
    const met = entryMet(entry, alt => {
      const req = parseRankRequirement(alt) || { key: alt.trim().toLowerCase(), rank: 1 };
      return (sys.bloodlines?.[req.key]?.rank ?? 0) >= req.rank;
    });
    if (!met) failed.push(entry);
  }

  return { ok: failed.length === 0, failed };
}

/**
 * Checks the prerequisites and, if they aren't met, asks for confirmation
 * (the GM can add the item despite the requirements).
 * @returns {Promise<boolean>} true — add the item.
 */
export async function confirmPrerequisites(actor, item) {
  const { ok, failed } = checkPrerequisites(actor, item.system);
  if (ok) return true;

  const reqs = item.system.prerequisites_text || failed.join("; ");
  return foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("DEDREL.Notifications.PrereqNotMetTitle") },
    content: `<p>${game.i18n.format("DEDREL.Notifications.PrereqNotMetConfirm", {
      name: item.name, reqs: foundry.utils.escapeHTML(reqs)
    })}</p>`,
    rejectClose: false
  });
}
