/**
 * The Dedrel Damage Ladder — a global tool for raising/lowering dice.
 *
 * Canonical progression (each step is noticeably stronger than the previous one):
 *   0. Improvised     1d4   (avg 2.5)  — fist, torch
 *   I. Light          1d6   (avg 3.5)  — dagger, claws, one-handed club
 *   II. Martial       2d4   (avg 5)    — short sword, saber, mace, short spear
 *   III. Heavy        2d6   (avg 7)    — two-handed longsword, axe, falchion, glaive
 *   IV. Two-handed    2d8   (avg 9)    — greatsword, halberd, musket
 *   V. Exceptional    3d6   (avg 10.5) — siege, magical, point-blank arquebus
 *
 * A shift along the ladder is a single mechanism for both buffs (dice_step:+N) and nerfs
 * (dice_step:-N). It applies to the weapon's/maneuver's BASE damage formula; additive
 * bonuses ("damage:1d6") aren't touched by the ladder.
 *
 * Dice off the ladder (1d8, 1d10, 4d6, etc.) shift to the nearest step
 * by average: up — to the first step with an average STRICTLY greater,
 * down — to the last one with an average STRICTLY smaller. At the ladder's edges the shift
 * stops at 1d4 / 3d6.
 */

/** Ladder steps: [count, faces]. Ordered strictly by increasing average. */
export const DICE_LADDER = [
  { count: 1, faces: 4 },   // 0. Improvised
  { count: 1, faces: 6 },   // I. Light
  { count: 2, faces: 4 },   // II. Martial
  { count: 2, faces: 6 },   // III. Heavy / polearm
  { count: 2, faces: 8 },   // IV. Two-handed
  { count: 3, faces: 6 }    // V. Exceptional
];

const avg = (count, faces) => count * (faces + 1) / 2;
const LADDER_AVG = DICE_LADDER.map(s => avg(s.count, s.faces));

/**
 * Step index for an arbitrary die.
 * An exact match — its index; otherwise null (die off the ladder).
 */
function ladderIndex(count, faces) {
  const i = DICE_LADDER.findIndex(s => s.count === count && s.faces === faces);
  return i === -1 ? null : i;
}

/**
 * Shifts one dice term by steps ladder steps.
 * @param {number} count - number of dice
 * @param {number} faces - faces per die
 * @param {number} steps - shift (positive — up, negative — down)
 * @returns {{count: number, faces: number}}
 */
export function stepDice(count, faces, steps) {
  if (!steps) return { count, faces };

  let idx = ladderIndex(count, faces);

  if (idx === null) {
    // A die off the ladder: the first step goes to the nearest step in the needed direction.
    const a = avg(count, faces);
    if (steps > 0) {
      idx = LADDER_AVG.findIndex(la => la > a);
      if (idx === -1) return { count, faces }; // above the top of the ladder — doesn't grow
      steps -= 1;
    } else {
      idx = LADDER_AVG.findLastIndex(la => la < a);
      if (idx === -1) return { ...DICE_LADDER[0] }; // below the foot — drops to 1d4
      steps += 1;
    }
  }

  const target = Math.clamp(idx + steps, 0, DICE_LADDER.length - 1);
  return { ...DICE_LADDER[target] };
}

/**
 * Shifts all dice terms of a formula by steps steps, keeping the terms'
 * modifiers (xo etc.), flavor ([heat]) and the rest of the formula.
 * @param {string} formula - e.g. "2d6", "2d8xo + 2", "4d6[heat]"
 * @param {number} steps
 * @returns {string}
 */
export function stepFormula(formula, steps) {
  if (!steps || typeof formula !== "string" || !formula) return formula;
  return formula.replace(/(\d+)d(\d+)/gi, (_, c, f) => {
    const stepped = stepDice(parseInt(c, 10), parseInt(f, 10), steps);
    return `${stepped.count}d${stepped.faces}`;
  });
}

/**
 * Average value of a damage formula: the sum of the averages of all dice terms (NdM) and
 * flat modifiers (+N/-N), sign included. Needed to compare the formulas
 * of a weapon's different damage types and pick the larger one (see type selection in chat.mjs).
 * Terms with variables (@attributes...) aren't evaluated and aren't included in the sum.
 * @param {string} formula - e.g. "2d6", "2d8xo + 2", "1d6"
 * @returns {number}
 */
export function formulaAverage(formula) {
  if (typeof formula !== "string" || !formula) return 0;
  let total = 0;
  const re = /([+-]?)\s*(?:(\d+)d(\d+)|(\d+))/gi;
  let m;
  while ((m = re.exec(formula)) !== null) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[2]) total += sign * avg(parseInt(m[2], 10), parseInt(m[3], 10));
    else if (m[4] !== undefined) total += sign * parseInt(m[4], 10);
  }
  return total;
}
