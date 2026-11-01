import type { HintUse } from './hints'

const INTERVALS = [3, 7, 21] as const

/** Intervalo hasta repetir: 3, 7 y 21 días; una pista de nivel 2 o 3 lo adelanta un escalón. */
export function nextReviewDays(completedAttempts: number, uses: HintUse[]): 3 | 7 | 21 {
  const step = Math.min(completedAttempts, INTERVALS.length - 1)
  const early = uses.some((u) => u.level >= 2) ? 1 : 0
  return INTERVALS[Math.max(0, step - early)]
}
