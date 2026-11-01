import { describe, expect, it } from 'vitest'
import type { Mission } from './engine/mission'
import { dueReviews, exportSave, importSave, loadSave, openStorage, pickVariant, writeSave, type Attempt, type Save } from './save'

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
    missionId: 'pastebin', variantId: 'base', phase: 'diseno', startedAt: '2026-01-01T00:00:00.000Z',
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
  it('conserva la posición x e y de los nodos', () => {
    const s = fakeStorage()
    const design = { nodes: [{ id: 'c', kind: 'client' as const, instances: 1, x: 12.5, y: -40 }], edges: [] }
    const save: Save = { ...empty, current: attempt({ design }) }
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
    ['arista con extremo desconocido', { ...empty, current: attempt({ design: { nodes: [{ id: 'c', kind: 'client', instances: 1 }], edges: [{ from: 'c', to: 'zz' }] } }) }],
    ['ids de nodo duplicados', { ...empty, current: attempt({ design: { nodes: [{ id: 'c', kind: 'client', instances: 1 }, { id: 'c', kind: 'api', instances: 1 }], edges: [] } }) }],
    ['veredicto parcial inválido', { ...empty, current: attempt({ facts: { askedQuestionIds: [], scopeChoices: {}, estimates: { readRps: 'bien', writeRps: 'x' } } as never }) }],
    ['estimates no es objeto', { ...empty, current: attempt({ facts: { askedQuestionIds: [], scopeChoices: {}, estimates: null } as never }) }],
    ['veredicto inválido', { ...empty, current: attempt({ facts: { askedQuestionIds: [], scopeChoices: {}, estimates: { readRps: 'x' } } as never }) }],
    ['estrellas negativas', { ...empty, attempts: [done('2026-01-02T00:00:00.000Z', { result: { stars: -1, finishedAt: '2026-01-02T00:00:00.000Z' } })] }],
    ['estrellas decimales', { ...empty, attempts: [done('2026-01-02T00:00:00.000Z', { result: { stars: 1.5, finishedAt: '2026-01-02T00:00:00.000Z' } })] }],
    ['estrellas por encima de 3', { ...empty, attempts: [done('2026-01-02T00:00:00.000Z', { result: { stars: 4, finishedAt: '2026-01-02T00:00:00.000Z' } })] }],
    ['posición x no numérica', { ...empty, current: attempt({ design: { nodes: [{ id: 'c', kind: 'client', instances: 1, x: 'a' }], edges: [] } as never }) }],
    ['posición y nula (así se guarda un NaN)', { ...empty, current: attempt({ design: { nodes: [{ id: 'c', kind: 'client', instances: 1, y: null }], edges: [] } as never }) }],
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
  it('un fallo de getItem no lanza, avisa y no escribe', () => {
    const r = loadSave(fakeStorage({}, false, true))
    expect(r.save).toEqual(empty)
    expect(r.warning).toBeTruthy()
    const s = fakeStorage({ 'sdw-save': exportSave({ ...empty, completedLessons: ['l1'] }) })
    const flaky = { ...s, getItem: () => { throw new Error('bloqueado') } } as Storage
    expect(() => writeSave(flaky, empty)).not.toThrow()
    expect(JSON.parse(s.getItem('sdw-save')!).completedLessons).toEqual(['l1'])
  })
  it('conserva un current con estimaciones parciales', () => {
    const s = fakeStorage()
    const save: Save = { ...empty, current: attempt({ phase: 'estimacion', facts: { askedQuestionIds: [], scopeChoices: {}, estimates: { readRps: 'bien' } } }) }
    writeSave(s, save)
    expect(loadSave(s)).toEqual({ save, warning: null })
    const vacio: Save = { ...empty, current: attempt({ phase: 'informe', facts: { askedQuestionIds: [], scopeChoices: {}, estimates: {} } }) }
    expect(importSave(exportSave(vacio))).toEqual({ save: vacio })
  })
  describe('current sin misión posible', () => {
    const bad: [string, Partial<Attempt>][] = [
      ['misión inexistente', { missionId: 'nada' }],
      ['variante inexistente', { variantId: 'nada' }],
      ['fecha inválida', { startedAt: 'ayer' }],
      ['diseño sin client', { design: { nodes: [{ id: 'a', kind: 'api', instances: 1 }], edges: [] } }],
      ['revisión simulada mayor que la del diseño', { simulatedRevision: 4, designRevision: 3 }],
    ]

    it.each(bad)('%s: descarta current, avisa y conserva copia', (_, over) => {
      const save: Save = { ...empty, current: attempt(over), completedLessons: ['l1'] }
      const raw = exportSave(save)
      const s = fakeStorage({ 'sdw-save': raw })
      const r = loadSave(s)
      expect(r.save).toEqual({ ...save, current: null })
      expect(r.warning).toMatch(/intento/)
      expect(s.getItem('sdw-save-backup')).toBe(raw)
    })

    it('avisa si no pudo conservar la copia', () => {
      const raw = exportSave({ ...empty, current: attempt({ missionId: 'nada' }) })
      expect(loadSave(fakeStorage({ 'sdw-save': raw }, true)).warning).toMatch(/no se pudo/)
    })

    it('al importar descarta current y avisa, con el resto intacto', () => {
      const save: Save = { ...empty, current: attempt({ variantId: 'nada' }), completedLessons: ['l1'] }
      const result = importSave(exportSave(save))
      expect(result).toMatchObject({ save: { current: null, completedLessons: ['l1'] }, warning: expect.stringMatching(/intento/) })
    })

    it('un intento acabado de otra versión no molesta: solo se valida current', () => {
      const save: Save = { ...empty, attempts: [done('2026-01-02T00:00:00.000Z', { missionId: 'antigua' })] }
      expect(loadSave(fakeStorage({ 'sdw-save': exportSave(save) }))).toEqual({ save, warning: null })
    })
  })

  describe('writeSave informa de si guardó', () => {
    it('devuelve true al guardar', () => {
      expect(writeSave(fakeStorage(), empty)).toBe(true)
    })
    it('devuelve false si falla setItem', () => {
      expect(writeSave(fakeStorage({}, true), empty)).toBe(false)
    })
    it('devuelve false si falla getItem', () => {
      expect(writeSave(fakeStorage({}, false, true), empty)).toBe(false)
    })
    it('devuelve false si no pudo copiar los datos corruptos', () => {
      expect(writeSave(fakeStorage({ 'sdw-save': '{x' }, true), empty)).toBe(false)
    })
  })

  describe('openStorage', () => {
    const blocked = () => { throw new Error('SecurityError') }

    it('devuelve el almacenamiento si se puede acceder', () => {
      const s = fakeStorage()
      expect(openStorage(() => s)).toBe(s)
    })

    it('si acceder lanza, se arranca desde cero con aviso y sin guardar', () => {
      const s = openStorage(blocked)
      const r = loadSave(s)
      expect(r.save).toEqual(empty)
      expect(r.warning).toBeTruthy()
      expect(writeSave(s, empty)).toBe(false)
    })
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
