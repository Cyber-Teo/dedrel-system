/**
 * The "hotbarDrop" hook intercepts dragging items and skills onto the macro bar.
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

async function getOrCreateActorMacroFolder(actorName) {
  let folder = game.folders.find(f => f.type === "Macro" && f.name === actorName);
  if (!folder) {
    folder = await Folder.create({
      name: actorName,
      type: "Macro"
    });
  }
  return folder;
}

async function createItemMacro(data, slot) {
  const item = await Item.implementation.fromDropData(data);
  if (!item) return;
  const command = `game.dedrel.rollItemMacro("${item.name}");`;
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  
  let folderId = null;
  if (item.actor) {
    const folder = await getOrCreateActorMacroFolder(item.actor.name);
    folderId = folder.id;
  }

  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      folder: folderId,
      flags: { "dedrel.itemMacro": true }
    });
  } else if (macro.folder !== folderId && folderId) {
    await macro.update({ folder: folderId });
  }
  game.user.assignHotbarMacro(macro, slot);
}

async function createSkillMacro(data, slot) {
  const skillName = game.i18n.localize(`DEDREL.Skills.${data.skillId}`);
  const command = `game.dedrel.rollSkillMacro("${data.skillId}");`;
  let macro = game.macros.find(m => (m.name === skillName) && (m.command === command));
  
  let folderId = null;
  if (data.actorId) {
    const actor = game.actors.get(data.actorId);
    if (actor) {
      const folder = await getOrCreateActorMacroFolder(actor.name);
      folderId = folder.id;
    }
  }

  if (!macro) {
    macro = await Macro.create({
      name: skillName,
      type: "script",
      img: `systems/dedrel/assets/icons/skills/${data.skillId}.svg`,
      command: command,
      folder: folderId,
      flags: { "dedrel.skillMacro": true }
    });
  } else if (macro.folder !== folderId && folderId) {
    await macro.update({ folder: folderId });
  }
  game.user.assignHotbarMacro(macro, slot);
}
