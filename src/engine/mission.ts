import type { HintSet } from './hints'
import type { Design, PieceKind, Scenario } from './types'

export type Question = { id: string; text: string; answer: string; useful: boolean }
export type ScopeItem = { id: string; label: string; inScope: boolean }
export type Role = {
  id: string
  label: string
  referenceKinds: PieceKind[]
  acceptedKinds: PieceKind[]
  noteUrl: string
}
export type Rule = {
  id: string
  label: string
  noteUrl: string
  check: (design: Design, decisions: Record<string, string>) => boolean
}
export type Decision = {
  id: string
  prompt: string
  options: { id: string; label: string }[]
  validOptionIds: string[]
  noteUrl: string
}
export type Variant = {
  id: string
  monthlyWrites: number
  monthlyReads: number
  writeRps: number
  readRps: number
  storageGbPerMonth: number
  budget: number
  reference: Design
}
export type Mission = {
  id: string
  title: string
  questions: Question[]
  scope: ScopeItem[]
  roles: Role[]
  rules: Rule[]
  decisions: Decision[]
  variants: Variant[]
  latencyTargetMs: number
  maxErrorRate: number
  relatedLessons: string[]
  growthNote: string
  hints: HintSet[]
}

const PEAK_FACTOR = 3
const VIRAL_READ_FACTOR = 25
const VIRAL_HOT_KEY_SHARE = 0.9

export function scenariosFor(variant: Variant): Scenario[] {
  const { readRps, writeRps } = variant
  const meanWriteRps = writeRps
  return [
    { id: 'medio', name: 'Tráfico medio', readRps, writeRps, hotKeyShare: 0, meanWriteRps },
    {
      id: 'pico',
      name: 'Pico',
      readRps: readRps * PEAK_FACTOR,
      writeRps: writeRps * PEAK_FACTOR,
      hotKeyShare: 0,
      meanWriteRps,
    },
    {
      id: 'viral',
      name: 'Paste viral',
      readRps: readRps * VIRAL_READ_FACTOR,
      writeRps,
      hotKeyShare: VIRAL_HOT_KEY_SHARE,
      meanWriteRps,
    },
  ]
}

const millions = (value: number) => `${value / 1_000_000} millones`

/** Las respuestas de volumen dependen de la variante: `{escrituras}`, `{lecturas}` y `{proporcion}`. */
export function answerFor(question: Question, variant: Variant): string {
  return question.answer
    .replaceAll('{escrituras}', millions(variant.monthlyWrites))
    .replaceAll('{lecturas}', millions(variant.monthlyReads))
    .replaceAll('{proporcion}', String(variant.monthlyReads / variant.monthlyWrites))
}
