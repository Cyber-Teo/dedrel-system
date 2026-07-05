export default class DedrelActor extends Actor {
  async _preCreate(data, options, userId) {
    await super._preCreate(data, options, userId);
    
    // Setup default token settings for new actors
    if (this.type === "character" && userId === game.user.id) {
      const prototypeToken = {
        actorLink: true,
        vision: true,
        displayName: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        bar1: { attribute: "resources.hp" }
      };
      this.updateSource({ prototypeToken });
    }
  }

  /**
   * Ядро применяет здесь фазу "initial" (в super). Сразу после неё выполняем
   * нашу фазу "apply" — в ней живут все изменения системных полей (system.*),
   * автоматически помечаемые хуком preCreateActiveEffect. Обе фазы отрабатывают
   * ДО prepareDerivedData, поэтому баффы характеристик участвуют в расчёте
   * производных, а бонусы к производным полям переживают паттерн "+=".
   */
  prepareEmbeddedDocuments() {
    super.prepareEmbeddedDocuments();
    this.applyActiveEffects("apply");
  }

  prepareData() {
    super.prepareData();
    if (this.type === "character" && this.system.senses) {
      const darkvision = this.system.senses.darkvision || 0;
      if (darkvision > 0) {
        this.prototypeToken.updateSource({
          "sight.visionMode": "darkvision",
          "sight.range": darkvision
        });
      } else {
        this.prototypeToken.updateSource({
          "sight.visionMode": "basic",
          "sight.range": 0
        });
      }
    }
  }

  _syncVisionToTokens() {
    if (this.type !== "character" || !this.isOwner) return;
    
    const protoSight = this.prototypeToken.sight;
    const tokens = this.getActiveTokens();
    
    for (let t of tokens) {
      const tSight = t.document.sight;
      if (tSight.visionMode !== protoSight.visionMode || tSight.range !== protoSight.range) {
        t.document.update({
          "sight.visionMode": protoSight.visionMode,
          "sight.range": protoSight.range
        });
      }
    }
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }

  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (game.user.id === userId) this._syncVisionToTokens();
  }
}
