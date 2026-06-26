export async function showRollDialog({ actor, title, baseRank, itemId, isSave = false }) {
  // HTML Content for the Dialog using V14 namespace
  const content = await foundry.applications.handlebars.renderTemplate("systems/dedrel/templates/apps/roll-dialog.hbs", {
    title: title,
    baseRank: baseRank,
    isSave: isSave,
    // Note: We can fetch talents related to this roll here in the future
    talentsInfo: "" 
  });

  const { DialogV2 } = foundry.applications.api;

  await DialogV2.wait({
    window: { title: `Бросок: ${title}` },
    content: content,
    buttons: [
      {
        action: "roll",
        icon: "fa-solid fa-dice",
        label: "Бросок",
        callback: async (event, button, dialog) => {
          const html = $(dialog.element);
          const isSpecialized = isSave ? false : html.find('[name="specialization"]').is(":checked");
          const bonus = parseInt(html.find('[name="bonus"]').val()) || 0;
          const penalty = parseInt(html.find('[name="penalty"]').val()) || 0;
          
          await executeRoll({ actor, title, baseRank, isSpecialized, bonus, penalty });
        }
      },
      {
        action: "cancel",
        icon: "fa-solid fa-times",
        label: "Отмена"
      }
    ]
  });
}

async function executeRoll({ actor, title, baseRank, isSpecialized, bonus, penalty }) {
  // Specialization adds +2
  const specBonus = isSpecialized ? 2 : 0;
  const totalMod = specBonus + bonus - penalty;
  
  // Create base roll. 
  // xo10 means explode once on a 10.
  let rollFormula = `1d10xo10 + ${baseRank}`;
  if (totalMod !== 0) {
    rollFormula += totalMod > 0 ? ` + ${totalMod}` : ` - ${Math.abs(totalMod)}`;
  }

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
        customChatAddon = `<div class="dedrel-fumble" style="color: red; font-weight: bold; margin-top: 5px;">КРИТИЧЕСКИЙ ПРОВАЛ! (Подтверждающий бросок: 1)</div>`;
      } else {
        // If not a 1 on reroll, result treats the first die as +1 (total)
        // Since the first die was a 1, its value is already 1 in the roll total.
        // We just add a note that a fumble was averted.
        customChatAddon = `<div class="dedrel-fumble-averted" style="color: black; font-style: italic; margin-top: 5px;">Провал предотвращён. (Подтверждающий бросок: ${fumbleResult})</div>`;
      }
    }
  }

  // We could use native ChatMessage creation, but intercept the flavor
  let flavor = `<b>${title}</b>`;
  if (isSpecialized) flavor += ` (Специализация)`;
  if (bonus) flavor += ` | Бонус: +${bonus}`;
  if (penalty) flavor += ` | Штраф: -${penalty}`;

  // If we want total control we create our own message, 
  // but Roll#toMessage handles dice tooltips nicely.
  
  // First we get the native HTML
  const rollHtml = await roll.getTooltip();
  
  // Build a custom message content
  let messageContent = `
    <div class="dice-roll">
      <div class="dice-result">
        <div class="dice-formula">${roll.formula}</div>
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
}
