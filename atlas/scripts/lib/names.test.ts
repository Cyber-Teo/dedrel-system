import { describe, expect, it } from 'vitest'
import { levenshtein, normName, wildcardMatch } from './names'

describe('normName', () => {
  it('ё→е, регистр, мягкий перенос', () => {
    expect(normName('Мёртвые горы')).toBe('мертвые горы')
    expect(normName('Хра­штица')).toBe('храштица')
  })
  it('префиксы р./г./о. и скобки', () => {
    expect(normName('р. Розовая')).toBe('розовая')
    expect(normName('р.Розовая')).toBe('розовая')
    expect(normName('г.Данир')).toBe('данир')
    expect(normName('о. Радужное')).toBe('радужное')
    expect(normName('Нижний Балаттер (порт)')).toBe('нижний балаттер')
  })
  it('дефисы как пробелы', () => {
    expect(normName('Хаганэ-но-Кокуру')).toBe(normName('Хаганэ но Кокуру'))
  })
})
describe('levenshtein', () => {
  it('расстояния', () => {
    expect(levenshtein('талар', 'талор')).toBe(1)
    expect(levenshtein('трина', 'триана')).toBe(1)
    expect(levenshtein('', 'аб')).toBe(2)
  })
})
describe('wildcardMatch', () => {
  it('? — неразобранные буквы', () => {
    expect(wildcardMatch('?раконья', 'стародраконья')).toBe(true)
    expect(wildcardMatch('драко?', 'драконов')).toBe(true)
    expect(wildcardMatch('?ое', 'море')).toBe(false)
  })
})
