import { showRollDialog } from "./dice/roll.mjs";
import { placeTemplatePreview } from "./canvas/template.mjs";
import { DR_KEY_LABELS } from "./constants.mjs";
import { DedrelBonuses } from "./utils/dedrel-bonuses.mjs";
import { stepFormula, formulaAverage } from "./utils/dice-ladder.mjs";
import { heldTwoHanded } from "./utils/grip.mjs";

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
        isSave: false,
        // Передаём навык, чтобы к атаке применялся его bonus (system.skills.<key>.bonus).
        // Это un-clamped канал модификатора — в отличие от rank (min: 0), он может
        // уводить бросок в минус (нужно для штрафов вроде «Ослепления»).
        skillId: skillKey,
        // Оружие нужно броску для осечек пороха (натуральная 1 + редкость оружия)
        weaponId: weapon?.id
      });
    }
    
    // Бросок урона
    if (action === "rollDamage") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      let formula = item.system.formula_damage;
      let drKey = "";
      const dmgOrder = ["piercing", "bludgeoning", "slashing"];

      // Среди типов-кандидатов, которыми РЕАЛЬНО обладает оружие, выбираем тот,
      // чья формула урона больше по среднему (Лестница урона) — чтобы, например,
      // Добивание мечом било сильным рубящим (2d6), а не слабым колющим (1d6).
      // Ничья (равные средние) — по приоритету dmgOrder.
      const bestDamageType = (candidates) => {
        const perType = weapon?.system?.damage_formulas || {};
        const base = weapon?.system?.damage_formula || "";
        let best = "", bestAvg = -1;
        for (const k of dmgOrder) {
          if (!candidates.includes(k)) continue;
          const a = formulaAverage(perType[k] || base);
          if (a > bestAvg) { bestAvg = a; best = k; }
        }
        return best;
      };

      // Тип урона из требований манёвра. Если манёвр допускает несколько типов,
      // берём тот, что оружие реально имеет И который бьёт сильнее.
      if (item.type === "maneuver" && item.system.req_weapon_damage_type) {
        const reqDmg = item.system.req_weapon_damage_type;
        const wDmg = weapon?.system?.damage_type || {};
        const shared = dmgOrder.filter(k => reqDmg[k] && wDmg[k]);
        drKey = bestDamageType(shared) || dmgOrder.find(k => reqDmg[k]) || "";
      }

      // Если у манёвра нет своей формулы, берём формулу и тип урона от оружия:
      // сначала формула конкретного типа (damage_formulas), потом базовая.
      if (!formula && weapon) {
        if (!drKey) {
          const wDmg = weapon.system.damage_type || {};
          drKey = bestDamageType(dmgOrder.filter(k => wDmg[k]));
        }
        const perType = weapon.system.damage_formulas || {};
        formula = (drKey && perType[drKey]) || weapon.system.damage_formula;
      }
      
      if (!formula) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoDamageFormula"));
      
      // DSL-модификаторы урона (flags.dedrel.mod), например "damage:1d6; filter:melee".
      const damageMods = DedrelBonuses.collect(actor, item);

      // Двуручный хват (кнопка «Урон (двуручный хват)» у вариативного оружия):
      // +1 ступень Лестницы. Свободна ли вторая рука — проверяем в момент клика.
      let gripStep = 0;
      if (button.dataset.grip === "2h") {
        if (!heldTwoHanded(actor, weapon)) {
          return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TwoHandedGripNeedsFreeHand"));
        }
        gripStep = 1;
      }

      // Сдвиг по лестнице кубов двигает ТОЛЬКО базовую формулу
      // (1d4→1d6→2d4→2d6→2d8→3d6), поэтому применяется до аддитивных частей.
      // Источники складываются: собственный сдвиг манёвра (weapon_dice_step) +
      // DSL-моды dice_step + двуручный хват. ПРАВИЛО ЛЕСТНИЦЫ: суммарный подъём
      // не может превысить +1 ступень (никаких 3d6 из ржавого кинжала стопкой
      // бафов); сдвиг вниз (нерфы) не ограничен.
      const totalDiceStep = Math.min(
        (item.system.weapon_dice_step || 0) + damageMods.diceStep + gripStep,
        1
      );
      if (totalDiceStep) {
        // Ссылки на урон оружия (@weapon.damage_formula, @weapon.damage_formulas.<тип>)
        // — подстановки rollData, а не литеральные кубы: разворачиваем их до сдвига,
        // иначе лестнице нечего двигать (например, "@weapon.damage_formula + 4").
        if (weapon) {
          const perType = weapon.system.damage_formulas || {};
          formula = formula
            .replace(/@weapon\.damage_formulas\.(\w+)/g, (m, k) => perType[k] ? `(${perType[k]})` : m)
            .replace(/@weapon\.damage_formula(?!s)\b/g, m => weapon.system.damage_formula ? `(${weapon.system.damage_formula})` : m);
        }
        formula = stepFormula(formula, totalDiceStep);
      }

      // Аддитивные части могут быть числами или дайсами — добавляем как есть.
      for (const part of damageMods.damageParts) {
        formula += ` + ${part}`;
      }

      if ((actor?.system?.bonuses?.damage_explode || 0) > 0) {
        // Находим все кубики (например 1d6, 2d10) и добавляем модификатор xo (взрыв один раз).
        // Используем отрицательный просмотр вперед (?!x), чтобы не дублировать модификатор,
        // если он уже есть (например от оружия, которое изначально взрывается).
        formula = formula.replace(/(\d+d\d+)(?!x)/ig, "$1xo");
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
      
      // Снапшот боеприпаса с карты атаки (flags.dedrel.ammo): AP/доп. урон/vs_creature.
      // Сам боеприпас к этому моменту мог быть уже списан — данные берём из флага.
      const ammo = message.getFlag("dedrel", "ammo") || null;

      // Доп. урон боеприпаса ТОГО ЖЕ типа (или без явного типа) вливается в основную
      // формулу; урон другого типа роллится отдельным пакетом ниже (свой DR цели).
      const ammoSameType = ammo?.dmg && (!ammo.dmgType || ammo.dmgType === drKey);
      if (ammoSameType) formula += ` + ${ammo.dmg}`;

      let rollData = actor.getRollData();
      if (weapon) {
          rollData.weapon = weapon.system;
      }
      let roll = new Roll(formula, rollData);

      // Возвращаем flavor обратно в кубики для поддержки Dice So Nice
      if (drKey) {
          for (let term of roll.terms) {
              if (term.faces !== undefined) {
                  term.options.flavor = drKey;
              }
          }
      }

      await roll.evaluate();

      // Бронебойность: числовое поле оружия (0-3, редактируется на листе) + DSL-моды
      // pierce:N от манёвров/эффектов + AP боеприпаса. Легаси-галочка
      // properties.armor_piercing (булево у старых предметов) даёт 1. Каждая
      // единица снимает 10% DR цели.
      const weaponAp = weapon?.system?.armor_piercing
        || (weapon?.system?.properties?.armor_piercing ? 1 : 0);
      const apLevel = weaponAp + damageMods.pierce + (ammo?.ap || 0);

      // Бонусы «против типов существ»: оружие + боеприпас (силы складываются по типу).
      // Сериализуем ненулевые пары "тип:сила" в data-атрибут кнопки урона.
      const vsWeapon = weapon || (item.type === "weapon" ? item : null);
      const vsMapSrc = { ...(vsWeapon?.system?.vs_creature || {}) };
      if (ammo?.vs) {
        for (const [t, p] of Object.entries(ammo.vs)) vsMapSrc[t] = (Number(vsMapSrc[t]) || 0) + (Number(p) || 0);
      }
      const vsTypesStr = Object.entries(vsMapSrc)
        .map(([t, p]) => [t, Number(p) || 0])
        .filter(([t, p]) => t && p > 0)
        .map(([t, p]) => `${t}:${p}`)
        .join(",");

      // Рендер одного пакета урона (основной + опциональный от боеприпаса другого типа).
      const damageBlock = (r, dk, ap, vsStr, tooltip) => {
        const label = dk ? game.i18n.localize(DR_KEY_LABELS[dk]) : "";
        // Строка «против существ»: перечисляем типы и потенциальный бонус (+сила·10%).
        // Фактический бонус зависит от типа цели — считается при применении урона.
        const vsParts = (vsStr || "").split(",").filter(Boolean).map(pair => {
          const [t, p] = pair.split(":");
          return `${game.i18n.localize(`DEDREL.CreatureTypes.${t}`)} +${(Number(p) || 0) * 10}%`;
        });
        const vsLine = vsParts.length
          ? `<div class="dice-formula" style="opacity: 0.85;"><i class="fa-solid fa-dragon"></i> ${game.i18n.localize("DEDREL.Chat.VsTypeCardLabel")} ${vsParts.join(", ")}</div>`
          : "";
        return `
        <div class="dice-roll">
          <div class="dice-result">
            <div class="dice-formula">${r.formula} ${label ? `[${label}]` : ''}${ap > 0 ? ` &bull; ${game.i18n.format("DEDREL.Chat.ArmorPiercing", {value: ap})}` : ''}</div>
            ${vsLine}
            ${tooltip}
            <h4 class="dice-total">${r.total}</h4>
          </div>
        </div>
        <div class="chat-actions" style="display: flex; justify-content: center; width: 100%; margin-top: 8px;">
           <button class="dedrel-chat-action" data-action="applyDamage" data-damage="${r.total}" data-type="${dk}" data-ap="${ap}" data-vs-types="${vsStr}" style="width: 100%;"><i class="fas fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.ApplyDamage")}</button>
        </div>`;
      };

      let chatContent = damageBlock(roll, drKey, apLevel, vsTypesStr, await roll.getTooltip());
      const rolls = [roll];

      // Отдельный пакет: доп. урон боеприпаса ДРУГОГО типа (своё AP=0, свой DR).
      if (ammo?.dmg && ammo.dmgType && ammo.dmgType !== drKey) {
        let ammoRoll = new Roll(ammo.dmg, rollData);
        for (let term of ammoRoll.terms) {
          if (term.faces !== undefined) term.options.flavor = ammo.dmgType;
        }
        await ammoRoll.evaluate();
        chatContent += damageBlock(ammoRoll, ammo.dmgType, 0, "", await ammoRoll.getTooltip());
        rolls.push(ammoRoll);
      }

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flavor: game.i18n.format("DEDREL.Chat.DamageCardFlavor", {name: foundry.utils.escapeHTML(item.name)}),
        content: chatContent,
        rolls
      });

      // Сжигаем DSL-модификаторы стадии "damage" (бонусы к урону)
      await DedrelBonuses.consumeStage(actor, item, "damage");
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

        // Прибавка к ХП с капом по максимуму — общая с тиками кондиций
        const actualHealed = await targetActor.applyHealing(healAmount);

        if (actualHealed > 0) {

            let chatMsg = game.i18n.format("DEDREL.Chat.HealApplied", {name: targetActor.name, amount: actualHealed});
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }), // 'actor' is the one who used the item
                content: `<div class="dedrel-item-chat"><p>💖 ${chatMsg}</p></div>`
            });
        }
      }
    }

    // Тумблер ауры предмета: включает маркеры, если все выключены, иначе выключает
    if (action === "toggleAura") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      const markers = item.effects.filter(e => e.getFlag("dedrel", "aura"));
      if (!markers.length) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoAuraOnItem"));
      const enable = markers.every(e => e.disabled);
      for (const marker of markers) {
        await marker.update({ disabled: !enable });
      }
      ui.notifications.info(game.i18n.format(
        enable ? "DEDREL.Notifications.AuraEnabled" : "DEDREL.Notifications.AuraDisabled",
        { name: item.name }
      ));
    }

    // Применение эффектов предмета
    if (action === "applyItemEffects") {
      // Используем актёра/предмет, разрешённых через getSpeakerActor выше:
      // это корректно работает и для несвязанных (synthetic) токенов.
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));

      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetForEffect"));
      }

      // Self-эффекты (applyTo: "self") исключаем — они применяются к владельцу в item.use().
      // Аура-эффекты тоже: payload (applyTo: "aura") накладывается регионом-аурой,
      // а маркеры (flags.dedrel.aura) работают только на носителе.
      const effectsToApply = item.effects.filter(e =>
        !e.transfer
        && !["self", "aura"].includes(e.getFlag("dedrel", "applyTo"))
        && !e.getFlag("dedrel", "aura")
      ).map(e => {
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
      // Карта бонусов против типов: "undead:5,shade:3" → { undead:5, shade:3 }.
      const vsMap = {};
      for (const pair of (button.dataset.vsTypes || "").split(",").filter(Boolean)) {
        const [t, p] = pair.split(":");
        vsMap[t] = Number(p) || 0;
      }

      // Сначала берем выделенные токены (controlled), если их нет - берем таргеты (targets)
      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);

      if (targets.length === 0) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTargetForDamage"));

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;

        // Бонус «против типа»: берём максимальную силу среди типов, которые
        // несёт цель, и усиливаем урон на potency·10% ДО вычета DR.
        let dmg = damage;
        let vsPotency = 0;
        for (const key of (targetActor.creatureTypeKeys || [])) {
          if ((vsMap[key] || 0) > vsPotency) vsPotency = vsMap[key];
        }
        if (vsPotency > 0) {
          dmg = Math.round(damage * (1 + vsPotency * 0.1) * 10) / 10;
        }

        // Математика DR/временных ХП живёт в DedrelActor#applyDamage
        // (общая с тиками кондиций в src/combat.mjs)
        const { applied, blocked, tempHpDamage } = await targetActor.applyDamage(dmg, { drKey, apLevel });

        let damageTypeStr = drKey ? `[${game.i18n.localize(DR_KEY_LABELS[drKey])}] ` : "";
        let chatMsg = game.i18n.format("DEDREL.Chat.DamageTaken", {name: targetActor.name, damage: applied, type: damageTypeStr});

        if (tempHpDamage > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageTakenTemp", {tempDamage: tempHpDamage})}</span>`;
        }

        if (vsPotency > 0) {
          chatMsg += ` <span style="color: var(--color-warning, #c0392b); font-weight: bold; font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageVsType", {pct: vsPotency * 10})}</span>`;
        }

        if (blocked > 0) {
          chatMsg += ` <span style="color: var(--color-text-dark-secondary); font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageBlocked", {dr: blocked})}</span>`;
        } else if (blocked < 0) {
          // Отрицательный DR = уязвимость: урон усилен на -blocked.
          chatMsg += ` <span style="color: var(--color-warning, #c0392b); font-weight: bold; font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageAmplified", {dr: -blocked})}</span>`;
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
        isSave: true,
        saveAttr: saveAttr
      });
    }

    // Наложение состояния заклинания (Модификатор "Сила") на выделенные токены.
    // Правами обычно обладает ГМ; игрок может наложить на собственный токен.
    if (action === "applySpellCondition") {
      const statusId = button.dataset.statusId;
      if (!statusId) return;
      const targets = canvas.tokens.controlled.filter(t => t.actor);
      if (targets.length === 0) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetTokens"));
      for (const token of targets) {
        await token.actor.toggleStatusEffect(statusId, { active: true });
      }
      const condName = CONFIG.statusEffects[statusId]?.name || statusId;
      ui.notifications.info(game.i18n.format("DEDREL.Notifications.ConditionApplied", { name: condName, count: targets.length }));
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
