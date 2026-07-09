/**
 * Свет токена через Active Effects — собственный хук (без зависимости от модуля ATL).
 *
 * У ActiveEffect в ядре нет пути к TokenDocument.light (свет живёт не в system-данных
 * актёра), поэтому «светящиеся» эффекты несут маркер `flags.dedrel.tokenLight` =
 * { dim, bright, color, alpha, animation, ... } (см. src/config/effect-library.mjs,
 * пресет `light`). Этот модуль на события жизненного цикла эффектов пересобирает свет
 * всех активных токенов актёра:
 *  - если есть хотя бы один активный (не подавленный) световой эффект — применяет его
 *    свет, предварительно сохранив исходный в `token.flags.dedrel.baseLight`;
 *  - если световых эффектов не осталось — возвращает исходный свет и снимает флаг.
 *
 * Обновление токенов выполняет только ГМ, чтобы не было гонки между клиентами
 * (совпадает с конвенцией боевых тиков, см. combat.mjs).
 */

/** Актёр, к которому применяется эффект (сам актёр или владелец предмета-носителя). */
function effectActor(effect) {
  const parent = effect.parent;
  if (parent instanceof Actor) return parent;
  if (parent instanceof Item) return parent.actor;
  return null;
}

function hasTokenLight(effect) {
  return !!effect.getFlag("dedrel", "tokenLight");
}

/**
 * Пересобирает свет всех активных токенов актёра по его световым эффектам.
 * При нескольких световых эффектах берётся последний применённый.
 */
async function refreshActorTokenLight(actor) {
  if (!actor) return;
  const tokens = actor.getActiveTokens();
  if (!tokens.length) return;

  const lightEffects = actor.appliedEffects.filter(hasTokenLight);
  const light = lightEffects.length
    ? lightEffects[lightEffects.length - 1].getFlag("dedrel", "tokenLight")
    : null;

  for (const token of tokens) {
    const doc = token.document;
    const savedBase = doc.getFlag("dedrel", "baseLight");
    if (light) {
      // Исходный свет сохраняем один раз — чтобы вернуть после снятия всех эффектов
      if (savedBase === undefined) {
        await doc.setFlag("dedrel", "baseLight", doc.light.toObject());
      }
      await doc.update({ light });
    } else if (savedBase !== undefined) {
      await doc.update({ light: savedBase });
      await doc.unsetFlag("dedrel", "baseLight");
    }
  }
}

// Наложение/снятие эффекта. deleteActiveEffect ловит и ручное снятие, и авто-истечение
// (CONFIG.ActiveEffect.expiryAction = "delete", см. FOUNDRY V14 QUIRKS.md §15).
for (const hook of ["createActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, (effect) => {
    if (!game.user.isGM || !hasTokenLight(effect)) return;
    refreshActorTokenLight(effectActor(effect));
  });
}

// Вкл/выкл (disabled) или правка самого маркера света
Hooks.on("updateActiveEffect", (effect) => {
  if (!game.user.isGM || !hasTokenLight(effect)) return;
  refreshActorTokenLight(effectActor(effect));
});

// Новый токен актёра, у которого уже висит световой эффект (перетаскивание на сцену)
Hooks.on("createToken", (tokenDoc) => {
  if (!game.user.isGM) return;
  const actor = tokenDoc.actor;
  if (actor?.appliedEffects.some(hasTokenLight)) refreshActorTokenLight(actor);
});
