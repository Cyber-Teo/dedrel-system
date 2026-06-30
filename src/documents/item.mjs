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
      
      const index = await pack.getIndex();
      for (let i = itemNamesToFind.length - 1; i >= 0; i--) {
        const itemName = itemNamesToFind[i];
        const entry = index.find(idx => idx.name === itemName);
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

    if (!["maneuver", "talent", "mutation", "spell", "magic_item", "weapon", "armor", "loot", "trade_good"].includes(this.type)) {
      return this.postToChat();
    }

    const apCost = this.system.ap_cost || 0;
    
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
      if (wProp.is_auxiliary || wProp.is_fast || wProp.is_slow || 
          wProp.is_twohanded || wProp.is_thrown || wProp.is_enchanted || wProp.is_reloading) {
        requiresWeapon = true;
      }
      
      if (requiresWeapon) {
        validWeapons = actor.items.filter(i => {
          if (i.type !== "weapon" || !i.system.equipped) return false;
          
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
          return true;
        });
      }
    }

    // Проверка боеприпасов и расходуемых предметов
    let ammoItem = null;
    let consumeAmount = this.system.consume_amount || 1;
    let isSelfConsume = false;
    let hasEnoughAmmo = true;
    let consumesResources = false;

    if (this.type === "weapon" && this.system.consume_target) {
      ammoItem = actor.items.get(this.system.consume_target);
      consumesResources = true;
      if (ammoItem) {
        if (ammoItem.system.quantity < consumeAmount) {
          hasEnoughAmmo = false;
        }
      } else {
        hasEnoughAmmo = false; // Привязанный предмет не найден
      }
    } else if (this.system.properties?.consumed_on_use || this.system.consumable || this.type === "ammunition") {
      isSelfConsume = true;
      consumesResources = true;
      if ((this.system.quantity || 0) < consumeAmount) {
        hasEnoughAmmo = false;
      }
    }

    // Если предмет полностью пассивный, просто открываем его окно (чтобы не спамить в чат)
    const isPassiveSubtype = (this.type === "talent" || this.type === "mutation") && this.system.subtype === "passive";
    if (apCost === 0 && !hasCharges && !requiresWeapon && !consumesResources && (isPassiveSubtype || this.type === "weapon" || this.type === "magic_item" || this.type === "armor" || this.type === "loot" || this.type === "trade_good" || this.type === "ammunition")) {
      return this.sheet.render(true);
    }
    
    if (apCost === 0 && !hasCharges && !requiresWeapon && !consumesResources) {
      return this.sheet.render(true);
    }

    // Подготовка диалогового окна
    let content = `<div style="margin-bottom: 15px;">`;
    
    let currentAp = 0;
    let apSpecific = 0;
    let specificApKey = "";
    
    if (apCost > 0) {
      let apUniversal = actor.system.resources?.ap_universal?.value || 0;
      if (this.type === "maneuver") {
        apSpecific = actor.system.resources?.ap_maneuver?.value || 0;
        specificApKey = "system.resources.ap_maneuver.value";
      } else if (this.type === "spell" || this.type === "magic_item") {
        apSpecific = actor.system.resources?.ap_magic?.value || 0;
        specificApKey = "system.resources.ap_magic.value";
      }
      currentAp = apUniversal + apSpecific;
      
      content += `<p>${game.i18n.format("DEDREL.Chat.SpendAP", {name: this.name, cost: apCost})}</p>`;
      if (apCost > currentAp) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.format("DEDREL.Chat.NotEnoughAPDialog", {current: currentAp, cost: apCost})}</p>`;
      }
    }

    if (hasCharges) {
      content += `<p>${game.i18n.format("DEDREL.Chat.SpendCharge", {value: usesValue, max: usesMax})}</p>`;
      if (usesValue <= 0) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.localize("DEDREL.Chat.OutOfCharges")}</p>`;
      }
    }

    if (ammoItem) {
      if (!hasEnoughAmmo) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.format("DEDREL.Notifications.NotEnoughAmmo", {name: ammoItem.name, current: ammoItem.system.quantity, required: consumeAmount})}</p>`;
      } else {
        content += `<p>${game.i18n.format("DEDREL.Chat.WillBeConsumed", {name: ammoItem.name, count: consumeAmount})}</p>`;
      }
    } else if (isSelfConsume) {
      if (!hasEnoughAmmo) {
        content += `<p style="color: red; font-weight: bold;">${game.i18n.localize("DEDREL.Notifications.ItemDepleted")}</p>`;
      } else {
        content += `<p>${game.i18n.format("DEDREL.Chat.WillBeConsumed", {name: this.name, count: consumeAmount})}</p>`;
      }
    }

    if (requiresWeapon) {
      if (validWeapons.length > 0) {
        content += `
          <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight: bold;">${game.i18n.localize("DEDREL.Chat.Weapon")}</label>
            <select name="weaponId" id="use-weapon-select" style="width: 100%; padding: 4px;">
              ${validWeapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
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
            if (apCost > 0 && apCost > currentAp) {
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

            // Списание ОД
            if (apCost > 0) {
              let apUniversal = actor.system.resources?.ap_universal?.value || 0;
              let costLeft = apCost;
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
            
            // Списание Зарядов
            if (hasCharges) {
              await this.update({ "system.uses_value": usesValue - 1 });
            }

            // Списание предметов / боеприпасов
            if (ammoItem) {
              const newQty = Math.max(0, ammoItem.system.quantity - consumeAmount);
              if (newQty <= 0) {
                await ammoItem.delete();
              } else {
                await ammoItem.update({ "system.quantity": newQty });
              }
            } else if (isSelfConsume) {
              const newQty = Math.max(0, (this.system.quantity || 0) - consumeAmount);
              if (newQty <= 0) {
                await this.delete();
                // Если предмет удален, дальше макросы могут сбоить, но мы прерываемся после postToChat
              } else {
                await this.update({ "system.quantity": newQty });
              }
            }

            let selectedWeaponId = null;
            if (requiresWeapon) {
              const weaponSelect = dialog.element.querySelector("#use-weapon-select");
              selectedWeaponId = weaponSelect ? weaponSelect.value : null;
            }
            
            // Вызов макроса если есть
            if (this.system.on_use_macro) {
              const macro = game.macros.find(m => m.name === this.system.on_use_macro);
              if (macro) {
                macro.execute({ actor: actor, item: this });
              } else {
                ui.notifications.warn(game.i18n.format("DEDREL.Notifications.MacroNotFound", {name: this.system.on_use_macro}));
              }
            }

            await this.postToChat(selectedWeaponId);

            // Обработка цепных манёвров
            if (this.type === "maneuver") {
              const aType = this.system.action_type || {};
              if (aType.action || aType.chain || aType.reaction) {
                const showOutside = game.settings.get("dedrel", "showChainsOutsideCombat");
                if (game.combat?.started || showOutside) {
                  game.dedrel.chainHUD.showFor(actor, this);
                }
              }
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
   * Отправляет карточку предмета в чат. Боевые кнопки (Атака/Урон) добавляются только боевым предметам.
   * @param {string|null} weaponId - ID выбранного оружия (если есть)
   */
  async postToChat(weaponId = null) {
    let weaponAttr = weaponId ? `data-weapon-id="${weaponId}"` : "";
    
    let showCombatButtons = false;
    let reqWeapon = false;
    if (this.type === "maneuver" || this.type === "spell") {
       const wType = this.system.req_weapon_type || {};
       const wDmg = this.system.req_weapon_damage_type || {};
       reqWeapon = (wType.melee || wType.ranged || wType.shield || wType.magic ||
                          wDmg.piercing || wDmg.bludgeoning || wDmg.slashing);
       
       if (reqWeapon || this.system.formula_attack || this.system.formula_damage || this.system.save_attribute) {
         showCombatButtons = true;
       }
    }

    let buttons = "";
    if (showCombatButtons) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
      `;
      if (this.system.formula_attack || reqWeapon) {
        buttons += `<button class="dedrel-chat-action" data-action="rollAttack" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-crosshairs"></i> ${game.i18n.localize("DEDREL.Chat.Attack")}</button>`;
      }
      if (this.system.formula_damage || reqWeapon) {
        buttons += `<button class="dedrel-chat-action" data-action="rollDamage" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.Damage")}</button>`;
      }
      if (this.system.save_attribute) {
        const dc = this.system.save_dc || this.system.save_dc_formula || "";
        buttons += `<button class="dedrel-chat-action" data-action="rollSave" data-save="${this.system.save_attribute}" data-dc="${dc}"><i class="fa-solid fa-shield-halved"></i> ${game.i18n.localize("DEDREL.Chat.Save")} (${this.system.save_attribute.toUpperCase()})</button>`;
      }
      buttons += `</div>`;
    }

    if (this.system.template_shape && this.system.template_size) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="placeTemplate" data-shape="${this.system.template_shape}" data-size="${this.system.template_size}"><i class="fa-solid fa-ruler-combined"></i> ${game.i18n.localize("DEDREL.Chat.PlaceTemplate")}</button>
        </div>
      `;
    }

    // Если у предмета есть эффекты, которые НЕ переносятся автоматически (transfer: false),
    // значит это бафы/дебафы, которые нужно накладывать вручную (например, яд, заклинание).
    // Генерируем кнопку для наложения этих эффектов на выделенные токены.
    const hasTransferableEffects = this.effects.some(e => !e.transfer);
    if (hasTransferableEffects) {
      buttons += `
        <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
          <button class="dedrel-chat-action" data-action="applyItemEffects" data-item-id="${this.id}"><i class="fa-solid fa-magic"></i> ${game.i18n.localize("DEDREL.Chat.ApplyEffects")}</button>
        </div>
      `;
    }

    let content = `
      <div class="dedrel-item-chat">
        <h3 style="border-bottom: 1px solid var(--color-border-dark); padding-bottom: 3px; margin-bottom: 8px;">${this.name}</h3>
        <div class="description" style="margin-bottom: 8px;">${this.system.description || ""}</div>
        ${buttons}
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }
}
