import { describe, expect, it } from 'vitest'
import { pastebin } from '../../missions/pastebin'
import type { Attempt, Save } from '../../save'
import {
  abandonAttempt, askQuestion, readDraft, recordHint, setPhase, setScopeChoice, startAttempt, submitEstimates, writeDraft,
} from './attemptActions'

const empty = (): Save => ({ version: 1, attempts: [], current: null, completedLessons: [], lessonState: {} })
const NOW = new Date('2026-10-31T10:00:00Z')
const fresh = () => startAttempt(empty(), pastebin, NOW).current!
const finished = (variantId: string): Attempt => ({ ...fresh(), variantId, result: { stars: 2, finishedAt: NOW.toISOString() } })

describe('startAttempt', () => {
  it('crea un intento vacío con un único cliente', () => {
    const a = fresh()
    expect(a).toMatchObject({
      missionId: 'pastebin', phase: 'informe', startedAt: NOW.toISOString(),
      facts: { askedQuestionIds: [], scopeChoices: {}, estimates: {} },
      design: { nodes: [{ id: 'client', kind: 'client', instances: 1 }], edges: [] },
      designRevision: 0, simulatedRevision: null, hints: [],
    })
    expect(pastebin.variants.map((v) => v.id)).toContain(a.variantId)
  })

  it('rota la variante según los intentos previos', () => {
    const first = pastebin.variants[0].id
    const save: Save = { ...empty(), attempts: [finished(first)] }
    expect(startAttempt(save, pastebin, NOW).current!.variantId).not.toBe(first)
  })

  it('no pisa un intento en curso y limpia el borrador anterior', () => {
    const save = startAttempt(empty(), pastebin, NOW)
    expect(startAttempt(save, pastebin, new Date('2027-01-01'))).toBe(save)
    const withDraft = writeDraft(abandonAttempt(save), 'pastebin', { readRps: '40', writeRps: '', storageGbPerMonth: '' })
    expect(readDraft(startAttempt(withDraft, pastebin, NOW), 'pastebin')).toEqual({ readRps: '', writeRps: '', storageGbPerMonth: '' })
  })
})

describe('abandonAttempt', () => {
  it('quita solo el intento en curso y conserva los terminados', () => {
    const done = finished('x')
    const save = startAttempt({ ...empty(), attempts: [done] }, pastebin, NOW)
    const after = abandonAttempt(save)
    expect(after.current).toBeNull()
    expect(after.attempts).toEqual([done])
  })
})

describe('askQuestion', () => {
  it('registra la pregunta una sola vez', () => {
    const a = askQuestion(askQuestion(fresh(), 'usuarios'), 'usuarios')
    expect(a.facts.askedQuestionIds).toEqual(['usuarios'])
  })
})

describe('setScopeChoice', () => {
  it('registra todos los elementos, marcados o no', () => {
    const a = setScopeChoice(fresh(), pastebin, 'pegar', true)
    expect(Object.keys(a.facts.scopeChoices).sort()).toEqual(pastebin.scope.map((s) => s.id).sort())
    expect(a.facts.scopeChoices.pegar).toBe(true)
    expect(a.facts.scopeChoices.cuentas).toBe(false)
  })

  it('desmarca sin olvidar lo ya marcado', () => {
    const a = setScopeChoice(setScopeChoice(setScopeChoice(fresh(), pastebin, 'pegar', true), pastebin, 'leer', true), pastebin, 'pegar', false)
    expect(a.facts.scopeChoices).toMatchObject({ pegar: false, leer: true })
  })
})

describe('submitEstimates', () => {
  const variant = pastebin.variants[0] // 40 lecturas/s, 4 escrituras/s, 12,7 GB
  const draft = (readRps: string, writeRps = '4', storageGbPerMonth = '12,7') => ({ readRps, writeRps, storageGbPerMonth })

  it('rechaza números inválidos y dice cuáles', () => {
    const a = fresh()
    expect(submitEstimates(a, variant, draft('abc', '0', ''))).toEqual({ ok: false, invalid: ['readRps', 'writeRps', 'storageGbPerMonth'] })
  })

  it('guarda un veredicto por estimación', () => {
    const r = submitEstimates(fresh(), variant, draft('40', '4000', '1000'))
    if (!r.ok) throw new Error('debía aceptar')
    expect(r.attempt.facts.estimates).toEqual({ readRps: 'bien', writeRps: 'lejos', storageGbPerMonth: 'lejos' })
  })
})

describe('setPhase y recordHint', () => {
  it('cambia de fase sin tocar el resto', () => {
    expect(setPhase(fresh(), 'estimacion').phase).toBe('estimacion')
  })

  it('añade cada pista una sola vez', () => {
    const use = { key: 'informe:*:*', level: 1 as const }
    expect(recordHint(recordHint(fresh(), use), use).hints).toEqual([use])
    expect(recordHint(recordHint(fresh(), use), { ...use, level: 2 }).hints).toHaveLength(2)
  })
})

describe('borrador de estimaciones', () => {
  it('se guarda en lessonState bajo la clave de la misión y se lee de vuelta', () => {
    const d = { readRps: '40', writeRps: '4', storageGbPerMonth: '' }
    const save = writeDraft(empty(), 'pastebin', d)
    expect(Object.keys(save.lessonState)).toEqual(['mision:pastebin:estimacion'])
    expect(readDraft(save, 'pastebin')).toEqual(d)
  })

  it('ignora datos ajenos o mal formados', () => {
    const save = { ...empty(), lessonState: { 'mision:pastebin:estimacion': { readRps: 5, otro: 'x' } } }
    expect(readDraft(save, 'pastebin')).toEqual({ readRps: '', writeRps: '', storageGbPerMonth: '' })
  })
})
