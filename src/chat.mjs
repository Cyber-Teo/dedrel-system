import { showRollDialog } from "./dice/roll.mjs";
import { placeTemplatePreview } from "./canvas/template.mjs";
import { DR_KEY_LABELS } from "./constants.mjs";
import { DedrelBonuses } from "./utils/dedrel-bonuses.mjs";
import { stepFormula, formulaAverage } from "./utils/dice-ladder.mjs";
import { heldTwoHanded } from "./utils/grip.mjs";

/**
 * The "renderChatMessageHTML" hook is called when a message is rendered in chat.
 * Handles clicks on interactive buttons in chat (e.g. a damage or attack roll).
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
    
    // Attack roll
    if (action === "rollAttack") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      let baseRank = 0;
      let title = game.i18n.format("DEDREL.Chat.AttackCardTitle", {name: item.name});
      
      // Determine the skill: first look at the maneuver/item itself, if not there — at the weapon
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
        // Pass the skill so that its bonus (system.skills.<key>.bonus) applies to the attack.
        // This is an un-clamped modifier channel — unlike rank (min: 0), it can
        // push the roll below zero (needed for penalties such as Blinded).
        skillId: skillKey,
        // The roll needs the weapon for powder misfires (natural 1 + the weapon's rarity)
        weaponId: weapon?.id
      });
    }
    
    // Damage roll
    if (action === "rollDamage") {
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      let formula = item.system.formula_damage;
      let drKey = "";
      const dmgOrder = ["piercing", "bludgeoning", "slashing"];

      // Among the candidate types the weapon ACTUALLY has, pick the one
      // whose damage formula is larger on average (Damage Ladder) — so that, e.g.,
      // a Finishing Blow with a sword strikes with the strong slashing (2d6) rather than the weak piercing (1d6).
      // A tie (equal averages) — by the dmgOrder priority.
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

      // Damage type from the maneuver's requirements. If the maneuver allows several types,
      // take the one the weapon actually has AND that hits harder.
      if (item.type === "maneuver" && item.system.req_weapon_damage_type) {
        const reqDmg = item.system.req_weapon_damage_type;
        const wDmg = weapon?.system?.damage_type || {};
        const shared = dmgOrder.filter(k => reqDmg[k] && wDmg[k]);
        drKey = bestDamageType(shared) || dmgOrder.find(k => reqDmg[k]) || "";
      }

      // If the maneuver has no formula of its own, take the weapon's formula and damage type:
      // first the formula of the specific type (damage_formulas), then the base one.
      if (!formula && weapon) {
        if (!drKey) {
          const wDmg = weapon.system.damage_type || {};
          drKey = bestDamageType(dmgOrder.filter(k => wDmg[k]));
        }
        const perType = weapon.system.damage_formulas || {};
        formula = (drKey && perType[drKey]) || weapon.system.damage_formula;
      }
      
      if (!formula) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoDamageFormula"));
      
      // Damage DSL modifiers (flags.dedrel.mod), e.g. "damage:1d6; filter:melee".
      const damageMods = DedrelBonuses.collect(actor, item);

      // Two-handed grip (the "Damage (Two-Handed Grip)" button on a variable-grip weapon):
      // +1 Ladder step. Whether the second hand is free is checked at click time.
      let gripStep = 0;
      if (button.dataset.grip === "2h") {
        if (!heldTwoHanded(actor, weapon)) {
          return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.TwoHandedGripNeedsFreeHand"));
        }
        gripStep = 1;
      }

      // A shift along the dice ladder moves ONLY the base formula
      // (1d4→1d6→2d4→2d6→2d8→3d6), so it applies before the additive parts.
      // The sources add up: the maneuver's own shift (weapon_dice_step) +
      // dice_step DSL mods + the two-handed grip. THE LADDER RULE: the total raise
      // can't exceed +1 step (no 3d6 from a rusty dagger through a stack
      // of buffs); a shift downward (nerfs) isn't limited.
      const totalDiceStep = Math.min(
        (item.system.weapon_dice_step || 0) + damageMods.diceStep + gripStep,
        1
      );
      if (totalDiceStep) {
        // References to the weapon's damage (@weapon.damage_formula, @weapon.damage_formulas.<type>)
        // are rollData substitutions, not literal dice: we expand them before the shift,
        // otherwise the ladder has nothing to move (e.g. "@weapon.damage_formula + 4").
        if (weapon) {
          const perType = weapon.system.damage_formulas || {};
          formula = formula
            .replace(/@weapon\.damage_formulas\.(\w+)/g, (m, k) => perType[k] ? `(${perType[k]})` : m)
            .replace(/@weapon\.damage_formula(?!s)\b/g, m => weapon.system.damage_formula ? `(${weapon.system.damage_formula})` : m);
        }
        formula = stepFormula(formula, totalDiceStep);
      }

      // Additive parts can be numbers or dice — add them as is.
      for (const part of damageMods.damageParts) {
        formula += ` + ${part}`;
      }

      if ((actor?.system?.bonuses?.damage_explode || 0) > 0) {
        // Find all dice (e.g. 1d6, 2d10) and add the xo modifier (explode once).
        // We use a negative lookahead (?!x) so as not to duplicate the modifier
        // if it's already there (e.g. from a weapon that explodes natively).
        formula = formula.replace(/(\d+d\d+)(?!x)/ig, "$1xo");
      }

      // Let's try to extract the damage type straight from the formula if it's given in brackets, e.g. 1d6[acid] or the localized label, 1d6[Acid]
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
          // Remove the square brackets from the formula to avoid Roll syntax errors
          formula = formula.replace(/\[.*?\]/g, '').trim();
      }
      
      // Ammunition snapshot from the attack card (flags.dedrel.ammo): Armor Piercing/extra damage/vs_creature.
      // The ammunition itself may already have been spent by now — the data is taken from the flag.
      const ammo = message.getFlag("dedrel", "ammo") || null;

      // Extra ammunition damage of THE SAME type (or without an explicit type) merges into the main
      // formula; damage of another type is rolled as a separate packet below (with its own target DR).
      const ammoSameType = ammo?.dmg && (!ammo.dmgType || ammo.dmgType === drKey);
      if (ammoSameType) formula += ` + ${ammo.dmg}`;

      let rollData = actor.getRollData();
      if (weapon) {
          rollData.weapon = weapon.system;
      }
      let roll = new Roll(formula, rollData);

      // Put the flavor back onto the dice for Dice So Nice support
      if (drKey) {
          for (let term of roll.terms) {
              if (term.faces !== undefined) {
                  term.options.flavor = drKey;
              }
          }
      }

      await roll.evaluate();

      // Armor Piercing: the weapon's numeric field (0-3, edited on the sheet) + DSL mods
      // pierce:N from maneuvers/effects + the ammunition's Armor Piercing. The legacy checkbox
      // properties.armor_piercing (a boolean on old items) gives 1. Each
      // point removes 10% of the target's DR.
      const weaponAp = weapon?.system?.armor_piercing
        || (weapon?.system?.properties?.armor_piercing ? 1 : 0);
      const apLevel = weaponAp + damageMods.pierce + (ammo?.ap || 0);

      // "Vs creature type" bonuses: weapon + ammunition (potencies add up per type).
      // Serialize the nonzero "type:potency" pairs into the damage button's data attribute.
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

      // Type breaker: the keys of the types the weapon is attuned against (bypass_creature=true).
      // When DR is applied, the DR granted by this target type is ignored (see applyDamage).
      const bypassStr = Object.entries(vsWeapon?.system?.bypass_creature || {})
        .filter(([t, v]) => t && v)
        .map(([t]) => t)
        .join(",");

      // Rendering one damage packet (the main one + an optional one from ammunition of another type).
      const damageBlock = (r, dk, ap, vsStr, tooltip, bypass = "") => {
        const label = dk ? game.i18n.localize(DR_KEY_LABELS[dk]) : "";
        // The "vs creatures" line: list the types and the potential bonus (+potency·10%).
        // The actual bonus depends on the target's type — computed when damage is applied.
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
           <button class="dedrel-chat-action" data-action="applyDamage" data-damage="${r.total}" data-type="${dk}" data-ap="${ap}" data-vs-types="${vsStr}" data-bypass-types="${bypass}" style="width: 100%;"><i class="fas fa-tint"></i> ${game.i18n.localize("DEDREL.Chat.ApplyDamage")}</button>
        </div>`;
      };

      let chatContent = damageBlock(roll, drKey, apLevel, vsTypesStr, await roll.getTooltip(), bypassStr);
      const rolls = [roll];

      // A separate packet: extra ammunition damage of ANOTHER type (its own Armor Piercing=0, its own DR).
      if (ammo?.dmg && ammo.dmgType && ammo.dmgType !== drKey) {
        let ammoRoll = new Roll(ammo.dmg, rollData);
        for (let term of ammoRoll.terms) {
          if (term.faces !== undefined) term.options.flavor = ammo.dmgType;
        }
        await ammoRoll.evaluate();
        chatContent += damageBlock(ammoRoll, ammo.dmgType, 0, "", await ammoRoll.getTooltip(), bypassStr);
        rolls.push(ammoRoll);
      }

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flavor: game.i18n.format("DEDREL.Chat.DamageCardFlavor", {name: foundry.utils.escapeHTML(item.name)}),
        content: chatContent,
        rolls
      });

      // Burn the DSL modifiers of the "damage" stage (damage bonuses)
      await DedrelBonuses.consumeStage(actor, item, "damage");
    }

    // Applying healing
    if (action === "applyHeal") {
      // A consumed potion has already been removed from the inventory by now (quantity 0),
      // so the formula is taken from the button's data attribute, and the live item is only
      // a fallback source for old cards without the attribute.
      const formula = button.dataset.healFormula || item?.system.formula_heal;
      if (!formula) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));
      
      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetForEffect"));
      }
      
      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;
        
        let healAmount = 0;
        let roll = null;
        let isPercentage = formula.trim().endsWith("%");

        if (isPercentage) {
            let percentStr = formula.replace("%", "").trim();
            let percentVal = parseFloat(percentStr) || 0;
            let maxHp = targetActor.system.resources.hp.max || 1;
            healAmount = Math.round((percentVal / 100) * maxHp);
        } else {
            roll = new Roll(formula, targetActor.getRollData());
            await roll.evaluate();
            healAmount = roll.total;
        }

        if (healAmount <= 0) continue;

        // Adding HP capped at the maximum — shared with condition ticks
        const actualHealed = await targetActor.applyHealing(healAmount);

        if (actualHealed > 0) {
            let chatMsg = game.i18n.format("DEDREL.Chat.HealApplied", {name: targetActor.name, amount: actualHealed});
            // Dice-based healing is shown as a real roll (breakdown + Dice So Nice
            // animation via rolls), a percentage — simply as a number.
            const rollBlock = roll
              ? `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">${roll.formula}</div>${await roll.getTooltip()}<h4 class="dice-total">${roll.total}</h4></div></div>`
              : "";
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }), // 'actor' is the one who used the item
                content: `<div class="dedrel-item-chat"><p style="color: #4caf50; font-weight: bold;">${chatMsg}</p>${rollBlock}</div>`,
                rolls: roll ? [roll] : []
            });
        }
      }
    }

    if (action === "applyTempHp") {
      // Mirror of applyHeal: the formula comes from the data attribute (a consumable carrier may
      // have been deleted by now), "N%" of the target's max HP is supported.
      // Grants STACK with the current temporary HP (rules: "9. Combat and Damage" §4).
      const formula = button.dataset.temphpFormula || item?.system.formula_temp_hp;
      if (!formula) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));

      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);

      if (targets.length === 0) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetForEffect"));
      }

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;

        let amount = 0;
        let roll = null;

        if (formula.trim().endsWith("%")) {
            const percentVal = parseFloat(formula.replace("%", "").trim()) || 0;
            const maxHp = targetActor.system.resources.hp.max || 1;
            amount = Math.round((percentVal / 100) * maxHp);
        } else {
            roll = new Roll(formula, targetActor.getRollData());
            await roll.evaluate();
            amount = roll.total;
        }

        if (amount <= 0) continue;

        const granted = await targetActor.grantTempHp(amount);

        if (granted > 0) {
            const chatMsg = game.i18n.format("DEDREL.Chat.TempHpApplied", {name: targetActor.name, amount: granted});
            const rollBlock = roll
              ? `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">${roll.formula}</div>${await roll.getTooltip()}<h4 class="dice-total">${roll.total}</h4></div></div>`
              : "";
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: `<div class="dedrel-item-chat"><p style="color: #1565c0; font-weight: bold;">${chatMsg}</p>${rollBlock}</div>`,
                rolls: roll ? [roll] : []
            });
        }
      }
    }

    // The item's aura toggle: turns the markers on if all are off, otherwise turns them off
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

    // Applying the item's effects
    if (action === "applyItemEffects") {
      // We use the actor/item resolved through getSpeakerActor above:
      // this works correctly for unlinked (synthetic) tokens too.
      if (!item) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.ItemNotFound"));

      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);
      
      if (targets.length === 0) {
        return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.SelectTargetForEffect"));
      }

      // Self effects (applyTo: "self") are excluded — they are applied to the owner in item.use().
      // Aura effects too: the payload (applyTo: "aura") is applied by the aura region,
      // and the markers (flags.dedrel.aura) work only on the bearer.
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

    // Applying damage
    if (action === "applyDamage") {
      const damage = parseInt(button.dataset.damage) || 0;
      const drKey = button.dataset.type || "";
      const apLevel = parseInt(button.dataset.ap) || 0;
      // Map of bonuses vs types: "undead:5,shade:3" → { undead:5, shade:3 }.
      const vsMap = {};
      for (const pair of (button.dataset.vsTypes || "").split(",").filter(Boolean)) {
        const [t, p] = pair.split(":");
        vsMap[t] = Number(p) || 0;
      }
      // Type breaker: list of type keys whose DR the weapon ignores.
      const bypassTypes = (button.dataset.bypassTypes || "").split(",").filter(Boolean);

      // First take the selected tokens (controlled), if there are none — take the targets (targets)
      let targets = canvas.tokens.controlled;
      if (targets.length === 0) targets = Array.from(game.user.targets);

      if (targets.length === 0) return ui.notifications.warn(game.i18n.localize("DEDREL.Notifications.NoTargetForDamage"));

      for (let token of targets) {
        const targetActor = token.actor;
        if (!targetActor) continue;

        // "Vs type" bonus: take the maximum potency among the types the target
        // carries and raise the damage by potency·10% BEFORE DR is subtracted.
        let dmg = damage;
        let vsPotency = 0;
        for (const key of (targetActor.creatureTypeKeys || [])) {
          if ((vsMap[key] || 0) > vsPotency) vsPotency = vsMap[key];
        }
        if (vsPotency > 0) {
          dmg = Math.round(damage * (1 + vsPotency * 0.1) * 10) / 10;
        }

        // The DR/temporary HP math lives in DedrelActor#applyDamage
        // (shared with condition ticks in src/combat.mjs)
        const { applied, blocked, tempHpDamage } = await targetActor.applyDamage(dmg, { drKey, apLevel, bypassTypes });

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
          // Negative DR = vulnerability: the damage is increased by -blocked.
          chatMsg += ` <span style="color: var(--color-warning, #c0392b); font-weight: bold; font-size: 0.9em;">${game.i18n.format("DEDREL.Chat.DamageAmplified", {dr: -blocked})}</span>`;
        }
        
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: actor }),
          content: `<div class="dedrel-item-chat"><p>${chatMsg}</p></div>`
        });
      }
    }

    // Saving throw roll
    if (action === "rollSave") {
      const saveAttr = button.dataset.save;
      const saveDc = button.dataset.dc;
      
      // Find the actor: first the selected token, otherwise the player's character
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

    // Applying a spell's condition (the Power Modifier) to the selected tokens.
    // Usually the GM has the permissions; a player can apply it to their own token.
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

    // Placing a template
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
