import { describe, expect, it } from 'vitest'
import { pastebin } from '../missions/pastebin'
import { VALID_DECISIONS, removeNode, withNosql, withVisitCounter, withoutPopularReads } from '../missions/pastebin.fixtures'
import { compareDesign, type AttemptFacts } from './score'

const variant = pastebin.variants[0]
const reference = variant.reference

const perfectFacts: AttemptFacts = {
  askedQuestionIds: pastebin.questions.filter((q) => q.useful).map((q) => q.id),
  scopeChoices: Object.fromEntries(pastebin.scope.map((s) => [s.id, s.inScope])),
  estimates: { readRps: 'bien', writeRps: 'bien', storageGbPerMonth: 'bien' },
}

const compare = (design = reference, decisions = VALID_DECISIONS, facts = perfectFacts) =>
  compareDesign(pastebin, variant, design, decisions, facts)

describe('compareDesign', () => {
  it('la referencia con sus decisiones y hechos perfectos no tiene diferencias', () => {
    expect(compare()).toEqual([])
  })

  it('una alternativa válida (nosql) da un valido y ninguna pieza', () => {
    const diffs = compare(withNosql(reference))
    expect(diffs.filter((d) => d.category === 'valido')).toHaveLength(1)
    expect(diffs.filter((d) => d.category === 'pieza')).toHaveLength(0)
  })

  it('sin caché ni CDN da pieza con nota', () => {
    const diffs = compare(withoutPopularReads(reference))
    const missing = diffs.filter((d) => d.category === 'pieza')
    expect(missing).toHaveLength(1)
    expect(missing[0].noteUrl).toBeTruthy()
  })

  it('una decisión no válida da pieza con la nota de la decisión', () => {
    const diffs = compare(reference, { ...VALID_DECISIONS, longitud: '4' })
    expect(diffs).toEqual([expect.objectContaining({ id: 'decision:longitud', category: 'pieza', noteUrl: expect.any(String) })])
  })

  it('una estimación lejos o cerca da estimacion', () => {
    const facts = { ...perfectFacts, estimates: { ...perfectFacts.estimates, readRps: 'lejos' as const, writeRps: 'cerca' as const } }
    expect(compare(reference, VALID_DECISIONS, facts).map((d) => [d.id, d.category])).toEqual([
      ['estimacion:readRps', 'estimacion'],
      ['estimacion:writeRps', 'estimacion'],
    ])
  })

  it('no preguntar por estadísticas da requisito; las preguntas inútiles no cuentan', () => {
    const facts = { ...perfectFacts, askedQuestionIds: perfectFacts.askedQuestionIds.filter((id) => id !== 'estadisticas') }
    expect(compare(reference, VALID_DECISIONS, facts)).toEqual([expect.objectContaining({ id: 'pregunta:estadisticas', category: 'requisito' })])
  })

  it('un alcance mal marcado da requisito', () => {
    const facts = { ...perfectFacts, scopeChoices: { ...perfectFacts.scopeChoices, cuentas: true, borrar: false } }
    expect(compare(reference, VALID_DECISIONS, facts).map((d) => [d.id, d.category])).toEqual([
      ['alcance:borrar', 'requisito'],
      ['alcance:cuentas', 'requisito'],
    ])
  })

  it('no depende de los identificadores de nodo', () => {
    const renamed = removeNode(reference, 'cache')
    expect(compare(renamed).map((d) => d.id)).toEqual(['rol:populares'])
  })

  it('una regla funcional fallida da pieza con la nota de la regla', () => {
    expect(compare(withVisitCounter(reference))).toEqual([
      expect.objectContaining({ id: 'regla:estadisticas', category: 'pieza', noteUrl: expect.any(String) }),
    ])
  })

  it('los id son estables entre ejecuciones', () => {
    const design = withoutPopularReads(reference)
    expect(compare(design)).toEqual(compare(design))
  })
})
