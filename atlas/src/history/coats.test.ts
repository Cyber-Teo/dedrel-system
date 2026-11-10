import { describe, expect, it } from 'vitest'
import { coatUrl } from './coats'

describe('coatUrl', () => {
  it('подтверждённые гербы есть, неподтверждённые и неизвестные — null', () => {
    expect(coatUrl('countries/illior_empire/index')).toMatch(/coats\/illior_empire\.webp$/)
    expect(coatUrl('countries/dragons_country/index')).toBeNull()
    expect(coatUrl('countries/rojo/index')).toBeNull()
    expect(coatUrl('countries/khrell/index')).toBeNull()
  })
})
