import { describe, expect, it } from 'vitest'
import type { Mission } from './engine/mission'
import { dueReviews, exportSave, importSave, loadSave, pickVariant, writeSave, type Attempt, type Save } from './save'

function fakeStorage(init: Record<string, string> = {}, failSet = false, failGet = false): Storage {
  const m = new Map(Object.entries(init))
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => { if (failGet) throw new Error('bloqueado'); return m.get(k) ?? null },
    setItem: (k, v) => { if (failSet) throw new Error('cuota'); m.set(k, v) },
    removeItem: (k) => void m.delete(k),
  }
}

const empty: Save = { version: 1, attempts: [], current: null, completedLessons: [], lessonState: {} }

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    missionId: 'pastebin', variantId: 'a', phase: 'diseno', startedAt: '2026-01-01T00:00:00.000Z',
    facts: { askedQuestionIds: ['q1'], scopeChoices: { s1: true }, estimates: { readRps: 'bien', writeRps: 'cerca', storageGbPerMonth: 'lejos' } },
    design: { nodes: [{ id: 'c', kind: 'client', instances: 1 }, { id: 'a', kind: 'api', instances: 2, visitCounter: true }], edges: [{ from: 'c', to: 'a' }] },
    designRevision: 3, simulatedRevision: null, decisions: { d1: 'x' }, justifications: { d1: 'porque' },
    hints: [{ key: 'k', level: 2 }], disputedDifferenceIds: ['rol:cache'], ...over,
  }
}
const done = (d: string, over: Partial<Attempt> = {}) => attempt({ phase: 'comparacion', result: { stars: 3, finishedAt: d }, ...over })

describe('loadSave y writeSave', () => {
  it('conserva un current a mitad de intento', () => {
    const s = fakeStorage()
    const save: Save = { ...empty, current: attempt(), completedLessons: ['l1'], lessonState: { l1: { paso: 2 } } }
    writeSave(s, save)
    expect(loadSave(s)).toEqual({ save, warning: null })
  })
  it('sin datos devuelve un save vacío sin aviso', () => {
    expect(loadSave(fakeStorage())).toEqual({ save: empty, warning: null })
  })
  it.each(['{no json', JSON.stringify({ ...empty, version: 99 })])('datos dañados %s: save vacío, aviso y copia', (raw) => {
    const s = fakeStorage({ 'sdw-save': raw })
    const r = loadSave(s)
    expect(r.save).toEqual(empty)
    expect(r.warning).toBeTruthy()
    expect(s.getItem('sdw-save-backup')).toBe(raw)
  })
  it.each([
    ['attempts no es lista', { ...empty, attempts: 'x' }],
    ['nodes no es lista', { ...empty, current: attempt({ design: { nodes: 5, edges: [] } as never }) }],
    ['tipo de pieza desconocido', { ...empty, current: attempt({ design: { nodes: [{ id: 'a', kind: 'zzz', instances: 1 }], edges: [] } as never }) }],
    ['completedLessons con números', { ...empty, completedLessons: [1] }],
    ['fase desconocida', { ...empty, attempts: [attempt({ phase: 'otra' as never })] }],
    ['veredicto inválido', { ...empty, current: attempt({ facts: { askedQuestionIds: [], scopeChoices: {}, estimates: { readRps: 'x' } } as never }) }],
    ['nivel de pista inválido', { ...empty, current: attempt({ hints: [{ key: 'k', level: 9 }] as never }) }],
  ])('forma incorrecta (%s) se trata como corrupto', (_n, bad) => {
    const raw = JSON.stringify(bad)
    const s = fakeStorage({ 'sdw-save': raw })
    expect(loadSave(s).save).toEqual(empty)
    expect(s.getItem('sdw-save-backup')).toBe(raw)
  })
  it('un fallo de setItem no lanza', () => {
    expect(() => writeSave(fakeStorage({}, true), empty)).not.toThrow()
    expect(() => loadSave(fakeStorage({ 'sdw-save': '{x' }, true))).not.toThrow()
  })
  it('un fallo de getItem no lanza', () => {
    expect(loadSave(fakeStorage({}, false, true)).save).toEqual(empty)
    expect(() => writeSave(fakeStorage({}, false, true), empty)).not.toThrow()
  })
  it('no sobrescribe datos corruptos si no pudo copiarlos', () => {
    const s = fakeStorage({ 'sdw-save': '{x' }, true)
    writeSave(s, empty)
    expect(s.getItem('sdw-save')).toBe('{x')
  })
  it('writeSave copia los datos corruptos antes de sobrescribir', () => {
    const s = fakeStorage({ 'sdw-save': '{x' })
    writeSave(s, empty)
    expect(s.getItem('sdw-save-backup')).toBe('{x')
    expect(loadSave(s).warning).toBeNull()
  })
})

describe('exportSave e importSave', () => {
  it('ida y vuelta', () => {
    const save: Save = { ...empty, attempts: [done('2026-01-02T00:00:00.000Z')] }
    expect(importSave(exportSave(save))).toEqual({ save })
  })
  it.each(['', 'hola', '[]', 'null', JSON.stringify({ ...empty, version: 2 }), JSON.stringify({ ...empty, attempts: [{}] })])('texto inválido %j devuelve error', (t) => {
    expect(importSave(t)).toHaveProperty('error')
  })
})

describe('dueReviews', () => {
  const day = 86_400_000
  const t0 = Date.parse('2026-01-01T00:00:00.000Z')
  const at = (n: number) => new Date(t0 + n * day)
  const first = done('2026-01-01T00:00:00.000Z', { hints: [] })

  it('primer intento sin pistas: 3 días', () => {
    const s = { ...empty, attempts: [first] }
    expect(dueReviews(s, at(2.9))).toEqual([])
    expect(dueReviews(s, at(3))).toEqual(['pastebin'])
  })
  it('segundo intento: 7 días; tercero: 21', () => {
    const second = done('2026-01-10T00:00:00.000Z', { hints: [] })
    const s2 = { ...empty, attempts: [first, second] }
    expect(dueReviews(s2, new Date('2026-01-16T23:00:00.000Z'))).toEqual([])
    expect(dueReviews(s2, new Date('2026-01-17T00:00:00.000Z'))).toEqual(['pastebin'])
    const third = done('2026-02-01T00:00:00.000Z', { hints: [] })
    const s3 = { ...empty, attempts: [third, first, second] }
    expect(dueReviews(s3, new Date('2026-02-21T00:00:00.000Z'))).toEqual([])
    expect(dueReviews(s3, new Date('2026-02-22T00:00:00.000Z'))).toEqual(['pastebin'])
  })
  it('una pista de nivel 2 adelanta un escalón', () => {
    const second = done('2026-01-10T00:00:00.000Z') // hints nivel 2
    const s = { ...empty, attempts: [first, second] }
    expect(dueReviews(s, new Date('2026-01-13T00:00:00.000Z'))).toEqual(['pastebin'])
  })
  it('ignora intentos sin terminar y fechas inválidas', () => {
    const s = { ...empty, attempts: [attempt(), done('no-fecha')], current: attempt() }
    expect(dueReviews(s, at(100))).toEqual([])
    const ok = { ...empty, attempts: [done('no-fecha'), first] }
    expect(dueReviews(ok, at(7))).toEqual(['pastebin']) // el intento de fecha inválida cuenta como previo
    expect(dueReviews(ok, new Date('x'))).toEqual([])
  })
  it('agrupa por misión', () => {
    const s = { ...empty, attempts: [first, done('2026-01-01T00:00:00.000Z', { missionId: 'otra', hints: [] })] }
    expect(dueReviews(s, at(5))).toEqual(['pastebin', 'otra'])
  })
})

describe('pickVariant', () => {
  const v = (id: string) => ({ id }) as Mission['variants'][number]
  const mission = { id: 'pastebin', variants: [v('a'), v('b'), v('c')] } as Mission
  it('rota entre las tres variantes', () => {
    const picked: string[] = []
    let save = empty
    for (let i = 0; i < 4; i++) {
      const id = pickVariant(save, mission).id
      picked.push(id)
      save = { ...save, attempts: [...save.attempts, attempt({ variantId: id })] }
    }
    expect(picked).toEqual(['a', 'b', 'c', 'a'])
  })
  it('cuenta current y solo intentos de esa misión', () => {
    const s = { ...empty, attempts: [attempt({ missionId: 'otra', variantId: 'a' })], current: attempt({ variantId: 'a' }) }
    expect(pickVariant(s, mission).id).toBe('b')
  })
})
