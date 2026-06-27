const { DialogV2 } = foundry.applications.api;

export default class DedrelItem extends Item {
  
  async use() {
    if (!["maneuver", "talent", "mutation"].includes(this.type)) {
      return this.postToChat();
    }

    const apCost = this.system.ap_cost || 0;
    const actor = this.actor;
    if (!actor) return ui.notifications.warn("Предмет не принадлежит персонажу.");

    // Find valid weapons
    let validWeapons = [];
    if (this.type === "maneuver") {
      validWeapons = actor.items.filter(i => {
        if (i.type !== "weapon" || !i.system.equipped) return false;
        
        // Match req_weapon_type
        const reqType = this.system.req_weapon_type;
        if (reqType) {
          const wType = i.system.weapon_type; // "melee", "ranged", "shield"
          
          let match = false;
          if (wType === "melee" && reqType.melee) match = true;
          if (wType === "ranged" && reqType.ranged) match = true;
          if (wType === "shield" && reqType.shield) match = true;
          
          const hasReq = reqType.melee || reqType.ranged || reqType.shield;
          if (hasReq && !match) return false;
        }

        // Match req_weapon_damage_type
        const reqDmg = this.system.req_weapon_damage_type;
        if (reqDmg) {
          const wDmg = i.system.damage_type;
          let match = true;
          if (reqDmg.piercing && !wDmg.piercing) match = false;
          if (reqDmg.bludgeoning && !wDmg.bludgeoning) match = false;
          if (reqDmg.slashing && !wDmg.slashing) match = false;
          
          const hasReq = reqDmg.piercing || reqDmg.bludgeoning || reqDmg.slashing;
          if (hasReq && !match) return false;
        }

        return true;
      });
    } else {
      // For talent/mutation, just grab all equipped weapons in case they augment an attack
      validWeapons = actor.items.filter(i => i.type === "weapon" && i.system.equipped);
    }

    let apUniversal = actor.system.resources?.ap_universal?.value || 0;
    let apSpecific = 0;
    let specificApKey = "";

    if (this.type === "maneuver") {
      apSpecific = actor.system.resources?.ap_maneuver?.value || 0;
      specificApKey = "system.resources.ap_maneuver.value";
    } else if (this.type === "spell" || this.type === "magic_item") {
      apSpecific = actor.system.resources?.ap_magic?.value || 0;
      specificApKey = "system.resources.ap_magic.value";
    }

    let currentAp = apUniversal + apSpecific;
    let warningHtml = apCost > currentAp ? `<p style="color: red; font-weight: bold;">Недостаточно ОД! У вас ${currentAp}, требуется ${apCost}.</p>` : "";
    let weaponSelectHtml = "";
    
    if (validWeapons.length > 0) {
      weaponSelectHtml = `
        <div class="form-group" style="margin-top: 10px;">
          <label style="font-weight: bold;">Оружие: </label>
          <select name="weaponId" id="use-weapon-select" style="width: 100%; padding: 4px;">
            ${validWeapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
          </select>
        </div>
      `;
    } else if (this.type === "maneuver") {
      weaponSelectHtml = `<p style="color: orange; font-style: italic;">Нет подходящего экипированного оружия.</p>`;
    }

    let content = `
      <div style="margin-bottom: 15px;">
        <p>Использовать <b>${this.name}</b> за <strong>${apCost} ОД</strong>?</p>
        ${warningHtml}
        ${weaponSelectHtml}
      </div>
    `;

    if (apCost > 0 || validWeapons.length > 0) {
      await DialogV2.wait({
        window: { title: `Использование: ${this.name}` },
        content: content,
        buttons: [
          {
            action: "confirm",
            icon: "fa-solid fa-check",
            label: "Подтвердить",
            callback: async (event, button, dialog) => {
              const weaponSelect = dialog.element.querySelector("#use-weapon-select");
              const selectedWeaponId = weaponSelect ? weaponSelect.value : null;
              
              if (apCost > 0) {
                let costLeft = apCost;
                let updates = {};
                
                if (specificApKey) {
                  let specificSpend = Math.min(apSpecific, costLeft);
                  updates[specificApKey] = apSpecific - specificSpend;
                  costLeft -= specificSpend;
                }
                
                if (costLeft > 0) {
                  let uniSpend = Math.min(apUniversal, costLeft);
                  updates["system.resources.ap_universal.value"] = apUniversal - uniSpend;
                }
                
                await actor.update(updates);
              }
              
              await this.postToChat(selectedWeaponId);
            }
          },
          {
            action: "cancel",
            icon: "fa-solid fa-times",
            label: "Отмена"
          }
        ]
      });
    } else {
      await this.postToChat(null);
    }
  }

  async postToChat(weaponId = null) {
    let weaponAttr = weaponId ? `data-weapon-id="${weaponId}"` : "";
    
    let buttons = `
      <div class="chat-buttons" style="display: flex; gap: 5px; margin-top: 10px;">
        <button class="dedrel-chat-action" data-action="rollAttack" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-crosshairs"></i> Атака</button>
        <button class="dedrel-chat-action" data-action="rollDamage" data-item-id="${this.id}" ${weaponAttr}><i class="fa-solid fa-tint"></i> Урон</button>
      </div>
    `;

    let content = `
      <div class="dedrel-item-chat">
        <h3 style="border-bottom: 1px solid var(--color-border-dark); padding-bottom: 3px; margin-bottom: 8px;">${this.name}</h3>
        <div class="description" style="margin-bottom: 8px;">${this.system.description || ""}</div>
        ${buttons}
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content
    });
  }
}
