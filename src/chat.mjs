import { showRollDialog } from "./dice/roll.mjs";
import { placeTemplatePreview } from "./canvas/template.mjs";
import { DR_KEY_LABELS } from "./constants.mjs";
import { DedrelBonuses } from "./utils/dedrel-bonuses.mjs";

/**
 * Хук "renderChatMessageHTML" вызывается при рендеринге сообщения в чат.
 * Обрабатывает клики по интерактивным кнопкам в чате (например, бросок урона или атаки).
 */
Hooks.on("renderChatMessageHTML", (message, html, data) => {
  html.addEventListener("click", async (event) => {
    const button = event.target.closest(".dedrel-chat-action");
    if (!button) return;
    
    event.preventDefault();
    const action = button.dataset.action;
    const itemId = button.dataset.itemId;
    const weaponId = button.dataset.weaponId;
    
    const actor = ChatMessage.getSpeakerActor(message.speaker);
    if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ActorNotFound"));
    
    const item = itemId ? actor.items.get(itemId) : null;
    const weapon = weaponId ? actor.items.get(weaponId) : null;
    
    // Бросок атаки
    if (action === "rollAttack") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      let baseRank = 0;
      let title = game.i18n.format("DEDREL.Chat.AttackCardTitle", {name: item.name});
      
      // Определяем навык: сначала ищем у самого манёвра/предмета, если нет - у оружия
      let skillKey = item.system.skill;
      if (!skillKey && weapon && weapon.system.skill) {
        skillKey = weapon.system.skill;
      }
      
      if (weapon) {
        title += ` (${weapon.name})`;
      }

      if (skillKey && actor.system.skills && actor.system.skills[skillKey]) {
        baseRank = actor.system.skills[skillKey].rank || 0;
      }
      
      await showRollDialog({
        actor: actor,
        title: title,
        baseRank: baseRank,
        itemId: item?.id,
        isSave: false
      });
    }
    
    // Бросок урона
    if (action === "rollDamage") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      let formula = item.system.formula_damage;
      let drKey = "";
      
      // Определяем тип урона из требований манёвра
      if (item.type === "maneuver" && item.system.req_weapon_damage_type) {
        const reqDmg = item.system.req_weapon_damage_type;
        if (reqDmg.piercing) drKey = "piercing";
        else if (reqDmg.bludgeoning) drKey = "bludgeoning";
        else if (reqDmg.slashing) drKey = "slashing";
      }
      
      // Если у манёвра нет своей формулы, берем формулу и тип урона от оружия
      if (!formula && weapon) {
        formula = weapon.system.damage_formula;
        if (!drKey) {
           const wDmg = weapon.system.damage_type;
           if (wDmg.piercing) drKey = "piercing";
           else if (wDmg.bludgeoning) drKey = "bludgeoning";
           else if (wDmg.slashing) drKey = "slashing";
        }
      }
      
      if (!formula) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoDamageFormula"));
      
      const bonuses = DedrelBonuses.extractNextActionBonuses(actor, item);
      if (bonuses.damage !== 0) {
        formula += ` + ${bonuses.damage}`;
        const damageKeys = ["system.bonuses.next_damage", "system.bonuses.next_melee_damage", "system.bonuses.next_ranged_damage"];
        const consumedKeys = bonuses.usedKeys.filter(k => damageKeys.includes(k));
        if (consumedKeys.length > 0) {
          await DedrelBonuses.consumeNextActionBonuses(actor, consumedKeys);
        }
      }
      
      // Попробуем извлечь тип урона прямо из формулы, если он указан в скобках, например 1d6[acid] или 1d6[кислота]
      const match = formula.match(/\[(.*?)\]/);
      if (match) {
          const flavorText = match[1].toLowerCase().trim();
          if (!drKey) {
              if (DR_KEY_LABELS[flavorText]) {
                  drKey = flavorText;
              } else {
                  for (const [k, labelKey] of Object.entries(DR_KEY_LABELS)) {
                      if (game.i18n.localize(labelKey).toLowerCase() === flavorText) {
                          drKey = k;
                          break;
                      }
                  }
              }
          }
          // Удаляем квадратные скобки из формулы, чтобы избежать ошибок синтаксиса Roll
          formula = formula.replace(/\[.*?\]/g, '').trim();
      }
      
      let roll = new Roll(formula, actor.getRollData());
      
      // Возвращаем flavor обратно в кубики для поддержки Dice So Nice
      if (drKey) {
          for (let term of roll.terms) {
              if (term.faces !== undefined) {
                  term.options.flavor = drKey;
              }
          }
      }
      
      await roll.evaluate();
      
      const apLevel = weapon?.system?.properties?.armor_piercing_value || (weapon?.system?.properties?.armor_piercing ? 1 : 0);
      
      let damageTypeLabel = drKey ? game.i18n.localize(DR_KEY_LABELS[drKey]) : "";
      
      // Формируем HTML для отображения результатов броска кубиков в чате
      let chatContent = `
        <div class="dice-roll">
          <div class="dice-result">
            <div class="dice-formula">${roll.formula} ${damageTypeLabel ? `[${damageTypeLabel}]` : ''}</div>
            ${await roll.getTooltip()}
            <h4 class="dice-total">${roll.total}</h4>
          </div>
        </div>
        <div class="chat-actions" style="display: flex; justify-content: center; width: 100%; margin-top: 8px;">
           <button class="dedrel-chat-action" data-action="applyDamage" data-damage="${roll.total}" data-type="${drKey}" data-ap="${apLevel}" style="width: 100%;"><i class="fas fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.ApplyDamage")}</button>
        </div>
      `;
      
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flavor: game.i18n.format("DEDREL.Chat.DamageCardFlavor", {name: item.name}),
        content: chatContent,
        rolls: [roll]
      });
    }

    // Применение исцеления
    if (action === "applyHeal") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      const formula = item.system.formula_heal;
      if (!formula) return;
      
      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetForEffect"));
      }
      
      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        
        let healAmount = 0;
        let isPercentage = formula.trim().endsWith("%");
        
        if (isPercentage) {
            let percentStr = formula.replace("%", "").trim();
            let percentVal = parseFloat(percentStr) || 0;
            let maxHp = targetActor.system.resources.hp.max || 1;
            healAmount = (percentVal / 100) * maxHp;
            healAmount = Math.round(healAmount);
        } else {
            let roll = new Roll(formula, targetActor.getRollData());
            await roll.evaluate();
            healAmount = roll.total;
        }
        
        if (healAmount <= 0) continue;
        
        const currentHp = targetActor.system.resources.hp.value;
        const maxHp = targetActor.system.resources.hp.max;
        const newHp = Math.min(maxHp, currentHp + healAmount);
        const actualHealed = newHp - currentHp;
        
        if (actualHealed > 0) {
            await targetActor.update({ "system.resources.hp.value": newHp });
            
            let chatMsg = game.i18n.format("DEDREL.Chat.HealApplied", {name: targetActor.name, amount: actualHealed});
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }), // 'actor' is the one who used the item
                content: `<div class="dedrel-item-chat"><p>💖 ${chatMsg}</p></div>`
            });
        }
      }
    }

    // Применение эффектов предмета
    if (action === "applyItemEffects") {
      const speaker = message.speaker;
      const actor = game.actors.get(speaker.actor);
      if (!actor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ActorNotFoundForEffect"));
      
      const item = actor.items.get(itemId);
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));

      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetForEffect"));
      }

      const effectsToApply = item.effects.filter(e => !e.transfer).map(e => {
        let effData = e.toObject();
        effData.origin = item.uuid;
        return effData;
      });

      if (effectsToApply.length === 0) return ui.notifications.info(game.i18n.localize("DEDREL.Notifications.NoEffectsOnItem"));

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        await targetActor.createEmbeddedDocuments("ActiveEffect", effectsToApply);
      }
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.EffectsApplied", {count: targets.length}));
    }

    // Применение урона
    if (action === "applyDamage") {
      const damage = parseInt(button.dataset.damage) || 0;
      const drKey = button.dataset.type || "";
      const apLevel = parseInt(button.dataset.ap) || 0;

      // Сначала берем выделенные токены (controlled), если их нет - берем таргеты (targets)
      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTargetForDamage"));

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        
        let drUnits = 0;
        if (drKey && targetActor.system.dr && targetActor.system.dr[drKey] !== undefined) {
          drUnits = targetActor.system.dr[drKey];
        }

        let drPercent = drUnits * 10;
        let apPercent = apLevel * 10;
        
        // Применяем бронебойность (плоское вычитание процентов)
        if (drPercent > 0) {
          drPercent -= apPercent;
          if (drPercent < 0) drPercent = 0;
        }

        // Защита не может превышать 100%
        if (drPercent > 100) drPercent = 100;

        let finalDamage = damage * (1 - drPercent / 100);
        if (finalDamage < 0) finalDamage = 0;
        
        // Небольшое округление, чтобы избежать длинных дробей
        finalDamage = Math.round(finalDamage * 10) / 10;
        
        let blockedDamage = damage - finalDamage;
        blockedDamage = Math.round(blockedDamage * 10) / 10;

        const currentHp = targetActor.system.resources.hp.value;
        let tempHp = targetActor.system.resources.hp.temp || 0;
        let tempHpDamage = 0;
        
        if (tempHp > 0) {
          tempHpDamage = Math.min(tempHp, finalDamage);
          tempHp -= tempHpDamage;
          finalDamage -= tempHpDamage;
        }

        const newHp = Math.max(0, currentHp - finalDamage);

        const updates = { "system.resources.hp.value": newHp };
        if (tempHpDamage > 0) {
          updates["system.resources.hp.temp"] = tempHp;
        }

        await targetActor.update(updates);
        
        // totalAppliedDamage - это суммарный урон, который прошел после брони
        const totalAppliedDamage = finalDamage + tempHpDamage;
        
        let damageTypeStr = drKey ? `[${game.i18n.localize(DR_KEY_LABELS[drKey])}] ` : "";
        let chatMsg = game.i18n.format("DEDREL.Chat.DamageTaken", {name: targetActor.name, damage: totalAppliedDamage, type: damageTypeStr});

        if (tempHpDamage > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageTakenTemp", {tempDamage: tempHpDamage})}</span>`;
        }

        if (blockedDamage > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageBlocked", {dr: blockedDamage})}</span>`;
        }
        
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          content: `<div class="dedrel-item-chat"><p>${chatMsg}</p></div>`
        });
      }
    }

    // Бросок спасброска
    if (action === "rollSave") {
      const saveAttr = button.dataset.save;
      const saveDc = button.dataset.dc;
      
      // Ищем актора: сначала выделенный токен, иначе персонаж игрока
      let targetActor = null;
      if (canvas.tokens.controlled.length > 0) {
        targetActor = canvas.tokens.controlled[0].actor;
      } else {
        targetActor = game.user.character;
      }
      
      if (!targetActor) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTokenForSave"));
      
      const attrData = targetActor.system.attributes[saveAttr];
      if (!attrData) return;
      
      const title = `${game.i18n.localize("DEDREL.Chat.Save")} (${saveAttr.toUpperCase()})`;
      await showRollDialog({
        actor: targetActor,
        title: title,
        baseRank: attrData.rank,
        isSave: true
      });
    }

    // Размещение шаблона
    if (action === "placeTemplate") {
      let shape = button.dataset.shape;
      const size = parseFloat(button.dataset.size) || 0;
      
      if (!shape || size <= 0) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.InvalidTemplateData"));
      
      if (shape === "square") shape = "rect";
      if (shape === "line") shape = "ray";

      const templateData = {
        t: shape,
        distance: size,
        user: game.user.id,
        fillColor: game.user.color
      };

      if (shape === "ray") {
        templateData.width = canvas.scene.grid.distance;
      } else if (shape === "rect") {
        templateData.direction = 45;
        templateData.distance = Math.hypot(size, size);
      }

      placeTemplatePreview(templateData);
    }
  });
});
