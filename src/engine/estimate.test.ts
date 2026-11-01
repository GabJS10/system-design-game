import { describe, expect, it } from 'vitest'
import { judgeEstimate, parseEstimate } from './estimate'

describe('parseEstimate', () => {
  it.each([
    ['1.000', 1000],
    ['1.000.000', 1_000_000],
    ['1.000,5', 1000.5],
    ['12,7', 12.7],
    ['1.27', 1.27],
    ['1.2345', 1.2345],
    [' 40 ', 40],
  ])('lee %s', (text, value) => {
    expect(parseEstimate(text)).toBe(value)
  })

  it.each(['', '   ', 'abc', '0', '-3', '12abc', '1,2,3', '1e3', 'Infinity'])('rechaza "%s"', (text) => {
    expect(parseEstimate(text)).toBeNull()
  })
})

describe('judgeEstimate', () => {
  it.each([
    [40, 40, 'bien'],
    [100, 40, 'bien'],
    [16, 40, 'bien'],
    [300, 40, 'cerca'],
    [5, 40, 'cerca'],
    [4000, 40, 'lejos'],
    [1, 40, 'lejos'],
  ])('%d frente a %d', (value, real, verdict) => {
    expect(judgeEstimate(value, real)).toBe(verdict)
  })
})
