/**
 * Хук "hotbarDrop" перехватывает перетаскивание предметов и навыков на панель макросов.
 */
Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type === "Item") {
    createItemMacro(data, slot);
    return false;
  }
  if (data.type === "Skill") {
    createSkillMacro(data, slot);
    return false;
  }
});

async function createItemMacro(data, slot) {
  const item = await Item.implementation.fromDropData(data);
  if (!item) return;
  const command = `game.dedrel.rollItemMacro("${item.name}");`;
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "dedrel.itemMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
}

async function createSkillMacro(data, slot) {
  const skillName = game.i18n.localize(`DEDREL.Skills.${data.skillId}`);
  const command = `game.dedrel.rollSkillMacro("${data.skillId}");`;
  let macro = game.macros.find(m => (m.name === skillName) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: skillName,
      type: "script",
      img: "icons/svg/d20.svg",
      command: command,
      flags: { "dedrel.skillMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
}
