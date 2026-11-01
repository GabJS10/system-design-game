import { describe, expect, it } from 'vitest'
import { nextReviewDays } from './review'

describe('nextReviewDays', () => {
  it('sube 3, 7 y 21 según los intentos completados', () => {
    expect(nextReviewDays(0, [])).toBe(3)
    expect(nextReviewDays(1, [])).toBe(7)
    expect(nextReviewDays(2, [])).toBe(21)
    expect(nextReviewDays(5, [])).toBe(21)
  })

  it('las pistas de nivel 1 no adelantan la repetición', () => {
    expect(nextReviewDays(2, [{ key: 'k', level: 1 }])).toBe(21)
  })

  it('una pista de nivel 2 o 3 baja un escalón', () => {
    expect(nextReviewDays(2, [{ key: 'k', level: 3 }])).toBe(7)
    expect(nextReviewDays(5, [{ key: 'k', level: 2 }])).toBe(7)
    expect(nextReviewDays(1, [{ key: 'k', level: 2 }])).toBe(3)
  })

  it('varias pistas bajan un solo escalón y nunca por debajo de 3', () => {
    expect(nextReviewDays(2, [{ key: 'a', level: 2 }, { key: 'b', level: 3 }])).toBe(7)
    expect(nextReviewDays(0, [{ key: 'k', level: 3 }])).toBe(3)
  })
})
