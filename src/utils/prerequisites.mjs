/**
 * Проверка пререквизитов предмета (талант, мутация, манёвр и т.д.) против актора.
 *
 * Синтаксис элементов массивов prerequisites_*:
 *  - Элементы одного массива объединяются по И (все должны выполняться).
 *  - Внутри элемента символ `|` задаёт альтернативы по ИЛИ:
 *      "@attributes.log.rank 3 | @attributes.int.rank 3" — достаточно одного.
 *  - Атрибуты/навыки: "@attributes.str.rank 2", "str 2", "@skills.athletics.rank 3",
 *    "athletics 3" — префикс "@attributes." / "@skills." и суффикс ".rank" опциональны;
 *    тип определяется массивом, из которого пришёл элемент.
 *  - Таланты/мутации: ключ (system.key) или отображаемое имя предмета.
 *  - Линии крови: "human 3", "Human" (ранг по умолчанию 1); поддерживается легаси-пара
 *    ["Human", "3"] — числовой элемент уточняет ранг предыдущего.
 */

/** Разбирает "префикс.key.rank N" | "key N" → { key, rank }. */
function parseRankRequirement(token) {
  const m = token.trim().match(/^(?:@?\w+\.)?([a-zA-Z_]+)(?:\.rank)?\s+(\d+)$/);
  if (!m) return null;
  return { key: m[1].toLowerCase(), rank: Number(m[2]) };
}

/** Одна альтернатива требования по рангу против коллекции {key: {rank}}. */
function rankAltMet(collection, token) {
  const req = parseRankRequirement(token);
  if (!req) return false;
  return (collection?.[req.key]?.rank ?? 0) >= req.rank;
}

/** Одна альтернатива требования «есть предмет типа type с таким ключом/именем». */
function itemAltMet(actor, type, token) {
  const needle = token.trim().toLowerCase();
  if (!needle) return false;
  return actor.items.some(i =>
    i.type === type &&
    ((i.system.key || "").toLowerCase() === needle || i.name.toLowerCase() === needle)
  );
}

/** Элемент массива: альтернативы через `|`, истина если выполнена хотя бы одна. */
function entryMet(entry, altMet) {
  return String(entry).split("|").some(alt => altMet(alt.trim()));
}

/**
 * Проверяет все пререквизиты system-данных предмета против актора.
 * @param {Actor} actor
 * @param {object} system - данные предмета (item.system или itemObj.system)
 * @returns {{ ok: boolean, failed: string[] }} failed — невыполненные требования как есть
 */
export function checkPrerequisites(actor, system) {
  const failed = [];
  const sys = actor.system;

  for (const entry of system.prerequisites_attributes || []) {
    if (!entryMet(entry, alt => rankAltMet(sys.attributes, alt))) failed.push(entry);
  }

  for (const entry of system.prerequisites_skills || []) {
    if (!entryMet(entry, alt => rankAltMet(sys.skills, alt))) failed.push(entry);
  }

  for (const entry of system.prerequisites_talents || []) {
    if (!entryMet(entry, alt => itemAltMet(actor, "talent", alt))) failed.push(entry);
  }

  for (const entry of system.prerequisites_mutations || []) {
    if (!entryMet(entry, alt => itemAltMet(actor, "mutation", alt))) failed.push(entry);
  }

  // Линии крови: числовой элемент — легаси-уточнение ранга предыдущего имени.
  const bloodlineEntries = [];
  for (const entry of system.prerequisites_bloodlines || []) {
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
 * Проверяет пререквизиты и, если они не выполнены, спрашивает подтверждение
 * (Мастер может добавить предмет вопреки требованиям).
 * @returns {Promise<boolean>} true — добавлять предмет.
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
