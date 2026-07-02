import { DedrelBonuses } from "../utils/dedrel-bonuses.mjs";

export async function showRollDialog({ actor, title, baseRank, itemId, isSave = false }) {
  const situationalTalents = actor ? actor.items.filter(i => 
    (i.type === "talent" || i.type === "mutation") && 
    i.system.has_situational_bonus
  ).map(i => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = i.system.description || "";
    return {
      name: i.name,
      description: tempDiv.textContent || tempDiv.innerText || ""
    };
  }) : [];

  // HTML Content for the Dialog using V14 namespace
  const content = await foundry.applications.handlebars.renderTemplate("systems/dedrel/templates/apps/roll-dialog.hbs", {
    title: title,
    baseRank: baseRank,
    isSave: isSave,
    situationalTalents: situationalTalents 
  });

  const { DialogV2 } = foundry.applications.api;

  await DialogV2.wait({
    window: { 
      title: `${game.i18n.localize("DEDREL.Chat.Roll")}: ${title}`
    },
    position: { width: 500 },
    content: content,
    buttons: [
      {
        action: "roll",
        icon: "fa-solid fa-dice",
        label: game.i18n.localize("DEDREL.Chat.Roll"),
        callback: async (event, button, dialog) => {
          const html = dialog.element;
          const isSpecialized = isSave ? false : (html.querySelector('[name="specialization"]')?.checked ?? false);
          let bonus = parseInt(html.querySelector('[name="bonus"]')?.value) || 0;
          const penalty = parseInt(html.querySelector('[name="penalty"]')?.value) || 0;
          
          await executeRoll({ actor, title, baseRank, itemId, isSpecialized, bonus, penalty, isSave });
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

async function executeRoll({ actor, title, baseRank, itemId, isSpecialized, bonus, penalty, isSave = false }) {
  const woundPenalty = Math.abs(actor.system.resources.wounds?.penalty || 0);

  // Specialization adds +2
  const specBonus = isSpecialized ? 2 : 0;
  
  // Прицеливание (Take Aim) дает +2 к дальним выстрелам - обратная совместимость
  let takeAimBonus = 0;
  let isTakeAimAttack = false;
  const takeAimTriggers = ["Выстрел из лука", "Выстрел из арбалета", "Выстрел из огнестрела"];
  if (actor?.flags?.dedrel?.takeAimBonus && takeAimTriggers.some(t => title.includes(t))) {
    takeAimBonus = 2;
    isTakeAimAttack = true;
  }
  
  // Системные бонусы к атаке
  let systemAttackBonus = 0;
  let consumedAttackKeys = [];
  if (actor && itemId) {
    const item = actor.items.get(itemId);
    if (item) {
      const bonuses = DedrelBonuses.extractNextActionBonuses(actor, item);
      if (bonuses.attack !== 0) {
        systemAttackBonus = bonuses.attack;
        const attackKeys = ["system.bonuses.next_attack", "system.bonuses.next_melee_attack", "system.bonuses.next_ranged_attack"];
        consumedAttackKeys = bonuses.usedKeys.filter(k => attackKeys.includes(k));
      }
    }
  }
  
  const globalRollBonus = actor?.system?.bonuses?.global_roll || 0;
  const globalSkillBonus = (!isSave) ? (actor?.system?.bonuses?.global_skill || 0) : 0;
  const globalSaveBonus = (isSave) ? (actor?.system?.bonuses?.global_save || 0) : 0;
  
  const totalMod = specBonus + bonus + takeAimBonus + systemAttackBonus - penalty - woundPenalty + globalRollBonus + globalSkillBonus + globalSaveBonus;
  
  // Construct parts for formula and tooltip
  // Create base roll. 
  // xo10 means explode once on a 10.
  let formulaDisplay = `1d10xo10`;
  if (baseRank) formulaDisplay += ` + ${baseRank} (ранг)`;
  if (specBonus) formulaDisplay += ` + ${specBonus} (спец.)`;
  if (bonus) formulaDisplay += ` + ${bonus} (бонус)`;
  if (takeAimBonus) formulaDisplay += ` + ${takeAimBonus} (прицеливание)`;
  if (systemAttackBonus) formulaDisplay += ` + ${systemAttackBonus} (бафф)`;
  if (penalty) formulaDisplay += ` - ${penalty} (штраф)`;
  if (woundPenalty) formulaDisplay += ` - ${woundPenalty} (раны)`;

  let rollFormula = `1d10xo10 + ${baseRank}`;
  if (specBonus) rollFormula += ` + ${specBonus}`;
  if (bonus) rollFormula += ` + ${bonus}`;
  if (takeAimBonus) rollFormula += ` + ${takeAimBonus}`;
  if (systemAttackBonus) rollFormula += ` + ${systemAttackBonus}`;
  if (penalty) rollFormula += ` - ${penalty}`;
  if (woundPenalty) rollFormula += ` - ${woundPenalty}`;

  let roll = new Roll(rollFormula);
  await roll.evaluate();

  // Crit Fumble Logic check
  let isCritFumble = false;
  let customChatAddon = "";

  // Dice terms (the 1d10 part)
  const d10Term = roll.terms.find(t => t instanceof foundry.dice.terms.Die && t.faces === 10);
  if (d10Term && d10Term.results.length > 0) {
    // The first die rolled
    const firstRoll = d10Term.results[0].result;
    
    if (firstRoll === 1) {
      // Roll a second d10 for fumble confirm
      const fumbleRoll = new Roll("1d10");
      await fumbleRoll.evaluate();
      const fumbleResult = fumbleRoll.total;

      if (fumbleResult === 1) {
        isCritFumble = true;
        customChatAddon = `<div class="dedrel-fumble" style="color: red; font-weight: bold; margin-top: 5px;">${game.i18n.localize("DEDREL.Dice.CriticalFumble")}</div>`;
      } else {
        // If not a 1 on reroll, result treats the first die as +1 (total)
        // Since the first die was a 1, its value is already 1 in the roll total.
        // We just add a note that a fumble was averted.
        customChatAddon = `<div class="dedrel-fumble-averted" style="color: black; font-style: italic; margin-top: 5px;">${game.i18n.format("DEDREL.Dice.FumbleAverted", {fumbleResult: fumbleResult})}</div>`;
      }
    }
  }

  // We could use native ChatMessage creation, but intercept the flavor
  let flavor = `<b>${title}</b>`;
  
  // First we get the native HTML
  const rollHtml = await roll.getTooltip();
  
  // Build a custom message content
  let messageContent = `
    <div class="dice-roll">
      <div class="dice-result">
        <div class="dice-formula" style="font-size: 12px; line-height: 1.2; padding: 5px; text-align: left;">${formulaDisplay}</div>
        ${rollHtml}
        <h4 class="dice-total ${isCritFumble ? 'critical-fumble' : ''}">${isCritFumble ? 'ПРОВАЛ' : roll.total}</h4>
        ${customChatAddon}
      </div>
    </div>
  `;

  let chatData = {
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    flavor: flavor,
    content: messageContent,
    rolls: [roll]
  };

  await ChatMessage.create(chatData);

  // Если использовали прицеливание, удаляем бафф после броска
  if (isTakeAimAttack) {
    const effectToRemove = actor.effects.find(e => e.changes.some(c => c.key === "flags.dedrel.takeAimBonus"));
    if (effectToRemove) await effectToRemove.delete();
  }
  
  // Удаляем использованные системные бонусы к атаке
  if (consumedAttackKeys.length > 0) {
    await DedrelBonuses.consumeNextActionBonuses(actor, consumedAttackKeys);
  }
}
