/* ==================================================
 * Хуки для Аур Токенов
 * ================================================== */
function refreshTokensForAuras() {
  if (!canvas.ready) return;
  canvas.tokens.placeables.forEach(t => t.renderFlags.set({refreshState: true}));
}

function refreshActorTokensForAuras(item) {
  if (item.parent && item.parent.documentName === "Actor" && item.type === "weapon") {
    item.parent.getActiveTokens().forEach(t => t.renderFlags.set({refreshState: true}));
  }
}

Hooks.on("updateCombat", refreshTokensForAuras);
Hooks.on("deleteCombat", refreshTokensForAuras);
Hooks.on("createItem", refreshActorTokensForAuras);
Hooks.on("updateItem", refreshActorTokensForAuras);
Hooks.on("deleteItem", refreshActorTokensForAuras);
