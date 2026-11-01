import { describe, expect, it } from 'vitest'
import { MAP_NODES } from './content'
import { MISSIONS } from './missions'

describe('MAP_NODES', () => {
  it('tiene 25 nodos: 17 lecciones y 8 misiones', () => {
    expect(MAP_NODES).toHaveLength(25)
    expect(MAP_NODES.filter((n) => n.type === 'leccion')).toHaveLength(17)
    expect(MAP_NODES.filter((n) => n.type === 'mision')).toHaveLength(8)
  })

  it('deja disponibles solo latency, cache, cap y pastebin', () => {
    const ids = MAP_NODES.filter((n) => n.available).map((n) => n.id).sort()
    expect(ids).toEqual(['cache', 'cap', 'latency', 'pastebin'])
  })

  it('tiene ids únicos y enlaces a nodos existentes', () => {
    const ids = MAP_NODES.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const n of MAP_NODES) for (const l of n.links) expect(ids).toContain(l)
  })

  it('cada misión publicada existe como nodo disponible', () => {
    for (const m of MISSIONS) expect(MAP_NODES.find((n) => n.id === m.id)?.available).toBe(true)
  })
})
