import { DedrelBonuses } from "../utils/dedrel-bonuses.mjs";

export async function showRollDialog({ actor, title, baseRank, itemId, isSave = false, saveAttr = null, skillId = null }) {
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
          
          await executeRoll({ actor, title, baseRank, itemId, isSpecialized, bonus, penalty, isSave, saveAttr, skillId });
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

async function executeRoll({ actor, title, baseRank, itemId, isSpecialized, bonus, penalty, isSave = false, saveAttr = null, skillId = null }) {
  const woundPenalty = Math.abs(actor.system.resources.wounds?.penalty || 0);

  // Specialization adds +2
  const specBonus = isSpecialized ? 2 : 0;

  // Предмет, по которому идёт бросок (нужен для DSL-модификаторов атаки)
  const item = (actor && itemId) ? actor.items.get(itemId) : null;

  // DSL-модификаторы атаки (flags.dedrel.mod), например Прицеливание:
  // "attack:2; filter:ranged; consume:roll"
  let systemAttackBonus = 0;
  if (item && !isSave) {
    systemAttackBonus = DedrelBonuses.collect(actor, item).attack;
    // Модификатор "Точность" собранного заклинания (Магический Конструктор)
    systemAttackBonus += item.system.attack_bonus || 0;
  }

  const globalRollBonus = actor?.system?.bonuses?.global_roll || 0;
  const globalSkillBonus = (!isSave) ? (actor?.system?.bonuses?.global_skill || 0) : 0;
  const globalSaveBonus = (isSave) ? (actor?.system?.bonuses?.global_save || 0) : 0;
  const specificSaveBonus = (isSave && saveAttr) ? (actor?.system?.attributes[saveAttr]?.save_bonus || 0) : 0;
  const specificSkillBonus = (!isSave && skillId) ? (actor?.system?.skills[skillId]?.bonus || 0) : 0;

  // Точка расширения: макросы и модули могут скорректировать итоговый бонус
  const hookCtx = { actor, item, title, isSave, bonus, penalty, systemAttackBonus };
  Hooks.callAll("dedrelPreRoll", hookCtx);
  bonus = hookCtx.bonus;
  systemAttackBonus = hookCtx.systemAttackBonus;

  // Глобальные бонусы (постоянные эффекты) сводятся в одно слагаемое.
  // global_roll — ко всем броскам; global_skill — только к не-спасам; global_save — только к спасам.
  const globalBonus = globalRollBonus + globalSkillBonus + globalSaveBonus + specificSaveBonus + specificSkillBonus;

  // Construct parts for formula and tooltip
  // Create base roll.
  // xo10 means explode once on a 10, x10 means explode infinitely.
  let explodeMod = "xo10";
  if ((actor?.system?.bonuses?.infinite_explode || 0) > 0) {
    explodeMod = "x10";
  }

  const partLabel = (key) => game.i18n.localize(`DEDREL.Dice.Parts.${key}`);
  let formulaDisplay = `1d10${explodeMod}`;
  if (baseRank) formulaDisplay += ` + ${baseRank} (${partLabel("rank")})`;
  if (specBonus) formulaDisplay += ` + ${specBonus} (${partLabel("spec")})`;
  if (bonus) formulaDisplay += ` + ${bonus} (${partLabel("bonus")})`;
  if (systemAttackBonus) formulaDisplay += ` + ${systemAttackBonus} (${partLabel("buff")})`;
  if (globalBonus > 0) formulaDisplay += ` + ${globalBonus} (${partLabel("system")})`;
  else if (globalBonus < 0) formulaDisplay += ` - ${-globalBonus} (${partLabel("system")})`;
  if (penalty) formulaDisplay += ` - ${penalty} (${partLabel("penalty")})`;
  if (woundPenalty) formulaDisplay += ` - ${woundPenalty} (${partLabel("wounds")})`;

  let rollFormula = `1d10${explodeMod} + ${baseRank}`;
  if (specBonus) rollFormula += ` + ${specBonus}`;
  if (bonus) rollFormula += ` + ${bonus}`;
  if (systemAttackBonus) rollFormula += ` + ${systemAttackBonus}`;
  if (globalBonus > 0) rollFormula += ` + ${globalBonus}`;
  else if (globalBonus < 0) rollFormula += ` - ${-globalBonus}`;
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
        <h4 class="dice-total ${isCritFumble ? 'critical-fumble' : ''}">${isCritFumble ? game.i18n.localize("DEDREL.Dice.FumbleTotal") : roll.total}</h4>
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

  // Сжигаем DSL-модификаторы стадии "roll" (бонусы к атаке).
  // Эффект, у которого остались моды урона (consume:damage), сгорит после броска урона.
  if (item && !isSave) {
    await DedrelBonuses.consumeStage(actor, item, "roll");
  }
}
