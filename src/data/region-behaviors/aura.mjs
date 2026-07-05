/**
 * Поведение региона "Аура" (dedrelAura).
 * Вешается на регион-эманацию, привязанный к токену (см. src/canvas/aura-regions.mjs).
 * При входе токена в регион применяет к его актёру эффекты-payload ауры
 * (с фильтром по disposition), при выходе — снимает их.
 *
 * ВАЖНО: события регионов рассылаются сокетом ВСЕМ клиентам, поэтому обработчики
 * гейтятся на game.users.activeGM?.isSelf — логика исполняется ровно один раз
 * и с правами ГМа. Без подключённого ГМа автоматика не работает; рассинхрон
 * лечится сверкой на canvasReady (см. aura-regions.mjs).
 */

const fields = foundry.data.fields;

export default class DedrelAuraRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ["DEDREL.RegionBehaviors.Aura"];

  /**
   * disposition/includeSelf дублируются из flags.dedrel.aura эффекта-маркера,
   * чтобы обработка событий не зависела от резолва маркера. Слой синхронизации
   * пересоздаёт регион при изменении флага, поэтому значения не расходятся.
   */
  static defineSchema() {
    return {
      sourceEffectUuid: new fields.DocumentUUIDField({ type: "ActiveEffect" }),
      disposition: new fields.StringField({
        required: true,
        choices: {
          all: "DEDREL.Aura.Dispositions.all",
          friendly: "DEDREL.Aura.Dispositions.friendly",
          hostile: "DEDREL.Aura.Dispositions.hostile"
        },
        initial: "all"
      }),
      includeSelf: new fields.BooleanField({ initial: false })
    };
  }

  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this.#onTokenExit
  };

  /** @this {DedrelAuraRegionBehaviorType} */
  static async #onTokenEnter(event) {
    if (!game.users.activeGM?.isSelf) return;
    await this.applyAuraToToken(event.data.token);
  }

  /** @this {DedrelAuraRegionBehaviorType} */
  static async #onTokenExit(event) {
    if (!game.users.activeGM?.isSelf) return;
    await this.removeAuraFromToken(event.data.token);
  }

  /**
   * Применяет payload-эффекты ауры к актёру токена. Идемпотентно: повторный
   * вызов для токена, уже получившего эффекты этой ауры, ничего не делает.
   * Публичный метод: вызывается и из обработчика tokenEnter, и из сверки
   * состояния на canvasReady.
   * @param {TokenDocument} token
   */
  async applyAuraToToken(token) {
    const actor = token?.actor;
    if (!actor) return;

    const sourceToken = this.region?.attachment?.token ?? null;
    if (!sourceToken) return;

    if (token.id === sourceToken.id) {
      if (!this.includeSelf) return;
    } else if (!this.#matchesDisposition(sourceToken, token)) {
      return;
    }

    // Идемпотентность по маркеру, а не по uuid behavior'а: при пересоздании
    // региона (toggle, правка параметров) uuid меняется, и проверка по origin
    // приводила бы к накоплению дублей, если exit-событие не успело снять
    // старую копию. Один маркер — максимум одна копия на актёре.
    if (actor.effects.some(e => e.getFlag("dedrel", "auraApplied") === this.sourceEffectUuid)) return;

    const payload = await this.#getPayloadEffects();
    if (!payload.length) return;

    const toCreate = payload.map(e => this.#cloneEffectData(e));
    await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
  }

  /**
   * Снимает с актёра токена все эффекты, навешенные этой аурой.
   * Без повторной проверки disposition — так снятие устойчиво к смене
   * disposition, пока токен находился внутри зоны.
   * @param {TokenDocument} token
   */
  async removeAuraFromToken(token) {
    const actor = token?.actor;
    if (!actor) return;
    const ids = actor.effects.filter(e => e.origin === this.behavior.uuid).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  /**
   * Проверка disposition цели относительно токена-источника:
   * friendly — совпадает с источником; hostile — противоположен
   * (осмысленно только для FRIENDLY/HOSTILE; NEUTRAL/SECRET-источник
   * в режиме hostile не матчит никого); all — любой.
   */
  #matchesDisposition(sourceToken, targetToken) {
    const D = CONST.TOKEN_DISPOSITIONS;
    switch (this.disposition) {
      case "friendly":
        return targetToken.disposition === sourceToken.disposition;
      case "hostile":
        return Math.abs(sourceToken.disposition) === D.FRIENDLY
          && targetToken.disposition === -sourceToken.disposition;
      default:
        return true;
    }
  }

  /**
   * Собирает список эффектов-payload:
   * 1) явный список uuid из flags.dedrel.aura.effects маркера (если задан);
   * 2) иначе — sibling-эффекты того же предмета с flags.dedrel.applyTo = "aura".
   * Возвращает [] если маркер удалён или отключён.
   */
  async #getPayloadEffects() {
    const marker = await foundry.utils.fromUuid(this.sourceEffectUuid);
    if (!marker?.active) return [];

    const aura = marker.getFlag("dedrel", "aura") ?? {};
    if (Array.isArray(aura.effects) && aura.effects.length) {
      const resolved = await Promise.all(aura.effects.map(u => foundry.utils.fromUuid(u)));
      return resolved.filter(e => e);
    }

    let item = marker.parent;
    if (item?.documentName !== "Item" && marker.origin) {
      const origin = await foundry.utils.fromUuid(marker.origin);
      if (origin?.documentName === "Item") item = origin;
    }
    const siblings = item?.documentName === "Item"
      ? item.effects.filter(e => e.getFlag("dedrel", "applyTo") === "aura")
      : [];
    if (siblings.length) return siblings;

    // Одноэффектный авторинг: если отдельных payload-эффектов нет, аура раздаёт
    // изменения самого маркера. Флаг aura зачищается при клонировании, чтобы
    // получатель не стал носителем ауры. Маркер держится с transfer: false и
    // сам ни на кого не действует — носитель получает payload только через
    // includeSelf (тем же region-путём, что и остальные получатели).
    const markerChanges = marker._source.system?.changes ?? marker._source.changes ?? [];
    return markerChanges.length ? [marker] : [];
  }

  /**
   * Клонирует данные эффекта для наложения на получателя.
   * ВАЖНО (V14, QUIRKS §11): changes живут в system.changes; легаси
   * data.changes удаляем, чтобы не сработал deprecated-шим.
   * Фаза "apply" для system.*-изменений проставится автоматически
   * хуком preCreateActiveEffect (см. dedrel.mjs).
   */
  #cloneEffectData(effect) {
    const data = effect.toObject();
    delete data._id;
    const changes = foundry.utils.deepClone(
      effect._source.system?.changes ?? effect._source.changes ?? []
    );
    delete data.changes;
    foundry.utils.setProperty(data, "system.changes", changes);
    data.origin = this.behavior.uuid;
    data.transfer = false;
    data.disabled = false;
    // applyTo: "aura" и маркер-флаг aura имеют смысл только на предмете-источнике
    if (data.flags?.dedrel?.applyTo) delete data.flags.dedrel.applyTo;
    if (data.flags?.dedrel?.aura) delete data.flags.dedrel.aura;
    foundry.utils.setProperty(data, "flags.dedrel.auraApplied", this.sourceEffectUuid);
    return data;
  }
}
