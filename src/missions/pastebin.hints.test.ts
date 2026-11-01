import { describe, expect, it } from 'vitest'
import { MAP_NODES } from '../content'
import { diagnose, selectHint } from '../engine/hints'
import { scenariosFor, type Variant } from '../engine/mission'
import { scoreDesign } from '../engine/score'
import { simulate } from '../engine/simulate'
import type { Design } from '../engine/types'
import { pastebin } from './pastebin'
import {
  oversized,
  removeNode,
  SINGLE_MACHINE,
  VALID_DECISIONS,
  withVisitCounter,
  withoutPopularReads,
} from './pastebin.fixtures'

const diagnoseFor = (variant: Variant, design: Design, decisions = VALID_DECISIONS) => {
  const stars = scoreDesign(pastebin, variant, design, decisions)
  const results = scenariosFor(variant).map((s) => simulate(design, s))
  return diagnose(design, stars, results)
}

/** Sin imagen de la solución: ni la pieza ni sus números finales. */
const FORBIDDEN = [
  'cache', 'cdn', 'redis', 'memcached', 'replica', 'balanceador', 'load balancer', 'worker', 'nosql',
  'md5', 'base62', 'almacenamiento de objetos', 'por lotes', 'reparto de trafico', 'copia viva', 'delante',
]
const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

describe('pistas de Pastebin', () => {
  it('las lecciones relacionadas coinciden con los enlaces del mapa', () => {
    expect(pastebin.relatedLessons).toEqual(MAP_NODES.find((n) => n.id === 'pastebin')?.links)
    expect(pastebin.relatedLessons).toEqual(['tema-8', 'tema-12', 'cache', 'tema-17'])
  })


  it('cada pista tiene tres textos, claves únicas y una lección conocida', () => {
    expect(new Set(pastebin.hints.map((h) => h.key)).size).toBe(pastebin.hints.length)
    for (const hint of pastebin.hints) {
      expect(hint.texts.every((t) => t.trim().length > 0)).toBe(true)
      if (hint.lessonId) expect(MAP_NODES.some((n) => n.type === 'leccion' && n.id === hint.lessonId)).toBe(true)
    }
  })

  it('ningún texto nombra la pieza de la solución ni da números', () => {
    for (const text of pastebin.hints.flatMap((h) => h.texts)) {
      expect(FORBIDDEN.filter((word) => plain(text).includes(word)), text).toEqual([])
      expect(text).not.toMatch(/\d/)
    }
  })

  it('el nivel 1 pregunta y no afirma', () => {
    for (const hint of pastebin.hints) expect(hint.texts[0], hint.key).toMatch(/\?$/)
  })

  it('cubre las fases del juego', () => {
    for (const phase of ['informe', 'estimacion', 'simulacion', 'decisiones']) {
      expect(pastebin.hints.some((h) => h.key.startsWith(`${phase}:`)), phase).toBe(true)
    }
  })
})

describe.each(pastebin.variants)('diagnóstico en la variante $id', (variant) => {
  const { reference } = variant
  const cases: [string, Design, Record<string, string> | undefined][] = [
    ['una sola máquina', SINGLE_MACHINE, undefined],
    ['sin lecturas populares', withoutPopularReads(reference), undefined],
    ['sobredimensionado', oversized(reference), undefined],
    ['contador de visitas', withVisitCounter(reference), undefined],
    ['sin balanceador', removeNode(reference, 'lb'), undefined],
    ['sin limpieza', removeNode(reference, 'worker'), undefined],
    ['sin lote de estadísticas', removeNode(reference, 'batch'), undefined],
    ['sin almacén de contenido', removeNode(reference, 'objectStore'), undefined],
    ['sin método de enlaces', reference, {}],
  ]

  it.each(cases)('%s obtiene una pista específica, no el comodín', (_, design, decisions) => {
    const key = diagnoseFor(variant, design, decisions)
    expect(key).not.toBe('ok:*:*')
    expect(selectHint(pastebin.hints, key)?.key).toBe(key)
  })

  it('la referencia no tiene fallo que diagnosticar', () => {
    expect(diagnoseFor(variant, reference)).toBe('ok:*:*')
  })
})

describe('claves concretas', () => {
  const [base, lecturas] = pastebin.variants
  const key = (variant: Variant, design: Design, decisions?: Record<string, string>) =>
    diagnoseFor(variant, design, decisions)

  it('lecturas que saturan la base en el pico y en el paste viral', () => {
    expect(key(lecturas, SINGLE_MACHINE)).toBe('simulacion:pico:sql')
    expect(key(base, withoutPopularReads(base.reference))).toBe('simulacion:viral:sql')
  })

  it('cada regla y el coste tienen su clave', () => {
    const { reference } = base
    expect(key(base, removeNode(reference, 'objectStore'))).toBe('simulacion:*:separar')
    expect(key(base, reference, {})).toBe('simulacion:*:enlaces')
    expect(key(base, withVisitCounter(reference))).toBe('simulacion:*:estadisticas')
    expect(key(base, removeNode(reference, 'worker'))).toBe('simulacion:*:caducidad')
    expect(key(base, removeNode(reference, 'lb'))).toBe('simulacion:*:balanceo')
    expect(key(base, oversized(reference))).toBe('simulacion:*:coste')
  })

  it('las escrituras que saturan la base tienen su pista', () => {
    const writeHeavy = { ...base, writeRps: 400 }
    expect(key(writeHeavy, writeHeavy.reference)).toBe('simulacion:pico:sql-escrituras')
  })

  it('la caída de un punto único tiene su pista', () => {
    const noReplica = removeNode(base.reference, 'replica')
    expect(key(base, noReplica)).toBe('simulacion:caida:sql')
    expect(key(base, { ...base.reference, nodes: base.reference.nodes.map((n) => (n.id === 'web' ? { ...n, instances: 1 } : n)) })).toBe(
      'simulacion:caida:web',
    )
  })
})

describe('variante lecturas', () => {
  const lecturas = pastebin.variants[1]
  const text = (design: Design) => {
    const hint = selectHint(pastebin.hints, diagnoseFor(lecturas, design))
    return plain(hint?.texts.join(' ') ?? '')
  }

  it('ninguna pista sugiere que una sola pieza lo resuelve', () => {
    for (const design of [SINGLE_MACHINE, withoutPopularReads(lecturas.reference), removeNode(lecturas.reference, 'cdn')]) {
      expect(text(design)).not.toMatch(/\b(una sola|basta con|solo hace falta|con una)\b/)
    }
  })
})
