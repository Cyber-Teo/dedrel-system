/**
 * Action economy: "one Action per turn" (_rules/14. Combat Maneuvers).
 *
 * A maneuver's type can't be read from its card: most are marked as both
 * Action + Chain (or Action + Reaction), and what the maneuver turns out to be is decided
 * by HOW it is used. So the mode is computed at the moment of use:
 * launched from the chain HUD — Chain, not your turn — Reaction, everything else uses up
 * the turn's Action.
 *
 * The counter deliberately warns rather than forbids: a reaction can
 * fire on your own turn too (you knocked the target down with a Leg Sweep — Finishing Blow fired),
 * the automation can't tell such a case apart, and blocking would break a legal
 * turn. Same logic as Speed overspending in src/canvas/movement.mjs.
 */

const FLAG_SCOPE = "dedrel";
const FLAG_KEY = "actionSpent";

export const ActionEconomy = {
  /**
   * What the maneuver turned out to be this time.
   * @param {Actor} actor
   * @param {Item} item
   * @param {"chain"|"reaction"|undefined} requested — the mode declared by the caller
   * @returns {"action"|"chain"|"reaction"|"free"}
   */
  resolveMode(actor, item, requested) {
    const types = item.system?.action_type || {};
    if (types.free) return "free";
    if (requested === "chain" && types.chain) return "chain";
    if (requested === "reaction" && types.reaction) return "reaction";

    // Outside your own turn an Action can't be spent — so it's a Reaction.
    if (types.reaction && !this.isOwnTurn(actor)) return "reaction";

    if (types.action) return "action";
    if (types.chain) return "chain";
    if (types.reaction) return "reaction";
    return "free";
  },

  /**
   * Whether it's currently this actor's turn. Compared by uuid, not by id: for
   * unlinked tokens the synthetic actor inherits the base actor's id, so
   * by id a whole wolf pack from one prototype would count as one creature.
   */
  isOwnTurn(actor) {
    if (!game.combat?.started || !actor) return false;
    return game.combat.combatant?.actor?.uuid === actor.uuid;
  },

  /** Whether the actor takes part in a started combat (not necessarily on its turn). */
  isInCombat(actor) {
    if (!game.combat?.started || !actor) return false;
    return game.combat.combatants.some(c => c.actor?.uuid === actor.uuid);
  },

  /** Whether the Action has been spent this turn. */
  isActionSpent(actor) {
    return !!actor?.getFlag(FLAG_SCOPE, FLAG_KEY);
  },

  /**
   * Marks the Action as spent. Returns true if it had already been
   * spent — the caller decides whether to warn the player.
   */
  async spendAction(actor) {
    if (!actor || !game.combat?.started) return false;
    const already = this.isActionSpent(actor);
    if (!already) await actor.setFlag(FLAG_SCOPE, FLAG_KEY, true);
    return already;
  },

  /** Reset at turn start — called from the same place where AP is restored. */
  async resetAction(actor) {
    if (!actor) return;
    if (this.isActionSpent(actor)) await actor.setFlag(FLAG_SCOPE, FLAG_KEY, false);
  }
};
