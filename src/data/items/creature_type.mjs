/**
 * "Creature Type" Item (creature_type). A tag marking a creature's membership in a
 * category (à la D&D creature types) + a bearer of innate bonuses.
 *
 * How to use/balance:
 *  - system.key — the type's stable key (see CONFIG.DEDREL.creatureTypes),
 *    weapons/effects will strike "against the type" by it;
 *  - bonuses for the whole kind (DR, defenses, speed, immunities) are attached via
 *    this Item's standard Active Effects tab — they transfer to the actor
 *    while the item is in its inventory (as with talents/conditions);
 *  - the description goes in the "Description" tab.
 *
 * The item goes into an NPC's (or character's) inventory; the NPC sheet shows the type
 * in the header. One actor can carry several types.
 */
export default class CreatureTypeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField } = foundry.data.fields;
    return {
      key: new StringField({ required: false, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
