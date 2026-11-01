import { describe, expect, it } from 'vitest'
import { parseRoute } from './route'

describe('parseRoute', () => {
  it.each([
    ['/mision/pastebin', { screen: 'mision', id: 'pastebin' }],
    ['/leccion/latency', { screen: 'leccion', id: 'latency' }],
    ['/leccion/cache', { screen: 'leccion', id: 'cache' }],
  ])('%s abre su pantalla', (route, expected) => {
    expect(parseRoute(route)).toEqual(expected)
  })

  it.each([
    ['la raíz', '/'],
    ['vacía', ''],
    ['un id inexistente', '/mision/nope'],
    ['un tipo que no coincide', '/leccion/pastebin'],
    ['un tipo que no coincide (misión)', '/mision/latency'],
    ['un nodo no disponible', '/leccion/tema-8'],
    ['una misión no disponible', '/mision/twitter'],
    ['un hash mal formado', '/mision/%E0%A4%A'],
    ['un tipo desconocido', '/otra/pastebin'],
    ['segmentos de más', '/mision/pastebin/extra'],
    ['sin id', '/mision'],
  ])('%s devuelve el mapa', (_n, route) => {
    expect(parseRoute(route)).toEqual({ screen: 'mapa' })
  })
})
