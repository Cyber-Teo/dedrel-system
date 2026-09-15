export default class DedrelActor extends Actor {
  /**
   * Ключи типов существа, которые несёт актёр (по вложенным Item creature_type).
   * Используется для бонуса оружия/эффектов «против типа» и как индикатор на листе.
   * @returns {string[]}
   */
  get creatureTypeKeys() {
    const keys = [];
    for (const item of this.items) {
      if (item.type === "creature_type" && item.system?.key) keys.push(item.system.key);
    }
    return keys;
  }

  async _preCreate(data, options, userId) {
    await super._preCreate(data, options, userId);
    
    // Setup default token settings for new actors
    if (this.type === "character" && userId === game.user.id) {
      const prototypeToken = {
        actorLink: true,
        vision: true,
        displayName: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        bar1: { attribute: "resources.hp" }
      };
      this.updateSource({ prototypeToken });
    }
  }

  async _preUpdate(changed, options, user) {
    // Баланс кошелька не может быть отрицательным: любые отрицательные счётчики
    // валют в обновлении зажимаем в 0. Ловит все пути записи (инлайн-инпуты
    // листа с обходом client-side min="0", сокет-переводы, депозит монет).
    this.#clampCurrencyUpdate(changed);
    return super._preUpdate(changed, options, user);
  }

  /** Зажимает отрицательные значения system.currency.* в 0 в объекте обновления. */
  #clampCurrencyUpdate(changed) {
    if (!changed || typeof changed !== "object") return;
    const clampObj = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const k of Object.keys(obj)) {
        const v = Number(obj[k]);
        if (Number.isFinite(v) && v < 0) obj[k] = 0;
      }
    };
    for (const key of Object.keys(changed)) {
      // Отдельный счётчик валюты: "system.currency.<key>".
      if (key.startsWith("system.currency.")) {
        const v = Number(changed[key]);
        if (Number.isFinite(v) && v < 0) changed[key] = 0;
      }
      // Кошелёк целиком плоским ключом: "system.currency": { <key>: value }.
      else if (key === "system.currency") clampObj(changed[key]);
    }
    // Кошелёк целиком вложенным объектом: system.currency = { <key>: value }.
    clampObj(changed?.system?.currency);
  }

  /**
   * Ядро применяет здесь фазу "initial" (в super). Сразу после неё выполняем
   * нашу фазу "apply" — в ней живут все изменения системных полей (system.*),
   * автоматически помечаемые хуком preCreateActiveEffect. Обе фазы отрабатывают
   * ДО prepareDerivedData, поэтому баффы характеристик участвуют в расчёте
   * производных, а бонусы к производным полям переживают паттерн "+=".
   */
  prepareEmbeddedDocuments() {
    super.prepareEmbeddedDocuments();
    this.applyActiveEffects("apply");
  }

  /**
   * Расширение ядра: транслируемые (transfer) эффекты ЭКИПИРУЕМЫХ предметов
   * применяются к актору только пока предмет экипирован. Ядро само такого
   * подавления не делает (isSuppressed по умолчанию false — это обязанность
   * системы), поэтому без гейта зачарованный меч баффал бы владельца из рюкзака.
   *
   *  - Аксессуары (непустой system.equip_slot: кольца, амулеты, шлемы-аксессуары):
   *    «экипирован» = id стоит в одном из system.equipment_slots актора.
   *  - Оружие: system.equipped (выставляется листом при взятии в руки/хвост).
   *  - Броня тела (armor без equip_slot): id стоит в одном из слоёв брони.
   *
   * Прочие предметы (мутации, таланты, зелья и т.п.) ведут себя как в ядре —
   * их transfer-эффекты применяются, пока предмет в инвентаре. На акторах без
   * equipment_slots (лут/контейнер) гейтится только оружие (по system.equipped).
   */
  *allApplicableEffects() {
    for (const effect of this.effects) yield effect;
    for (const item of this.items) {
      if (!this.itemEffectsActive(item)) continue;
      for (const effect of item.effects) {
        if (effect.transfer) yield effect;
      }
    }
  }

  /**
   * Действуют ли сейчас transfer-эффекты предмета на этого актора (правила гейта
   * описаны в allApplicableEffects). Вынесено отдельным методом, чтобы тумблер
   * света (DedrelItem#use) судил об экипировке по тем же правилам, а не по своим.
   * @param {Item} item
   * @returns {boolean}
   */
  itemEffectsActive(item) {
    const slots = this.system?.equipment_slots;
    const inSlot = () => Object.values(slots).some(s => s?.item_id === item.id);
    if (slots && item.system?.equip_slot) return inSlot();
    if (item.type === "weapon") return !!item.system?.equipped;
    if (slots && item.type === "armor") return inSlot();
    return true;
  }

  prepareData() {
    super.prepareData();
    if (this.type === "character" && this.system.senses) {
      const darkvision = this.system.senses.darkvision || 0;
      if (darkvision > 0) {
        this.prototypeToken.updateSource({
          "sight.visionMode": "darkvision",
          "sight.range": darkvision
        });
      } else {
        this.prototypeToken.updateSource({
          "sight.visionMode": "basic",
          "sight.range": 0
        });
      }
    }
  }

  _syncVisionToTokens() {
    if (this.type !== "character" || !this.isOwner) return;
    
    const protoSight = this.prototypeToken.sight;
    const tokens = this.getActiveTokens();
    
    for (let t of tokens) {
      const tSight = t.document.sight;
      if (tSight.visionMode !== protoSight.visionMode || tSight.range !== protoSight.range) {
        t.document.update({
          "sight.visionMode": protoSight.visionMode,
          "sight.range": protoSight.range
        });
      }
    }
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (game.user.id === userId) {
      this._syncVisionToTokens();
      this.#clearSlotsForDeletedItems(collection, ids);
    }
  }

  /**
   * Чистит ссылки в equipment_slots на удалённые предметы. Без этого удаление
   * экипированного оружия/аксессуара оставляет «мёртвый» item_id: слот в UI
   * рисуется пустым (лист резолвит id → null), но проверки, читающие сырую
   * строку, считают его занятым (ложное «нужны обе руки», см. character-sheet).
   */
  #clearSlotsForDeletedItems(collection, ids) {
    if (collection !== "items") return;
    const slots = this.system?.equipment_slots;
    if (!slots) return;
    const gone = new Set(ids);
    const updates = {};
    for (const [key, slot] of Object.entries(slots)) {
      if (slot?.item_id && gone.has(slot.item_id)) {
        updates[`system.equipment_slots.${key}.item_id`] = "";
      }
    }
    if (Object.keys(updates).length) this.update(updates);
  }

  /**
   * Применяет урон с учётом снижения урона (DR) по типу, бронебойности и временных ХП.
   * Единая точка входа для кнопки урона в чате (src/chat.mjs) и тиков кондиций
   * (src/combat.mjs) — математика DR должна оставаться одинаковой.
   * @param {number} damage - входящий урон до снижения
   * @param {object} [options]
   * @param {string} [options.drKey] - тип урона (ключ system.dr), "" — без снижения
   * @param {number} [options.apLevel] - уровень бронебойности (каждый уровень гасит 10% DR)
   * @param {string[]} [options.bypassTypes] - типы существ, чей DR игнорирует оружие-вскрыватель
   * @returns {Promise<{applied: number, blocked: number, tempHpDamage: number}>}
   */
  async applyDamage(damage, { drKey = "", apLevel = 0, bypassTypes = [] } = {}) {
    const isPeon = this.type === "npc" && this.system.tier === "peon";
    if (!isPeon && !this.system.resources?.hp) return { applied: 0, blocked: 0, tempHpDamage: 0 };

    let drUnits = 0;
    if (drKey && this.system.dr && this.system.dr[drKey] !== undefined) {
      drUnits = this.system.dr[drKey];

      // Вскрыватель типа: если оружие настроено против одного из типов цели,
      // вычитаем ровно тот DR, что дал этот тип (сумма его эффектов по drKey) —
      // существо бьётся «как обычная плоть», броня/прочее остаются.
      // См. _rules/18. Enemies.md §Вскрыватель типа.
      if (bypassTypes.length) {
        drUnits -= this.#creatureTypeDrContribution(drKey, bypassTypes);
      }
    }

    // Единица DR = 10% снижения; бронебойность вычитается плоско из процентов
    let drPercent = drUnits * 10;
    if (drPercent > 0) {
      drPercent = Math.max(0, drPercent - apLevel * 10);
    }
    drPercent = Math.min(drPercent, 100);

    // Округление до десятых, чтобы избежать длинных дробей
    let finalDamage = Math.max(0, damage * (1 - drPercent / 100));
    finalDamage = Math.round(finalDamage * 10) / 10;
    const blocked = Math.round((damage - finalDamage) * 10) / 10;

    // Пеон: здоровье в «попаданиях». Урон ПОСЛЕ DR сравнивается с порогом
    // прочности; попадание ≥ toughness снимает ровно 1 хит, слабее — 0.
    // Дробный остаток от DR округляется вверх до целого: пеон не должен выживать
    // из-за 2.9 против Прочности 3 — считаем в пользу атакующего.
    if (isPeon) {
      const hits = this.system.resources.hits;
      const toughness = this.system.toughness || 0;
      const peonDamage = Math.ceil(finalDamage);
      const removed = peonDamage >= toughness && peonDamage > 0 ? 1 : 0;
      if (removed > 0) {
        await this.update({ "system.resources.hits.value": Math.max(0, hits.value - removed) });
      }
      return { applied: removed, blocked, tempHpDamage: 0, hitsRemoved: removed };
    }

    const currentHp = this.system.resources.hp.value;
    let tempHp = this.system.resources.hp.temp || 0;
    let tempHpDamage = 0;
    if (tempHp > 0) {
      tempHpDamage = Math.min(tempHp, finalDamage);
      tempHp -= tempHpDamage;
      finalDamage -= tempHpDamage;
    }

    const updates = { "system.resources.hp.value": Math.max(0, currentHp - finalDamage) };
    if (tempHpDamage > 0) {
      updates["system.resources.hp.temp"] = tempHp;
    }
    await this.update(updates);

    return { applied: finalDamage + tempHpDamage, blocked, tempHpDamage };
  }

  /**
   * Сколько DR по типу урона drKey дали активные эффекты Item'ов creature_type,
   * чьи ключи есть в bypassTypes. Источник истины — сами change-строки типа,
   * поэтому дублировать DR в отдельный слой не нужно (см. applyDamage).
   * @param {string} drKey
   * @param {string[]} bypassTypes
   * @returns {number} суммарные единицы DR, дарованные совпавшими типами
   */
  #creatureTypeDrContribution(drKey, bypassTypes) {
    const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
    const targetKey = `system.dr.${drKey}`;
    let sum = 0;
    for (const item of this.items) {
      if (item.type !== "creature_type" || !bypassTypes.includes(item.system.key)) continue;
      for (const effect of item.effects) {
        if (effect.disabled) continue;
        for (const change of effect.changes) {
          if (change.key === targetKey && change.mode === ADD) sum += Number(change.value) || 0;
        }
      }
    }
    return sum;
  }

  /**
   * Восстанавливает ХП с капом по максимуму. Общая точка для кнопки исцеления
   * в чате (src/chat.mjs) и лечащих тиков кондиций (src/combat.mjs).
   * @param {number} amount
   * @returns {Promise<number>} фактически восстановленные ХП
   */
  async applyHealing(amount) {
    const hp = this.system.resources?.hp;
    if (!hp || amount <= 0) return 0;
    const newHp = Math.min(hp.max, hp.value + amount);
    const healed = newHp - hp.value;
    if (healed > 0) await this.update({ "system.resources.hp.value": newHp });
    return healed;
  }

  /**
   * Выдаёт временные хиты (правила: "_rules/9. Combat and Damage.md" §4).
   * Выдачи из разных источников СКЛАДЫВАЮТСЯ; сгорают на любом отдыхе
   * (performRest) или выбиваются уроном (applyDamage снимает их первыми).
   * Прямой апдейт source, НЕ Active Effect: эффект пересчитывался бы каждый
   * prepareData и "отращивал" бы буфер после каждого поглощения урона.
   * @param {number} amount
   * @returns {Promise<number>} фактически выданные временные хиты
   */
  async grantTempHp(amount) {
    const hp = this.system.resources?.hp;
    if (!hp || amount <= 0) return 0;
    await this.update({ "system.resources.hp.temp": (hp.temp || 0) + amount });
    return amount;
  }

  /* -------------------------------------------- */
  /*  Стакающиеся кондиции                         */
  /* -------------------------------------------- */

  /**
   * Находит эффект одиночного статуса на актёре — тем же способом,
   * что и ядро в Actor#toggleStatusEffect (наши статусы без статичного _id).
   * @param {string} statusId
   * @returns {ActiveEffect|null}
   */
  #findStatusEffect(statusId) {
    return this.effects.find(e => (e.statuses.size === 1) && e.statuses.has(statusId)) ?? null;
  }

  /**
   * Масштабирует change-строки статуса под число стаков: числовые значения
   * с режимом ADD умножаются на количество стаков, остальные режимы
   * (OVERRIDE, UPGRADE и т.д.) и нечисловые значения остаются базовыми.
   *
   * ВАЖНО (V14): тип изменения хранится в строковом `change.type` ("add",
   * "override", ...), а НЕ в числовом `change.mode` — последний в V14 лишь
   * deprecated-геттер-шим, которого к тому же нет на «сырых» объектах из
   * CONFIG.statusEffects. Проверка по `mode` здесь всегда давала undefined,
   * поэтому эффекты не масштабировались (масштабировался только тик-урон,
   * идущий отдельным путём через @stacks). Сверяемся со строковым type,
   * с запасной поддержкой легаси-`mode` на случай старых данных.
   */
  static #scaleStatusChanges(baseChanges, stacks) {
    return baseChanges.map(ch => {
      const num = Number(ch.value);
      const isAdd = (ch.type === "add") || (ch.mode === CONST.ACTIVE_EFFECT_MODES.ADD);
      if (isAdd && Number.isFinite(num)) {
        return { ...ch, value: String(num * stacks) };
      }
      return foundry.utils.deepClone(ch);
    });
  }

  /**
   * Пересчитывает эффект под новое число стаков: имя «Имя ×N», масштабированные
   * change-строки (пишем в system.changes — см. FOUNDRY V14 QUIRKS.md, раздел 11;
   * фазу "apply" доставит хук preUpdateActiveEffect) и счётчик во флаге.
   * При добавлении стака длительность отсчитывается заново.
   */
  async #updateConditionStacks(effect, status, stacks, { refreshDuration = false } = {}) {
    const update = {
      name: stacks > 1 ? `${status.name} ×${stacks}` : status.name,
      "flags.dedrel.stacks": stacks,
      "system.changes": DedrelActor.#scaleStatusChanges(status.changes ?? [], stacks)
    };
    if (refreshDuration) {
      // ВАЖНО (V14): остаток длительности вычисляется от объекта `start`
      // (round/turn/time/combat/combatant), а НЕ от полей duration.startRound/
      // startTime — их в схеме V14 нет вовсе (duration = {value, units, expiry}).
      // Прежний код писал в несуществующие поля, поэтому сброс не работал.
      // Переустанавливаем `start` на текущий момент каноническим методом ядра
      // (тем же, что и при создании эффекта) — это и есть «сброс таймера».
      update.start = effect.constructor.getEffectStart();
    }
    await effect.update(update);
    return effect;
  }

  /**
   * Накладывает стакающуюся кондицию или добавляет ей стак (до max_stacks).
   * @param {string} statusId - id статуса из CONFIG.statusEffects
   * @returns {Promise<ActiveEffect|boolean>}
   */
  async addConditionStack(statusId) {
    const status = CONFIG.statusEffects[statusId];
    if (!status) throw new Error(`Invalid status ID "${statusId}" provided to DedrelActor#addConditionStack`);

    const existing = this.#findStatusEffect(statusId);
    if (!existing) return super.toggleStatusEffect(statusId, { active: true });

    // Неактивный остаток (истёкший вне боя до срабатывания реестра или
    // выключенный вручную) не наращиваем — заменяем свежим наложением
    if (!existing.active) {
      await existing.delete();
      return super.toggleStatusEffect(statusId, { active: true });
    }

    const max = Math.max(1, status.flags?.dedrel?.max_stacks ?? 1);
    const stacks = existing.getFlag("dedrel", "stacks") ?? 1;
    if (stacks >= max) {
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.MaxStacksReached", { name: status.name, max }));
      return existing;
    }
    // Таймер длительности обновляем только если у кондиции включена опция
    // refresh_on_stack; иначе длительность идёт от первого наложения.
    const refreshDuration = status.flags?.dedrel?.refresh_on_stack ?? false;
    return this.#updateConditionStacks(existing, status, stacks + 1, { refreshDuration });
  }

  /**
   * Снимает один стак стакающейся кондиции; последний стак удаляет эффект.
   * @param {string} statusId - id статуса из CONFIG.statusEffects
   * @returns {Promise<ActiveEffect|null>}
   */
  async removeConditionStack(statusId) {
    const status = CONFIG.statusEffects[statusId];
    const existing = this.#findStatusEffect(statusId);
    if (!existing) return null;

    const stacks = existing.getFlag("dedrel", "stacks") ?? 1;
    if (!status || stacks <= 1) {
      await existing.delete();
      return null;
    }
    return this.#updateConditionStacks(existing, status, stacks - 1);
  }

  /**
   * Для стакающихся кондиций принудительная активация (active: true) поверх уже
   * висящего статуса добавляет стак вместо ядрового «уже активен» — так повторное
   * применение заклинания/эффекта из чата наращивает счётчик. Снятие (active: false)
   * и обычный toggle сохраняют поведение ядра; клики по HUD токена обрабатывает
   * DedrelTokenHUD (src/apps/token-hud.mjs).
   */
  async toggleStatusEffect(statusId, options = {}) {
    const status = CONFIG.statusEffects[statusId];
    if (status?.flags?.dedrel?.stackable && (options.active === true) && this.#findStatusEffect(statusId)) {
      return this.addConditionStack(statusId);
    }
    return super.toggleStatusEffect(statusId, options);
  }
}
