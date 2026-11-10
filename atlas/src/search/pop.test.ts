// Данные карточек: «Население» — только числа и оценки; служебные пометки не просачиваются в связи.
import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { placesAll } from './data'
import { placeFields } from './card'

const EST = /\d|мал[оа]е? населен|второй по населен|до половины|куда больш|больш\w+ населен/iu
describe('данные карточек', () => {
  it('в «Населении» каждое значение с цифрой или словом-оценкой', () => {
    const bad: string[] = []
    for (const p of placesAll)
      for (const i of placeFields(p.hint, p.facts).shown.find((s) => s.title === 'Население')?.items ?? [])
        if (!EST.test(i.text)) bad.push(`${p.id}: ${i.text}`)
    expect(bad).toEqual([])
  })
  it('суд над Катбертом и «рост мощи» не в «Населении» Данира и Вышневодска', () => {
    for (const id of ['geo:danir', 'geo:danir_gorod', 'geo:vyshnevodsk']) {
      const p = placesAll.find((x) => x.id === id)!
      const pop =
        placeFields(p.hint, p.facts)
          .shown.find((s) => s.title === 'Население')
          ?.items.map((i) => i.text)
          .join(' ') ?? ''
      expect(pop).not.toMatch(/суд над Катбертом|рост мощи/)
    }
  })
  it('в note связей нет служебных пометок', () => {
    const notes = readFileSync('data/relations.yaml', 'utf8')
      .split('\n')
      .filter((l) => /^\s+note:/.test(l))
    expect(notes.filter((n) => /выжимк|G1|G2|вывод:/.test(n))).toEqual([])
  })
})
