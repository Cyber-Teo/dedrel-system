/**
 * Лестница урона Dedrel — глобальный инструмент повышения/понижения кубов.
 *
 * Каноническая прогрессия (каждая ступень ощутимо сильнее предыдущей):
 *   0. Импровизация   1d4   (ср. 2.5)  — кулак, факел
 *   I. Лёгкое         1d6   (ср. 3.5)  — кинжал, когти, дубина в одной руке
 *   II. Боевое        2d4   (ср. 5)    — короткий меч, сабля, булава, короткое копьё
 *   III. Тяжёлое      2d6   (ср. 7)    — длинный меч в двух руках, топор, фальчион, глефа
 *   IV. Двуручное     2d8   (ср. 9)    — двуручный меч, алебарда, мушкет
 *   V. Исключительное 3d6   (ср. 10.5) — осадное, магическое, аркебуза в упор
 *
 * Сдвиг по лестнице — единый механизм и для бафов (dice_step:+N), и для нерфов
 * (dice_step:-N). Применяется к БАЗОВОЙ формуле урона оружия/манёвра; аддитивные
 * добавки ("damage:1d6") лестницей не трогаются.
 *
 * Кубы вне лестницы (1d8, 1d10, 4d6 и т.п.) сдвигаются на ближайшую ступень
 * по среднему значению: вверх — на первую ступень со средним СТРОГО больше,
 * вниз — на последнюю со средним СТРОГО меньше. На краях лестницы сдвиг
 * упирается в 1d4 / 3d6.
 */

/** Ступени лестницы: [количество, грани]. Порядок строго по возрастанию среднего. */
export const DICE_LADDER = [
  { count: 1, faces: 4 },   // 0. Импровизация
  { count: 1, faces: 6 },   // I. Лёгкое
  { count: 2, faces: 4 },   // II. Боевое
  { count: 2, faces: 6 },   // III. Тяжёлое / древковое
  { count: 2, faces: 8 },   // IV. Двуручное
  { count: 3, faces: 6 }    // V. Исключительное
];

const avg = (count, faces) => count * (faces + 1) / 2;
const LADDER_AVG = DICE_LADDER.map(s => avg(s.count, s.faces));

/**
 * Индекс ступени для произвольного куба.
 * Точное совпадение — её индекс; иначе null (куб вне лестницы).
 */
function ladderIndex(count, faces) {
  const i = DICE_LADDER.findIndex(s => s.count === count && s.faces === faces);
  return i === -1 ? null : i;
}

/**
 * Сдвигает один кубовый терм на steps ступеней лестницы.
 * @param {number} count - количество кубов
 * @param {number} faces - грани куба
 * @param {number} steps - сдвиг (положительный — вверх, отрицательный — вниз)
 * @returns {{count: number, faces: number}}
 */
export function stepDice(count, faces, steps) {
  if (!steps) return { count, faces };

  let idx = ladderIndex(count, faces);

  if (idx === null) {
    // Куб вне лестницы: первый шаг — на ближайшую ступень в нужную сторону.
    const a = avg(count, faces);
    if (steps > 0) {
      idx = LADDER_AVG.findIndex(la => la > a);
      if (idx === -1) return { count, faces }; // выше вершины лестницы — не растёт
      steps -= 1;
    } else {
      idx = LADDER_AVG.findLastIndex(la => la < a);
      if (idx === -1) return { ...DICE_LADDER[0] }; // ниже подножия — падает на 1d4
      steps += 1;
    }
  }

  const target = Math.clamp(idx + steps, 0, DICE_LADDER.length - 1);
  return { ...DICE_LADDER[target] };
}

/**
 * Сдвигает все кубовые термы формулы на steps ступеней, сохраняя модификаторы
 * термов (xo и т.п.), флейвор ([heat]) и остальную формулу.
 * @param {string} formula - например "2d6", "2d8xo + 2", "4d6[heat]"
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

/** Человекочитаемая строка ступени: stepLabel(3) → "2d6". */
export function stepLabel(index) {
  const s = DICE_LADDER[Math.clamp(index, 0, DICE_LADDER.length - 1)];
  return `${s.count}d${s.faces}`;
}
