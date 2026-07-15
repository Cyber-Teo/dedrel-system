import { DedrelItemSheet } from "../sheets/item-sheet.mjs";
import { DedrelBonuses } from "../utils/dedrel-bonuses.mjs";
import { heldTwoHanded } from "../utils/grip.mjs";
import { SpellCalculator } from "../utils/spell-calculator.mjs";
import { hasTokenLightChanges } from "../config/effect-library.mjs";
const { DialogV2 } = foundry.applications.api;

/**
 * Расширенный класс Item для системы Dedrel.
 * Переопределяет стандартные методы предмета и добавляет кастомную логику,
 * такую как использование предметов (списание ОД) и отправку в чат с кнопками атаки/урона.
 */
export default class DedrelItem extends Item {
  
  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    
    if (userId !== game.user.id) return;
    if (!this.isEmbedded || !(this.parent instanceof Actor)) return;

    const addsItems = this.system.adds_items;
    if (!addsItems || !addsItems.length) return;

    const itemsToAdd = [];
    let itemNamesToFind = [];
    for (const item of addsItems) {
      if (item.includes(";")) {
        itemNamesToFind.push(...item.split(";").map(s => s.trim()).filter(s => s.length > 0));
      } else {
        if (item.trim().length > 0) itemNamesToFind.push(item.trim());
      }
    }
    
    if (itemNamesToFind.length === 0) return;
    
    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;
      
      const index = await pack.getIndex({ fields: ["system.key"] });
      for (let i = itemNamesToFind.length - 1; i >= 0; i--) {
        const itemName = itemNamesToFind[i];
        const entry = index.find(idx => idx.system?.key === itemName || idx.name === itemName);
        if (entry) {
          const itemDoc = await pack.getDocument(entry._id);
          const itemData = itemDoc.toObject();
          foundry.utils.setProperty(itemData, "flags.dedrel.parentItemId", this.id);
          itemsToAdd.push(itemData);
          itemNamesToFind.splice(i, 1);
        }
      }
      if (itemNamesToFind.length === 0) break;
    }
    
    if (itemNamesToFind.length > 0) {
      ui.notifications.warn(game.i18n.format("DEDREL.Notifications.ItemsNotFound", {names: itemNamesToFind.join(", ")}));
    }
    
    if (itemsToAdd.length > 0) {
      await this.parent.createEmbeddedDocuments("Item", itemsToAdd);
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.LinkedItemsAdded", {names: itemsToAdd.map(i => i.name).join(", ")}));
    }
  }

  async _onDelete(options, userId) {
    super._onDelete(options, userId);
    
    if (userId !== game.user.id) return;
    if (!this.isEmbedded || !(this.parent instanceof Actor)) return;
    
    const childItems = this.parent.items.filter(i => i.getFlag("dedrel", "parentItemId") === this.id);
    if (childItems.length > 0) {
      await this.parent.deleteEmbeddedDocuments("Item", childItems.map(i => i.id));
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.DependentItemsRemoved", {names: childItems.map(i => i.name).join(", ")}));
    }
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const usesMaxStr = this.system.uses_max || "0";
    const usesMax = parseInt(usesMaxStr, 10) || 0;
    this.system.has_charges = usesMax > 0;
  }

  /**
   * Метод активации/использования предмета (вызывается при клике по предмету или броске).
   * Проверяет необходимые ресурсы (Очки Действия), выбирает подходящее оружие и отправляет результат в чат.
   */
  async use() {
    const actor = this.actor;
    if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotOwned"));

    // Экранирование имён предметов/оружия перед вставкой в HTML диалогов
    // (имена задаются пользователем и потенциально содержат разметку).
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

    if (!["maneuver", "talent", "mutation", "spell", "magic_item", "weapon", "armor", "loot", "trade_good", "potion", "scroll"].includes(this.type)) {
      return this.postToChat();
    }

    // Светильник-тумблер: у предмета с собственным transfer-эффектом света
    // (факел, лампа) использование ПЕРЕКЛЮЧАЕТ свет (disabled эффекта), а не
    // накладывает копии на актёра. Свет — нативные change-строки token.light.*,
    // ядро применяет/гасит их само. Оружие/броню не трогаем (их use — атака,
    // а свет и так гейтится экипировкой); зелья и свитки — расходники.
    if (["magic_item", "loot", "trade_good"].includes(this.type)) {
      const lightEffects = this.effects.filter(e => e.transfer && hasTokenLightChanges(e));
      if (lightEffects.length) {
        const enable = lightEffects.some(e => e.disabled);
        for (const effect of lightEffects) await effect.update({ disabled: !enable });
        ui.notifications.info(game.i18n.format(
          enable ? "DEDREL.Notifications.LightOn" : "DEDREL.Notifications.LightOff",
          { name: this.name }
        ));
        return;
      }
    }

    // Свиток без привязанного заклинания использовать нельзя — открываем лист,
    // чтобы ГМ указал spell_id/spell_key (не тратим свиток впустую).
    if (this.type === "scroll" && !this.system.spell_id && !this.system.spell_key) {
      ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ScrollNoSpell"));
      return this.sheet.render(true);
    }

    // Ре-валидация собранного заклинания (Магический Конструктор): ранг доктрины
    // мог измениться после сохранения, активный путь может не совпадать со сборкой,
    // а поля предмета могли быть отредактированы руками. Рукотворные заклинания
    // без доктрины (или с доктриной вне конфига) проходят без проверки.
    if (this.type === "spell" && this.system.doctrine && CONFIG.DEDREL?.magic?.doctrines?.[this.system.doctrine]) {
      const proceed = await this.#validateSpellCast(actor);
      if (!proceed) return;
    }

    // Эффективная стоимость с учётом DSL-модификаторов и глобальной скидки.
    // apModApplied важен ниже: если бафф сделал манёвр бесплатным, нельзя
    // делать early-return — нужно пройти поток, чтобы сжечь бафф и отправить карточку.
    let { cost: apCost, modApplied: apModApplied } = DedrelBonuses.effectiveApCost(actor, this);

    // Точка расширения: макросы и модули могут скорректировать стоимость до диалога
    const hookCtx = { actor, item: this, apCost };
    Hooks.callAll("dedrelPreUseItem", hookCtx);
    apCost = hookCtx.apCost;

    
    // Проверка зарядов
    const usesMaxStr = this.system.uses_max || "0";
    const usesMax = parseInt(usesMaxStr, 10) || 0;
    const usesValue = this.system.uses_value || 0;
    const hasCharges = usesMax > 0;

    // Проверка на потребность в оружии
    let requiresWeapon = false;
    let validWeapons = [];
    
    if (this.type === "maneuver" || this.type === "spell") {
      const wType = this.system.req_weapon_type || {};
      const wDmg = this.system.req_weapon_damage_type || {};
      if (wType.melee || wType.ranged || wType.shield || wType.magic ||
          wDmg.piercing || wDmg.bludgeoning || wDmg.slashing) {
        requiresWeapon = true;
      }
      
      const wProp = this.system.req_weapon_property || {};
      if (Object.values(wProp).some(Boolean)) {
        requiresWeapon = true;
      }
      
      const reqSkill = this.system.req_weapon_skill_group || "";
      if (reqSkill && reqSkill !== "any") {
        requiresWeapon = true;
      }

      // Гейт по конкретному оружию: подстроки ищутся в system.key И в имени
      // (без регистра), совпадение любой подстроки достаточно. Магические и
      // материальные варианты проходят, пока наследуют базовый key/имя
      // ("adamantine_greatsword", «Адамантиновый двуручный меч»).
      const reqKeys = (this.system.req_weapon_keys || []).filter(k => k && k.trim());
      if (reqKeys.length > 0) {
        requiresWeapon = true;
      }

      if (requiresWeapon) {
        validWeapons = actor.items.filter(i => {
          if (i.type !== "weapon" || !i.system.equipped) return false;

          if (reqSkill && reqSkill !== "any" && i.system.skill !== reqSkill) return false;

          if (reqKeys.length > 0) {
            const wKey = (i.system.key || "").toLowerCase();
            const wName = i.name.toLowerCase();
            const matchKey = reqKeys.some(k => {
              const needle = k.trim().toLowerCase();
              return wKey.includes(needle) || wName.includes(needle);
            });
            if (!matchKey) return false;
          }

          const hasReqType = wType.melee || wType.ranged || wType.shield || wType.magic;
          if (hasReqType) {
            const wt = i.system.weapon_type || {};
            let matchType = (wt.melee && wType.melee) || (wt.ranged && wType.ranged) ||
                            (wt.shield && wType.shield) || (wt.magic && wType.magic);
            if (!matchType) return false;
          }

          const hasReqDmg = wDmg.piercing || wDmg.bludgeoning || wDmg.slashing;
          if (hasReqDmg) {
            const wd = i.system.damage_type || {};
            let matchDmg = (wd.piercing && wDmg.piercing) || (wd.bludgeoning && wDmg.bludgeoning) ||
                           (wd.slashing && wDmg.slashing);
            if (!matchDmg) return false;
          }

          // Требуемые свойства оружия (двуручное, быстрое, метательное и т.п.):
          // как и у типов оружия/урона, достаточно ЛЮБОГО из отмеченных (ИЛИ).
          // Между категориями требований действует «И». Флаги свойств у оружия
          // лежат плоско в system (is_twohanded, is_fast, ...).
          // is_twohanded — требование двуручного ХВАТА: истинно двуручное проходит
          // всегда, вариативный хват (is_variable_grip) — со свободной второй рукой.
          const requiredProps = Object.entries(wProp).filter(([, req]) => req).map(([p]) => p);
          if (requiredProps.length > 0) {
            const matchProp = requiredProps.some(p =>
              p === "is_twohanded" ? heldTwoHanded(actor, i) : !!i.system[p]
            );
            if (!matchProp) return false;
          }
          return true;
        });
      }
    }

    // Перезарядка: стоимость ОД диктует само оружие (system.reload_cost 1-3), а не
    // манёвр. Для отображения в диалоге берём первое валидное оружие; в колбэке
    // цена пересчитывается по фактически выбранному стволу (у актёра может быть
    // несколько перезаряжаемых). Так игрок не перезарядит аркебузу дёшево.
    const isReloadAction = this.type === "maneuver" && this.system.is_reload_action;
    if (isReloadAction && validWeapons.length > 0) {
      apCost = validWeapons[0].system.reload_cost || 1;
    }

    // Проверка расходуемых предметов.
    // ВАЖНО: боеприпас оружия (consume_target) здесь НЕ трогаем — оружие само по
    // себе не «стреляет». Выстрел = манёвр с req_weapon; боеприпас выбранного
    // оружия списывается в колбэке ниже. Иначе клик по оружию в инвентаре
    // (item.use → лист) превращался бы в диалог расхода боеприпаса.
    let consumeAmount = this.system.consume_amount || 1;
    let isSelfConsume = false;
    let hasEnoughAmmo = true;
    let consumesResources = false;

    if (this.system.properties?.consumed_on_use || this.system.consumable || this.type === "ammunition") {
      isSelfConsume = true;
      consumesResources = true;
      if ((this.system.quantity || 0) < consumeAmount) {
        hasEnoughAmmo = false;
      }
    }

    // Наличие self-эффектов тоже блокирует early-return:
    // их нужно применить через полный поток использования.
    const hasSelfEffects = this.effects.some(e => e.getFlag("dedrel", "applyTo") === "self");

    // Активная нагрузка (вшитое заклинание / лечение) тоже требует полного потока,
    // иначе жезл/амулет без зарядов и ОД просто открыл бы лист вместо срабатывания.
    const hasBoundSpell = (this.type === "scroll" || this.type === "magic_item")
      && (this.system.spell_id || this.system.spell_key);
    const hasActivePayload = hasBoundSpell || !!this.system.formula_heal;

    // Если предмет полностью пассивный, просто открываем его окно (чтобы не спамить в чат)
    const isPassiveSubtype = (this.type === "talent" || this.type === "mutation") && this.system.subtype === "passive";
    if (apCost === 0 && !hasCharges && !requiresWeapon && !consumesResources && !hasSelfEffects && !hasActivePayload && (isPassiveSubtype || this.type === "weapon" || this.type === "magic_item" || this.type === "armor" || this.type === "loot" || this.type === "trade_good" || this.type === "ammunition")) {
      return this.sheet.render(true);
    }

    // ВАЖНО: если бонус сделал манёвр бесплатным (apModApplied), НЕ делаем early-return.
    // Нужно продолжить поток, чтобы: 1) сжечь бафф, 2) отправить карточку в чат.
    if (apCost === 0 && !apModApplied && !hasCharges && !requiresWeapon && !consumesResources && !hasSelfEffects && !hasActivePayload) {
      return this.sheet.render(true);
    }

    // Подготовка диалогового окна
    let content = `<div style="margin-bottom: 15px;">`;
    
    let currentAp = 0;
    let apSpecific = 0;
    let specificApKey = "";
    
    let isVariable = this.system.is_variable_cost;
    let minAp = apCost;
    let maxAp = this.system.variable_cost_max || 99;

    if (apCost > 0 || isVariable) {
      let apUniversal = actor.system.resources?.ap_universal?.value || 0;
      // Специальный пул задействуем ТОЛЬКО если он есть в схеме актёра.
      // У NPC его нет (единый универсальный пул) → стоимость идёт с ap_universal,
      // и мы не пишем фантомный ключ в actor.update.
      if (this.type === "maneuver" && actor.system.resources?.ap_maneuver) {
        apSpecific = actor.system.resources.ap_maneuver.value || 0;
        specificApKey = "system.resources.ap_maneuver.value";
      } else if ((this.type === "spell" || this.type === "magic_item") && actor.system.resources?.ap_magic) {
        apSpecific = actor.system.resources.ap_magic.value || 0;
        specificApKey = "system.resources.ap_magic.value";
      }
      currentAp = apUniversal + apSpecific;
      
      if (isVariable) {
        maxAp = Math.min(maxAp, currentAp);
        const maxLabel = this.system.variable_cost_max || game.i18n.localize("DEDREL.Chat.VariableCostMax");
        content += `
          <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight: bold;">${game.i18n.format("DEDREL.Chat.VariableCostLabel", { min: minAp, max: maxLabel })}</label>
            <input type="number" id="use-ap-cost" value="${minAp}" min="${minAp}" max="${maxAp}" style="width: 100%; padding: 4px;">
          </div>
        `;
        content += `<p style="color: gray; font-size: 12px;">${game.i18n.format("DEDREL.Chat.AvailableAP", { current: currentAp })}</p>`;
      } else {
        content += `<p>${game.i18n.format("DEDREL.Chat.SpendAP", {name: esc(this.name), cost: apCost})}</p>`;
        if (apCost > currentAp) {
          content += `<p style="color: red; font-weight: bold;">${game.i18n.format("DEDREL.Chat.NotEnoughAPDialog", {current: currentAp, cost: apCost})}</p>`;
        }
      }
    }

    if (hasCharges) {
      content += `<p>${game.i18n.format("DEDREL.Chat.SpendCharge", {value: usesValue, max: usesMax})}</p>`;
      if (usesValue <= 0) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.localize("DEDREL.Chat.OutOfCharges")}</p>`;
      }
    }

    if (isSelfConsume) {
      if (!hasEnoughAmmo) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.localize("DEDREL.Notifications.ItemDepleted")}</p>`;
      } else {
        content += `<p>${game.i18n.format("DEDREL.Chat.WillBeConsumed", {name: esc(this.name), count: consumeAmount})}</p>`;
      }
    }

    if (requiresWeapon) {
      if (validWeapons.length > 0) {
        content += `
          <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight: bold;">${game.i18n.localize("DEDREL.Chat.Weapon")}</label>
            <select name="weaponId" id="use-weapon-select" style="width: 100%; padding: 4px;">
              ${validWeapons.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("")}
            </select>
          </div>
        `;
      } else {
        content += `<p style="color: orange; font-style: italic;">${game.i18n.localize("DEDREL.Chat.NoEquippedWeapon")}</p>`;
      }
    }

    content += `</div>`;

    await DialogV2.wait({
      window: { title: game.i18n.format("DEDREL.Chat.UseItem", {name: this.name}) },
      content: content,
      buttons: [
        {
          action: "confirm",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("DEDREL.Chat.Confirm"),
          callback: async (event, button, dialog) => {
            // Выбранное оружие резолвим один раз — нужно для цены перезарядки,
            // проверки заряда, расхода боеприпаса и карточки.
            let selWeapon = null;
            if (requiresWeapon) {
              const selEl = dialog.element.querySelector("#use-weapon-select");
              selWeapon = selEl?.value ? actor.items.get(selEl.value) : null;
            }

            let finalApCost = apCost;
            if (isVariable) {
              const inputEl = dialog.element.querySelector("#use-ap-cost");
              if (inputEl) finalApCost = parseInt(inputEl.value) || minAp;
            }
            // Перезарядка: фактическая цена ОД — из выбранного оружия, не из манёвра.
            if (isReloadAction && selWeapon) {
              finalApCost = selWeapon.system.reload_cost || 1;
            }

            // Выстрел из перезаряжаемого оружия: атакующий манёвр (цель — не сам
            // стрелок, с боевыми кнопками) перезаряжаемым стволом. Прицеливание и
            // прочие self-подготовки под это не подпадают. Из разряженного нельзя.
            const isReloadingShot = requiresWeapon && !isReloadAction
              && !!selWeapon?.system?.is_reloading
              && this.system.target_type !== "self"
              && !this.system.hide_combat_buttons;
            if (isReloadingShot && !selWeapon.system.loaded) {
              ui.notifications.warn(game.i18n.format("DEDREL.Notifications.WeaponNotLoaded", { name: selWeapon.name }));
              return;
            }

            if (finalApCost > 0 && finalApCost > currentAp) {
              ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughAP"));
              return;
            }
            if (hasCharges && usesValue <= 0) {
              ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughUses"));
              return;
            }
            if (!hasEnoughAmmo) {
              ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughAmmoOrItems"));
              return;
            }

            // Боеприпас ВЫБРАННОГО оружия (манёвр-выстрел с req_weapon). Резолвим и
            // валидируем ДО траты ОД, чтобы не списать ОД при пустом колчане.
            let weaponAmmo = null;
            let weaponAmmoAmount = 1;
            let ammoSnapshot = null;
            // Перезарядка боеприпас НЕ расходует (его тратит выстрел) — пропускаем.
            if (requiresWeapon && !isReloadAction) {
              if (selWeapon?.system?.consume_target) {
                weaponAmmo = actor.items.get(selWeapon.system.consume_target);
                weaponAmmoAmount = selWeapon.system.consume_amount || 1;
                if (!weaponAmmo || (weaponAmmo.system.quantity || 0) < weaponAmmoAmount) {
                  ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NotEnoughAmmoOrItems"));
                  return;
                }
                // Снапшот бонусов боеприпаса СЕЙЧАС — ниже он может быть удалён
                // (последняя единица), а бросок урона (карта атаки) читает эти
                // данные из флага сообщения уже после списания.
                const as = weaponAmmo.system;
                ammoSnapshot = {
                  ap: as.armor_piercing || 0,
                  dmg: as.damage_bonus || "",
                  dmgType: as.damage_bonus_type || "",
                  vs: as.vs_creature || {}
                };
              }
            }

            // Списание ОД
            if (finalApCost > 0) {
              let apUniversal = actor.system.resources?.ap_universal?.value || 0;
              let costLeft = finalApCost;
              let updates = {};
              
              if (specificApKey) {
                let specificSpend = Math.min(apSpecific, costLeft);
                updates[specificApKey] = apSpecific - specificSpend;
                costLeft -= specificSpend;
              }
              
              if (costLeft > 0) {
                let uniSpend = Math.min(apUniversal, costLeft);
                updates["system.resources.ap_universal.value"] = apUniversal - uniSpend;
              }
              
              await actor.update(updates);
            }
            
            // Сжигаем DSL-модификаторы стадии "use" (моды стоимости ОД).
            // Эффект с модами более поздних стадий (attack/damage) сгорит после
            // соответствующего броска, а не здесь.
            if (this.type === "maneuver" || this.type === "spell") {
              await DedrelBonuses.consumeStage(actor, this, "use");
            }


            // Списание Зарядов
            if (hasCharges) {
              await this.update({ "system.uses_value": usesValue - 1 });
            }

            // Списание предметов / боеприпасов
            // deleteSelfAfter: если сам предмет израсходован до нуля, НЕ удаляем его сразу —
            // ниже postToChat() обращается к this (this.name, this.actor, this.effects).
            // Удаляем в самом конце, после отправки карточки.
            let deleteSelfAfter = false;
            if (weaponAmmo) {
              // Данные для проверки сбора снимаем ДО возможного удаления предмета.
              const aName = weaponAmmo.name;
              const aType = weaponAmmo.system.ammo_type;
              const aRecovery = weaponAmmo.system.recovery_chance || 0;
              const newQty = Math.max(0, (weaponAmmo.system.quantity || 0) - weaponAmmoAmount);
              if (newQty <= 0) {
                await weaponAmmo.delete();
              } else {
                await weaponAmmo.update({ "system.quantity": newQty });
              }
              // Поломка/сбор: shot (порох) не подбирается. Иначе на каждую списанную
              // единицу кидаем recovery_chance и сообщаем, сколько уцелело.
              if (aType !== "shot" && weaponAmmoAmount > 0) {
                await this.#reportAmmoRecovery(actor, aName, aRecovery, weaponAmmoAmount);
              }
            }
            if (isSelfConsume) {
              const newQty = Math.max(0, (this.system.quantity || 0) - consumeAmount);
              if (newQty <= 0) {
                deleteSelfAfter = true;
              } else {
                await this.update({ "system.quantity": newQty });
              }
            }

            // Состояние заряда: выстрел разряжает ствол, перезарядка — заряжает.
            if (isReloadingShot && selWeapon) {
              await selWeapon.update({ "system.loaded": false });
            } else if (isReloadAction && selWeapon) {
              await selWeapon.update({ "system.loaded": true });
              ui.notifications.info(game.i18n.format("DEDREL.Notifications.WeaponReloaded", { name: selWeapon.name }));
            }

            const selectedWeaponId = requiresWeapon ? (selWeapon?.id ?? null) : null;

            // Применение шаблонных self-эффектов (flags.dedrel.applyTo = "self")
            // с подстановкой @spentAp / @apCost / @overspent.
            // Выполняется ДО макроса, чтобы аварийный люк (on_use_macro) видел уже применённый бафф.
            await this._applySelfEffects({ spentAp: finalApCost, apCost: this.system.ap_cost || 0 });

            // Вызов макроса если есть
            if (this.system.on_use_macro) {
              let macro = game.macros.find(m => m.name === this.system.on_use_macro);
              if (!macro) {
                if (this.system.on_use_macro.startsWith("Compendium.") || this.system.on_use_macro.startsWith("Macro.")) {
                  macro = await fromUuid(this.system.on_use_macro);
                } else {
                  for (let pack of game.packs.values()) {
                    if (pack.documentName === "Macro") {
                      const index = await pack.getIndex();
                      const entry = index.find(e => e.name === this.system.on_use_macro);
                      if (entry) {
                        macro = await pack.getDocument(entry._id);
                        break;
                      }
                    }
                  }
                }
              }
              
              if (macro) {
                // weapon — оружие/щит, выбранные игроком в диалоге использования (если требовалось)
                macro.execute({
                  actor: actor,
                  item: this,
                  spentAp: finalApCost,
                  weapon: selectedWeaponId ? actor.items.get(selectedWeaponId) : null
                });
              } else {
                ui.notifications.warn(game.i18n.format("DEDREL.Notifications.MacroNotFound", {name: this.system.on_use_macro}));
              }
            }

            // Свиток и magic_item со вшитым заклинанием кастуют его (эфемерная копия
            // на акторе), а не шлют собственную карточку. Списание/заряд уже сняты выше.
            const castsBoundSpell = this.type === "scroll"
              || (this.type === "magic_item" && (this.system.spell_id || this.system.spell_key));
            if (castsBoundSpell) {
              await this.#castBoundSpell();
            } else {
              await this.postToChat(selectedWeaponId, ammoSnapshot);
            }

            // Маркер концентрации (Длительность 4 ранга): эффект-напоминание на
            // кастере без авто-истечения, снимается вручную; потеря сознания
            // обрывает концентрацию (напоминание в описании эффекта).
            if (this.type === "spell") {
              await this._applyConcentrationMarker();
            }

            // Обработка цепных манёвров (заклинания с Типом действия "В цепи" тоже)
            if (this.type === "maneuver" || this.type === "spell") {
              const aType = this.system.action_type || {};
              if (aType.action || aType.chain || aType.reaction) {
                const showOutside = game.settings.get("dedrel", "showChainsOutsideCombat");
                if (game.combat?.started || showOutside) {
                  game.dedrel.chainHUD.showFor(actor, this);
                }
              }
            }

            // Удаляем полностью израсходованный предмет только теперь,
            // когда карточка уже отправлена и this больше не нужен.
            if (deleteSelfAfter) {
              await this.delete();
            }
          }
        },
        {
          action: "cancel",
          icon: "fa-solid fa-times",
          label: game.i18n.localize("DEDREL.Chat.Cancel")
        }
      ]
    });
  }

  /**
   * Находит заклинание, «запечатанное» в носителе (свиток или magic_item-жезл):
   * сначала по spell_id (предмет на акторе / в мире / по UUID), затем по spell_key
   * (компендиум заклинаний или мир).
   * @returns {Promise<Item|null>}
   */
  async #resolveBoundSpell() {
    const sys = this.system;
    if (sys.spell_id) {
      const onActor = this.actor?.items.get(sys.spell_id);
      if (onActor?.type === "spell") return onActor;
      const world = game.items.get(sys.spell_id);
      if (world?.type === "spell") return world;
      const byUuid = await fromUuid(sys.spell_id).catch(() => null);
      if (byUuid?.type === "spell") return byUuid;
    }
    if (sys.spell_key) {
      const pack = game.packs.get("dedrel.spells");
      if (pack) {
        const index = await pack.getIndex({ fields: ["system.key"] });
        const entry = index.find(e => e.system?.key === sys.spell_key);
        if (entry) return pack.getDocument(entry._id);
      }
      const world = game.items.find(i => i.type === "spell" && i.system.key === sys.spell_key);
      if (world) return world;
    }
    return null;
  }

  /**
   * Каст вшитого заклинания (свиток или magic_item-жезл): носитель даёт магию мимо
   * доктрины и ОД владельца. Создаём эфемерную копию заклинания на акторе (кнопки
   * карточки чата ищут предмет по id) и шлём её карточку напрямую через postToChat —
   * НЕ через use(), иначе нулевая стоимость открыла бы лист, а не отправила карточку,
   * и списались бы ОД. Эфемерный предмет чистится в конце боя (см. combat.mjs) или макросом.
   */
  async #castBoundSpell() {
    const source = await this.#resolveBoundSpell();
    if (!source) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ScrollSpellNotFound"));
    const actor = this.actor;
    if (!actor) return;

    const spellData = source.toObject();
    delete spellData._id;
    foundry.utils.setProperty(spellData, "flags.dedrel.ephemeral", true);
    foundry.utils.setProperty(spellData, "flags.dedrel.fromItem", this.name);

    const [ephemeral] = await actor.createEmbeddedDocuments("Item", [spellData]);
    await ephemeral.postToChat();
  }

  /**
   * Ре-валидация собранного заклинания перед кастом.
   * Проверяет ранг доктрины, совпадение активного пути со сборкой (с предложением
   * переключить путь) и пересчитывает стоимость из исходника сборки; расхождение
   * пересчёта с сохранённым ap_cost шепчется ГМу (ручная правка полей).
   * @returns {Promise<boolean>} false — каст отменён.
   */
  async #validateSpellCast(actor) {
    const sys = this.system;
    const config = CONFIG.DEDREL.magic;
    const doctrineState = actor.system.doctrines?.[sys.doctrine];
    const rank = doctrineState?.rank || 0;

    if (rank < (sys.doctrine_rank_req || 0)) {
      ui.notifications.error(game.i18n.format("DEDREL.Magic.UI.CastRankTooLow", {
        doctrine: game.i18n.localize(`DEDREL.Magic.Doctrines.${sys.doctrine}`),
        req: sys.doctrine_rank_req,
        have: rank
      }));
      return false;
    }

    // Несовпадение пути: предлагаем бесплатно переключиться (правило "в начале хода"
    // не энфорсим — социальный контроль, переключение публично видно в чате не нужно,
    // т.к. сам каст уже публичен)
    const doctrineCfg = config.doctrines[sys.doctrine];
    if (doctrineCfg.paths && sys.doctrine_path && doctrineState?.active_path !== sys.doctrine_path) {
      const confirm = await DialogV2.confirm({
        window: { title: this.name },
        content: `<p>${game.i18n.format("DEDREL.Magic.UI.CastPathMismatch", {
          spellPath: game.i18n.localize(`DEDREL.Magic.Paths.${sys.doctrine_path}`),
          activePath: game.i18n.localize(`DEDREL.Magic.Paths.${doctrineState?.active_path || ""}`)
        })}</p>`,
        modal: true
      });
      if (!confirm) return false;
      await actor.update({ [`system.doctrines.${sys.doctrine}.active_path`]: sys.doctrine_path });
    }

    const build = {
      doctrine: sys.doctrine,
      path: sys.doctrine_path,
      sourceScale: sys.source_scale,
      techniques: sys.chosen_techniques || [],
      modifiers: (sys.chosen_modifiers || []).map(m => ({ key: m.key, rank: m.rank, option: m.option }))
    };
    const result = SpellCalculator.calculate(build, SpellCalculator.contextFromActor(actor, sys.doctrine), config);
    if (!result.valid) {
      ui.notifications.error(`${game.i18n.localize("DEDREL.Magic.UI.CastInvalid")} ${SpellCalculator.localizeErrors(result.errors).join(" ")}`);
      return false;
    }

    if (result.totalAp !== sys.ap_cost) {
      const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
      if (gmIds.length) {
        ChatMessage.create({
          whisper: gmIds,
          content: `<div class="dedrel-item-chat"><p>${game.i18n.format("DEDREL.Magic.UI.CastCostMismatch", {
            name: foundry.utils.escapeHTML(this.name),
            actor: foundry.utils.escapeHTML(actor.name),
            saved: sys.ap_cost,
            calc: result.totalAp
          })}</p></div>`
        });
      }
    }
    return true;
  }

  /**
   * Вешает на кастера эффект-напоминание «Концентрация: <заклинание>», если
   * в сборке выбран Модификатор Длительность 4 ранга (концентрация).
   * Без авто-истечения: снимается вручную (HUD статусов); механического
   * обрыва по потере сознания в v1 нет — только напоминание в описании.
   */
  async _applyConcentrationMarker() {
    const actor = this.actor;
    if (!actor) return;
    const durationMod = (this.system.chosen_modifiers || []).find(m => m.key === "duration" && m.rank === 4);
    if (!durationMod) return;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.format("DEDREL.Magic.UI.ConcentrationMarker", { name: this.name }),
      img: this.img,
      description: game.i18n.localize("DEDREL.Magic.UI.ConcentrationHint"),
      transfer: false,
      origin: this.uuid,
      flags: { dedrel: { concentration: this.name } }
    }]);
  }

  /**
   * Применяет к владельцу шаблонные эффекты предмета, помеченные
   * flags.dedrel.applyTo = "self". Это механизм переменной стоимости:
   * «потраченные ОД конвертируются в параметр» без макросов.
   *
   * Плейсхолдеры, подставляемые в changes[].value, name и description:
   *   @spentAp   — фактически потраченные ОД (ввод игрока при переменной стоимости)
   *   @apCost    — базовая стоимость манёвра
   *   @overspent — ОД, потраченные сверх базовой стоимости
   * Если после подстановки значение — чистая арифметика (например "@spentAp * 2"),
   * оно вычисляется через Roll.safeEval, чтобы в эффект попало готовое число.
   *
   * @param {{spentAp: number, apCost: number}} context
   */
  async _applySelfEffects(context) {
    const actor = this.actor;
    if (!actor) return;

    const selfEffects = this.effects.filter(e => e.getFlag("dedrel", "applyTo") === "self");
    if (selfEffects.length === 0) return;

    const spentAp = context.spentAp ?? 0;
    const baseCost = context.apCost ?? 0;
    const tokens = {
      "@spentAp": String(spentAp),
      "@apCost": String(baseCost),
      "@overspent": String(Math.max(0, spentAp - baseCost))
    };

    const substitute = (str) => {
      if (typeof str !== "string") return str;
      let out = str;
      for (const [token, value] of Object.entries(tokens)) {
        out = out.replaceAll(token, value);
      }
      return out;
    };

    const effectsData = selfEffects.map(e => {
      const data = e.toObject();
      delete data._id;
      // V14: changes живут в system.changes (см. QUIRK 11/12). Берём исходные
      // изменения из нового места с fallback, подставляем плейсхолдеры и
      // записываем ОБРАТНО в system.changes. Легаси top-level data.changes
      // удаляем, чтобы миграция ядра не затёрла им system.changes.
      const srcChanges = e._source.system?.changes ?? e._source.changes ?? [];
      const newChanges = foundry.utils.deepClone(srcChanges).map(c => {
        let value = substitute(c.value);
        if (typeof value === "string" && /\d/.test(value) && /^[\d\s+\-*/().]+$/.test(value)) {
          try {
            value = String(Roll.safeEval(value));
          } catch (err) {
            console.warn(`Dedrel | Не удалось вычислить значение эффекта "${value}"`, err);
          }
        }
        return { ...c, value };
      });
      delete data.changes;
      data.system = { ...(data.system || {}), changes: newChanges };
      data.name = substitute(data.name);
      if (data.description) data.description = substitute(data.description);
      data.origin = this.uuid;
      data.transfer = false;
      return data;
    });

    await actor.createEmbeddedDocuments("ActiveEffect", effectsData);
    ui.notifications.info(game.i18n.format("DEDREL.Notifications.SelfEffectApplied", {
      names: effectsData.map(e => foundry.utils.escapeHTML(e.name)).join(", ")
    }));
  }

  /**
   * Проверка сбора боеприпаса после выстрела: на каждую списанную единицу кидаем
   * d100, уцелевшие (результат ≤ recovery_chance) можно подобрать нарративно.
   * Сообщение в чат носит информативный характер — предмет-«россыпь» не создаётся.
   * @param {Actor} actor
   * @param {string} name  - имя боеприпаса (снято до возможного удаления)
   * @param {number} chance - шанс сохранности, %
   * @param {number} count - сколько единиц списано за выстрел
   */
  async #reportAmmoRecovery(actor, name, chance, count) {
    const roll = new Roll(`${count}d100`);
    await roll.evaluate();
    const results = roll.dice[0]?.results?.map(r => r.result) || [];
    const recovered = results.filter(v => v <= chance).length;
    const esc = foundry.utils.escapeHTML;

    let content;
    if (count === 1) {
      content = recovered
        ? game.i18n.format("DEDREL.Ammo.RecoverySurvived", { name: esc(name) })
        : game.i18n.format("DEDREL.Ammo.RecoveryBroken", { name: esc(name) });
    } else {
      content = game.i18n.format("DEDREL.Ammo.RecoveryPartial", { name: esc(name), recovered, count });
    }

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="dedrel-ammo-recovery">${content}</div>`,
      rolls: [roll]
    });
  }

  /**
   * Отправляет карточку предмета в чат. Боевые кнопки (Атака/Урон) добавляются только боевым предметам.
   * @param {string|null} weaponId - ID выбранного оружия (если есть)
   */
  async postToChat(weaponId = null, ammoSnapshot = null) {
    let weaponAttr = weaponId ? `data-weapon-id="${weaponId}"` : "";
    
    let showCombatButtons = false;
    let reqWeapon = false;
    const isSpell = this.type === "spell";
    if (this.type === "maneuver" || isSpell) {
       const wType = this.system.req_weapon_type || {};
       const wDmg = this.system.req_weapon_damage_type || {};
       const reqSkill = this.system.req_weapon_skill_group || "";
       const reqKeys = (this.system.req_weapon_keys || []).filter(k => k && k.trim());
       // "any" не считается требованием конкретного оружия (согласовано с use()).
       reqWeapon = (wType.melee || wType.ranged || wType.shield || wType.magic ||
                          wDmg.piercing || wDmg.bludgeoning || wDmg.slashing ||
                          reqKeys.length > 0 ||
                          (reqSkill !== "" && reqSkill !== "any"));

       // Заклинания ВСЕГДА требуют фокус (weapon с типом magic), поэтому требование
       // оружия не признак боевой карточки — смотрим только на формулы/спасбросок,
       // иначе утилитарные заклинания получали бы бессмысленные кнопки Атаки/Урона.
       if (isSpell) {
         showCombatButtons = !!(this.system.formula_attack || this.system.formula_damage || this.system.save_attribute);
       } else if (reqWeapon || this.system.formula_attack || this.system.formula_damage || this.system.save_attribute || this.system.skill) {
         showCombatButtons = true;
       }
       if (this.system.hide_combat_buttons) {
         showCombatButtons = false;
       }
    }

    let buttons = "";
    if (showCombatButtons || this.system.formula_heal) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
      `;
      // Атака: у заклинаний — только если есть формула атаки или урон (бросок
      // по навыку "Магические атаки"); у манёвров — как раньше
      const showAttack = isSpell
        ? (this.system.formula_attack || this.system.formula_damage)
        : (this.system.formula_attack || reqWeapon || this.system.skill);
      if (showCombatButtons && showAttack) {
        buttons += `<button class="dedrel-chat-action" data-action="rollAttack" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-crosshairs"></i> ${game.i18n.localize("DEDREL.Chat.Attack")}</button>`;
      }
      if (showCombatButtons && (this.system.formula_damage || (!isSpell && reqWeapon))) {
        // Вариативный хват: отдельная кнопка урона «двуручным хватом» (+1 ступень
        // Лестницы). Свободна ли рука — проверяется в момент клика (chat.mjs),
        // потому что экипировка могла измениться после отправки карточки.
        // Если манёвр ТРЕБУЕТ двуручный хват (req_weapon_property.is_twohanded),
        // обычная кнопка урона для вариативного оружия прячется — одноручный
        // бросок с такого манёвра всегда был бы неправильным.
        const cardWeapon = weaponId ? this.actor?.items.get(weaponId) : null;
        const variableGrip = !!(cardWeapon?.system?.is_variable_grip && !cardWeapon.system.is_twohanded);
        const requiresTwoHanded = !isSpell && !!this.system.req_weapon_property?.is_twohanded;

        if (!(variableGrip && requiresTwoHanded)) {
          buttons += `<button class="dedrel-chat-action" data-action="rollDamage" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.Damage")}</button>`;
        }
        if (variableGrip) {
          buttons += `<button class="dedrel-chat-action" data-action="rollDamage" data-item-id="${this.id}" data-grip="2h" ${weaponAttr}><i class="fa-solid fa-hands-holding"></i> ${game.i18n.localize("DEDREL.Chat.DamageTwoHanded")}</button>`;
        }
      }
      if (this.system.formula_heal) {
        buttons += `<button class="dedrel-chat-action" data-action="applyHeal" data-item-id="${this.id}"><i class="fa-solid fa-heart"></i> ${game.i18n.localize("DEDREL.Chat.ApplyHeal")}</button>`;
      }
      if (showCombatButtons && this.system.save_attribute) {
        const dc = this.system.save_dc || this.system.save_dc_formula || "";
        buttons += `<button class="dedrel-chat-action" data-action="rollSave" data-save="${this.system.save_attribute}" data-dc="${dc}"><i class="fa-solid fa-shield-halved"></i> ${game.i18n.localize("DEDREL.Chat.Save")} (${this.system.save_attribute.toUpperCase()})</button>`;
      }
      buttons += `</div>`;
    }

    // Кнопки наложения состояний (собранные заклинания). Актуальная версия
    // condition-предмета подтягивается из реестра статусов
    // (CONFIG.statusEffects ← компендиум Conditions) в момент клика.
    if (this.type === "spell") {
      const conditionKeys = [];
      // Модификатор "Сила" с выбранным состоянием
      const powerMod = (this.system.chosen_modifiers || []).find(m => m.key === "power");
      if (powerMod?.option && powerMod.option !== "bonus" && powerMod.option !== "penalty") {
        conditionKeys.push(powerMod.option);
      }
      // Уникальное свойство доктрины "Поджигание" (Пиромантия): уронное заклинание
      // может оставить состояние "Горение"
      const igniteKey = CONFIG.DEDREL?.magic?.doctrines?.[this.system.doctrine]?.unique?.ignite;
      if (igniteKey && this.system.formula_damage && !conditionKeys.includes(igniteKey)) {
        conditionKeys.push(igniteKey);
      }

      if (conditionKeys.length > 0) {
        const condButtons = conditionKeys.map(key => {
          const condName = foundry.utils.escapeHTML(CONFIG.statusEffects[key]?.name || key);
          return `<button class="dedrel-chat-action" data-action="applySpellCondition" data-status-id="${key}"><i class="fa-solid fa-bolt"></i> ${game.i18n.format("DEDREL.Chat.ApplyCondition", { name: condName })}</button>`;
        }).join("");
        buttons += `
          <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
            ${condButtons}
          </div>
        `;
      }
    }

    if (this.system.template_shape && this.system.template_size) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="placeTemplate" data-shape="${this.system.template_shape}" data-size="${this.system.template_size}"><i class="fa-solid fa-ruler-combined"></i> ${game.i18n.localize("DEDREL.Chat.PlaceTemplate")}</button>
        </div>
      `;
    }

    // Картечь (аркебуза и пр.): scatter-оружие стреляет тем же манёвром-выстрелом,
    // но по площади. Кнопки Атаки/Урона остаются как у обычного выстрела (один
    // бросок на всех накрытых); дополнительно рисуем кнопку конуса. Длина конуса —
    // из range оружия (парсим ведущее число), угол — стандартный (template.mjs).
    // Только карточка ВЫСТРЕЛА, не перезарядка/прицеливание/прочие self-манёвры
    // с тем же оружием: те же критерии, что isReloadingShot в use() — манёвр бьёт
    // по цели (не self), требует оружие, не помечен перезарядкой и не прячет бой.
    const isShotCard = reqWeapon
      && !this.system.is_reload_action
      && this.system.target_type !== "self"
      && !this.system.hide_combat_buttons;
    const cardWeaponScatter = (isShotCard && weaponId) ? this.actor?.items.get(weaponId) : null;
    if (cardWeaponScatter?.system?.is_scatter) {
      const coneSize = parseFloat(String(cardWeaponScatter.system.range || "").match(/[\d.]+/)?.[0] || "") || 0;
      if (coneSize > 0) {
        buttons += `
          <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
            <button class="dedrel-chat-action" data-action="placeTemplate" data-shape="cone" data-size="${coneSize}"><i class="fa-solid fa-wind"></i> ${game.i18n.localize("DEDREL.Chat.ScatterCone")}</button>
          </div>
        `;
      }
    }

    // Если у предмета есть эффекты, которые НЕ переносятся автоматически (transfer: false),
    // значит это бафы/дебафы, которые нужно накладывать вручную (например, яд, заклинание).
    // Генерируем кнопку для наложения этих эффектов на выделенные токены.
    // Self-эффекты (applyTo: "self") исключаем — они применяются к владельцу в use().
    // Аура-эффекты (payload applyTo: "aura" и маркеры flags.dedrel.aura) тоже:
    // их накладывает и снимает регион-аура (см. src/canvas/aura-regions.mjs).
    const hasTransferableEffects = this.effects.some(e =>
      !e.transfer
      && !["self", "aura"].includes(e.getFlag("dedrel", "applyTo"))
      && !e.getFlag("dedrel", "aura")
    );
    if (hasTransferableEffects) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="applyItemEffects" data-item-id="${this.id}"><i class="fa-solid fa-magic"></i> ${game.i18n.localize("DEDREL.Chat.ApplyEffects")}</button>
        </div>
      `;
    }

    // Тумблер ауры: включает/выключает эффект-маркер (регион и бафы
    // создаёт/убирает синхронизация, см. src/canvas/aura-regions.mjs)
    const hasAuraMarker = this.effects.some(e => e.getFlag("dedrel", "aura"));
    if (hasAuraMarker) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="toggleAura" data-item-id="${this.id}"><i class="fa-solid fa-circle-dot"></i> ${game.i18n.localize("DEDREL.Chat.ToggleAura")}</button>
        </div>
      `;
    }

    // Запрещённая защита — ручная механика: соблюдается за столом, поэтому
    // обязана быть видна на карточке (у манёвров — Финт, у заклинаний —
    // модификатор Конструктора forbidDefense).
    let forbiddenNote = "";
    const forbidden = this.system.forbidden_defense;
    if (forbidden) {
      const defKey = { block: "DEDREL.Chat.ForbiddenBlock", dodge: "DEDREL.Chat.ForbiddenDodge" }[forbidden];
      const defText = defKey ? game.i18n.localize(defKey) : foundry.utils.escapeHTML(forbidden);
      forbiddenNote = `<div style="margin-bottom: 8px; font-weight: bold; color: var(--color-level-error, #b22);"><i class="fa-solid fa-ban"></i> ${defText}</div>`;
    }

    // Напоминание о перезарядке: выстрел, оставивший ствол разряженным, помечает
    // это на карточке. Без кнопки — перезарядка совершается своим манёвром из HUD,
    // а стрелок волен отложить её (карточка к тому моменту уже уедет вверх).
    let reloadNote = "";
    const cardWeaponReload = weaponId ? this.actor?.items.get(weaponId) : null;
    if (cardWeaponReload?.system?.is_reloading && !cardWeaponReload.system.loaded) {
      reloadNote = `<div style="margin-bottom: 8px; font-weight: bold; color: var(--color-level-warning, #b8860b);"><i class="fa-solid fa-rotate-right"></i> ${game.i18n.format("DEDREL.Chat.NeedsReload", { name: foundry.utils.escapeHTML(cardWeaponReload.name) })}</div>`;
    }

    let content = `
      <div class="dedrel-item-chat">
        <h3 style="border-bottom: 1px solid var(--color-border-dark); padding-bottom: 3px; margin-bottom: 8px;">${foundry.utils.escapeHTML(this.name)}</h3>
        <div class="description" style="margin-bottom: 8px;">${this.system.description || ""}</div>
        ${forbiddenNote}
        ${reloadNote}
        ${buttons}
      </div>
    `;

    const messageData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    };
    // Снапшот боеприпаса (AP/доп. урон/vs_creature) кладём во флаг — бросок урона
    // с этой карты (chat.mjs) читает его, т.к. сам боеприпас мог быть уже списан.
    if (ammoSnapshot && (ammoSnapshot.ap || ammoSnapshot.dmg || Object.keys(ammoSnapshot.vs || {}).length)) {
      messageData.flags = { dedrel: { ammo: ammoSnapshot } };
    }
    await ChatMessage.create(messageData);
  }
}
