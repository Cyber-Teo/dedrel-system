/* ==================================================
 * Синхронизация регионов-аур с эффектами-маркерами
 * ==================================================
 * Аура задаётся Active Effect'ом с флагом flags.dedrel.aura
 * ({radius, disposition, includeSelf, effects?, color?});
 * radius — в единицах дистанции сцены (метры).
 * Пока такой эффект активен на актёре, у каждого его токена
 * на текущей сцене существует регион-эманация (V14, attachment
 * к токену — ядро само двигает регион за токеном) с behavior
 * "dedrelAura" (см. src/data/region-behaviors/aura.mjs),
 * который вешает/снимает payload-эффекты на входящие токены.
 *
 * Весь модуль исполняется только на клиенте активного ГМа:
 * создание/удаление регионов и эффектов требует его прав,
 * а события и хуки приходят на все клиенты.
 */

/**
 * Собирает активные аура-маркеры актёра.
 * Маркер — "чистый" эффект с transfer: false: сам он ни на кого не действует
 * (носитель получает payload только через includeSelf), поэтому ищем по всем
 * эффектам актёра и его предметов, а не по allApplicableEffects (тот отдаёт
 * только transfer-эффекты предметов).
 * @param {Actor} actor
 * @returns {Map<string, {effect: ActiveEffect, params: object}>} uuid маркера → данные
 */
function getAuraEffects(actor) {
  const result = new Map();
  const collect = (effect) => {
    if (effect.disabled || effect.isSuppressed) return;
    // Копия, навешенная аурой, сама маркером быть не может — защита от
    // загрязнённых данных (копии старых версий сохраняли флаг aura)
    if (effect.getFlag("dedrel", "auraApplied")) return;
    const params = effect.getFlag("dedrel", "aura");
    if (!params || !(Number(params.radius) > 0)) return;
    result.set(effect.uuid, { effect, params });
  };
  for (const effect of actor.effects) collect(effect);
  for (const item of actor.items) {
    for (const effect of item.effects) collect(effect);
  }
  return result;
}

/**
 * Нормализованный снимок параметров ауры: пишется во флаг региона
 * при создании и сравнивается при синхронизации, чтобы пересоздать
 * регион после правки радиуса/фильтров.
 */
function snapshotParams(params) {
  return {
    radius: Number(params.radius),
    disposition: params.disposition ?? "all",
    includeSelf: !!params.includeSelf,
    color: params.color || null
  };
}

/**
 * Снимает со всех актёров сцены эффекты, навешенные behavior'ами региона.
 * Нужна при удалении региона синхронизацией: ядро шлёт tokenExit только
 * токенам из region.tokens, а membership обновляется асинхронно — при быстром
 * пересоздании региона (toggle ауры) выход может не сработать и копии утекут.
 * @param {RegionDocument} region
 */
async function cleanupRegionEffects(region) {
  const scene = region.parent;
  const prefix = region.uuid;
  for (const token of scene.tokens) {
    const actor = token.actor;
    if (!actor) continue;
    const ids = actor.effects
      .filter(e => typeof e.origin === "string" && e.origin.startsWith(prefix))
      .map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}

/**
 * Приводит регионы одного токена в соответствие набору активных аур актёра.
 * @param {TokenDocument} token
 * @param {Map<string, {effect: ActiveEffect, params: object}>} auraMap
 */
async function syncTokenAuras(token, auraMap) {
  const scene = token.parent;
  if (!scene) return;

  const existing = scene.regions.filter(r => r.getFlag("dedrel", "aura")?.tokenId === token.id);
  const keep = new Set();
  const toDelete = [];

  for (const region of existing) {
    const meta = region.getFlag("dedrel", "aura");
    const desired = auraMap.get(meta.effectUuid);
    // !keep.has(...) — дедупликация: если у токена уже оставлен регион этой
    // ауры, любой второй с тем же маркером — утечка, удаляем вместе с его
    // эффектами (иначе каждый дубль вешает свою копию — бонусы задваиваются)
    if (desired && !keep.has(meta.effectUuid)
      && foundry.utils.equals(meta.params ?? {}, snapshotParams(desired.params))) {
      keep.add(meta.effectUuid);
    } else {
      // Ядро при удалении шлёт tokenExit токенам из region.tokens, но membership
      // обновляется асинхронно — зачищаем эффекты региона явно (идемпотентно
      // с exit-обработчиком: повторное удаление не находит эффектов).
      await cleanupRegionEffects(region);
      toDelete.push(region.id);
    }
  }
  if (toDelete.length) await scene.deleteEmbeddedDocuments("Region", toDelete);

  for (const [effectUuid, { effect, params }] of auraMap) {
    if (keep.has(effectUuid)) continue;
    const snapshot = snapshotParams(params);
    const { distance, distancePixels } = scene.dimensions;
    const center = token.getCenterPoint();
    const { elevation, depth, level } = token._source;
    // Круг от центра токена (как у шаблонов предметов), а НЕ createTokenEmanation:
    // эманация расширяет квадратный футпринт токена и выглядит квадратом со
    // скруглёнными углами. Благодаря attachment.token ядро само переносит формы
    // региона вместе с токеном (TokenDocument#computeAttachedRegionUpdates).
    await scene.createEmbeddedDocuments("Region", [{
      name: effect.name,
      color: snapshot.color ?? game.user.color,
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      shapes: [{
        type: "circle",
        x: center.x,
        y: center.y,
        radius: snapshot.radius * distancePixels,
        gridBased: true
      }],
      elevation: {
        bottom: elevation - snapshot.radius,
        top: elevation + (depth * distance) + snapshot.radius
      },
      attachment: { token: token.id },
      levels: [level].filter(l => l !== undefined && l !== null),
      flags: { dedrel: { aura: { effectUuid, tokenId: token.id, params: snapshot } } },
      behaviors: [{
        type: "dedrelAura",
        system: {
          sourceEffectUuid: effectUuid,
          disposition: snapshot.disposition,
          includeSelf: snapshot.includeSelf
        }
      }]
    }]);

    // Токены внутри (включая носителя) применять вручную НЕ нужно: сервер
    // выставляет _priorRegions при любом изменении token._regions, поэтому
    // после асинхронного обновления membership ядро само шлёт tokenEnter
    // всем, кто оказался внутри нового региона. Ручное применение здесь
    // гонялось бы с этим событием и давало бы дубли копий.
  }
}

/**
 * Полная синхронизация аур актёра на всех его токенах текущей сцены.
 * @param {Actor} actor
 */
async function syncActorAuras(actor) {
  const auraMap = getAuraEffects(actor);
  for (const token of actor.getActiveTokens(false, true)) {
    if (!token.persisted) continue;
    await syncTokenAuras(token, auraMap);
  }
}

/* --------------------------------------------------
 * Очередь синхронизации: правки эффектов приходят пачками
 * (например, экипировка брони гасит несколько эффектов разом),
 * поэтому запросы на актёра коалесцируются через debounce.
 * -------------------------------------------------- */

const pendingActors = new Set();

const flushPending = foundry.utils.debounce(async () => {
  const uuids = [...pendingActors];
  pendingActors.clear();
  for (const uuid of uuids) {
    const actor = foundry.utils.fromUuidSync(uuid);
    if (!actor) continue;
    try {
      await syncActorAuras(actor);
    } catch (err) {
      console.error(`Dedrel | Aura sync failed for ${uuid}:`, err);
    }
  }
}, 100);

function queueActorSync(actor) {
  if (!actor || !game.users.activeGM?.isSelf || !canvas.ready) return;
  pendingActors.add(actor.uuid);
  flushPending();
}

/** Возвращает актёра, которому принадлежит эффект (напрямую или через предмет). */
function actorOfEffect(effect) {
  let parent = effect.parent;
  if (parent?.documentName === "Item") parent = parent.parent;
  return parent?.documentName === "Actor" ? parent : null;
}

/** Затрагивает ли эффект (или диф его изменений) аура-маркер. */
function touchesAura(effect, changes) {
  if (effect.getFlag("dedrel", "aura")) return true;
  const dedrelFlags = changes?.flags?.dedrel;
  return !!dedrelFlags && (("aura" in dedrelFlags) || ("-=aura" in dedrelFlags));
}

/* --------------------------------------------------
 * Хуки жизненного цикла
 * -------------------------------------------------- */

Hooks.on("createActiveEffect", (effect) => {
  if (touchesAura(effect)) queueActorSync(actorOfEffect(effect));
});

Hooks.on("updateActiveEffect", (effect, changes) => {
  // Покрывает toggle disabled, правку параметров ауры и снятие флага
  if (touchesAura(effect, changes)) queueActorSync(actorOfEffect(effect));
});

Hooks.on("deleteActiveEffect", (effect) => {
  if (touchesAura(effect)) queueActorSync(actorOfEffect(effect));
});

// Экипировка/снятие предмета меняет isSuppressed его transfer-эффектов
// без отдельных хуков по эффектам — синкаем актёра при правке предмета с аурами.
function onItemChange(item) {
  if (item.parent?.documentName !== "Actor") return;
  if (!item.effects.some(e => e.getFlag("dedrel", "aura"))) return;
  queueActorSync(item.parent);
}
Hooks.on("createItem", onItemChange);
Hooks.on("updateItem", onItemChange);
Hooks.on("deleteItem", onItemChange);

// Носитель ауры выставлен на сцену. Удаление токена не обрабатываем:
// ядро само удаляет привязанные регионы и синтезирует tokenExit.
Hooks.on("createToken", (token) => {
  if (token.actor) queueActorSync(token.actor);
});

/**
 * Сверка состояния при загрузке сцены. Регионы персистятся в данных сцены,
 * поэтому пересоздавать их не нужно — нужно лечить рассинхрон, накопившийся
 * пока ГМ был оффлайн (события аур в это время не исполнялись):
 * 1) синк регионов по актёрам + удаление регионов-сирот;
 * 2) удаление протухших payload-эффектов (аура исчезла/носитель не рядом);
 * 3) наложение недостающих эффектов на токены внутри аур.
 */
Hooks.on("canvasReady", async () => {
  if (!game.users.activeGM?.isSelf) return;
  const scene = canvas.scene;
  if (!scene) return;

  try {
    // 0. Осколки ранних версий: маркер ауры, скопированный на ЧУЖОГО актёра
    // (старой кнопкой "Применить эффекты"). Сигнатура: актёрный эффект с флагом
    // aura, чей origin резолвится в предмет другого актёра. Такой осколок сам
    // становится излучателем ауры и задваивает бонусы — удаляем до синка.
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (!actor) continue;
      const junk = actor.effects.filter(e => {
        if (!e.getFlag("dedrel", "aura") || !e.origin) return false;
        const origin = foundry.utils.fromUuidSync(e.origin, { strict: false });
        return origin?.documentName === "Item" && origin.parent !== actor;
      }).map(e => e.id);
      if (junk.length) await actor.deleteEmbeddedDocuments("ActiveEffect", junk);
    }

    // 1. Синк всех актёров сцены (создаст недостающие регионы, удалит лишние)
    const actors = new Set();
    for (const token of scene.tokens) {
      if (token.actor) actors.add(token.actor);
    }
    for (const actor of actors) await syncActorAuras(actor);

    // Регионы-сироты: токен-носитель отсутствует на сцене
    const orphans = scene.regions.filter(r => {
      const meta = r.getFlag("dedrel", "aura");
      return meta && !scene.tokens.has(meta.tokenId);
    });
    for (const region of orphans) await cleanupRegionEffects(region);
    if (orphans.length) await scene.deleteEmbeddedDocuments("Region", orphans.map(r => r.id));

    // 2. Эффекты, чей behavior-источник исчез или чей носитель уже не рядом.
    // ВАЖНО: зачистка идёт ДО повторного применения (шаг 3): идемпотентность
    // проверяется по маркеру, и протухшая копия с origin от старого региона
    // иначе заблокировала бы наложение свежей.
    // Здесь же снимаются дубли одного маркера (гонки прошлых версий):
    // на актёре остаётся максимум одна копия каждой ауры.
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (!actor) continue;
      const seenMarkers = new Set();
      const stale = actor.effects.filter(e => {
        const marker = e.getFlag("dedrel", "auraApplied");
        if (!marker) return false;
        const behavior = foundry.utils.fromUuidSync(e.origin, { strict: false });
        if (!behavior || behavior.documentName !== "RegionBehavior") return true;
        if (behavior.disabled || behavior.region?.hidden || !behavior.region?.tokens.has(token)) return true;
        if (seenMarkers.has(marker)) return true;
        seenMarkers.add(marker);
        return false;
      }).map(e => e.id);
      if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    }

    // 3. Токены, вошедшие в ауры без ГМа: применяем эффекты (идемпотентно).
    // Скрытые регионы пропускаем: ядро при скрытии синтезирует tokenExit,
    // и аура считается выключенной, пока регион скрыт.
    for (const region of scene.regions) {
      if (region.hidden || !region.getFlag("dedrel", "aura")) continue;
      for (const behavior of region.behaviors) {
        if (behavior.type !== "dedrelAura" || behavior.disabled) continue;
        for (const token of region.tokens) {
          await behavior.system.applyAuraToToken(token);
        }
      }
    }
  } catch (err) {
    console.error("Dedrel | Aura reconciliation failed:", err);
  }
});
