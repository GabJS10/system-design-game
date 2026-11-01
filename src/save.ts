import { PIECES } from './engine/components'
import type { HintUse } from './engine/hints'
import type { Mission, Variant } from './engine/mission'
import { nextReviewDays } from './engine/review'
import type { AttemptFacts } from './engine/score'
import type { Design } from './engine/types'

export type Phase = 'informe' | 'estimacion' | 'diseno' | 'decisiones' | 'comparacion'
// Antes de la fase de estimación aún no hay veredictos; AttemptFacts completo solo existe al compararlos.
export type AttemptProgress = Omit<AttemptFacts, 'estimates'> & { estimates: Partial<AttemptFacts['estimates']> }
export type Attempt = {
  missionId: string; variantId: string; phase: Phase; startedAt: string
  facts: AttemptProgress; design: Design; designRevision: number; simulatedRevision: number | null
  decisions: Record<string, string>; justifications: Record<string, string>; hints: HintUse[]
  disputedDifferenceIds: string[]; result?: { stars: number; finishedAt: string }
}
export type Save = {
  version: 1; attempts: Attempt[]; current: Attempt | null
  completedLessons: string[]; lessonState: Record<string, unknown>
}

const KEY = 'sdw-save'
const BACKUP_KEY = 'sdw-save-backup'
const DAY_MS = 86_400_000
const PHASES: string[] = ['informe', 'estimacion', 'diseno', 'decisiones', 'comparacion']
const VERDICTS: unknown[] = ['bien', 'cerca', 'lejos']

const emptySave = (): Save => ({ version: 1, attempts: [], current: null, completedLessons: [], lessonState: {} })

// Validación a mano: los datos de localStorage o de un archivo importado nunca son de fiar.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isArr = <T>(v: unknown, ok: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.every(ok)
const isRecord = <T>(v: unknown, ok: (x: unknown) => x is T): v is Record<string, T> => isObj(v) && Object.values(v).every(ok)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

function isDesign(v: unknown): v is Design {
  if (!isObj(v)) return false
  const valid = isArr(v.nodes, (n): n is object => isObj(n) && isStr(n.id) && isStr(n.kind) && Object.hasOwn(PIECES, n.kind)
      && isNum(n.instances) && (n.visitCounter === undefined || isBool(n.visitCounter)))
    && isArr(v.edges, (e): e is object => isObj(e) && isStr(e.from) && isStr(e.to))
  if (!valid) return false
  // La simulación asume ids únicos y aristas con extremos existentes.
  const ids = new Set((v.nodes as Design['nodes']).map((n) => n.id))
  return ids.size === (v.nodes as Design['nodes']).length
    && (v.edges as Design['edges']).every((e) => ids.has(e.from) && ids.has(e.to))
}

function isFacts(v: unknown): v is AttemptProgress {
  return isObj(v) && isArr(v.askedQuestionIds, isStr) && isRecord(v.scopeChoices, isBool)
    && isObj(v.estimates) && ['readRps', 'writeRps', 'storageGbPerMonth'].every((k) => {
      const e = (v.estimates as Record<string, unknown>)[k]
      return e === undefined || VERDICTS.includes(e)
    })
}

function isAttempt(v: unknown): v is Attempt {
  return isObj(v) && isStr(v.missionId) && isStr(v.variantId) && isStr(v.phase) && PHASES.includes(v.phase)
    && isStr(v.startedAt) && isFacts(v.facts) && isDesign(v.design) && isNum(v.designRevision)
    && (v.simulatedRevision === null || isNum(v.simulatedRevision))
    && isRecord(v.decisions, isStr) && isRecord(v.justifications, isStr)
    && isArr(v.hints, (h): h is HintUse => isObj(h) && isStr(h.key) && (h.level === 1 || h.level === 2 || h.level === 3))
    && isArr(v.disputedDifferenceIds, isStr)
    && (v.result === undefined || (isObj(v.result) && Number.isInteger(v.result.stars) && (v.result.stars as number) >= 0 && (v.result.stars as number) <= 3 && isStr(v.result.finishedAt)))
}

function isSave(v: unknown): v is Save {
  return isObj(v) && v.version === 1 && isArr(v.attempts, isAttempt) && (v.current === null || isAttempt(v.current))
    && isArr(v.completedLessons, isStr) && isObj(v.lessonState)
}

function parseSave(text: string): Save | null {
  try {
    const v: unknown = JSON.parse(text)
    return isSave(v) ? v : null
  } catch {
    return null
  }
}

// `ok: false` = la lectura falló (distinto de "no hay datos"); entonces no se debe escribir.
function readRaw(storage: Storage): { ok: true; raw: string | null } | { ok: false } {
  try { return { ok: true, raw: storage.getItem(KEY) } } catch { return { ok: false } }
}

function backup(storage: Storage, raw: string): boolean {
  try { storage.setItem(BACKUP_KEY, raw); return true } catch { return false }
}

export function loadSave(storage: Storage): { save: Save; warning: string | null } {
  const read = readRaw(storage)
  if (!read.ok) return { save: emptySave(), warning: 'No se pudo leer el progreso guardado. Empiezas desde cero y no se guardará nada en esta sesión.' }
  const raw = read.raw
  if (raw === null) return { save: emptySave(), warning: null }
  const save = parseSave(raw)
  if (save) return { save, warning: null }
  const copied = backup(storage, raw)
  return {
    save: emptySave(),
    warning: copied
      ? 'El progreso guardado estaba dañado. Empiezas desde cero y se conservó una copia del texto original.'
      : 'El progreso guardado estaba dañado y no se pudo conservar una copia. Empiezas desde cero.',
  }
}

export function writeSave(storage: Storage, save: Save): void {
  const read = readRaw(storage)
  if (!read.ok) return // puede haber progreso que no vemos: no lo pisamos
  const raw = read.raw
  // Datos ilegibles en la clave principal: copiarlos antes de pisarlos; si no se puede, no se escribe.
  if (raw !== null && !parseSave(raw) && !backup(storage, raw)) return
  try { storage.setItem(KEY, JSON.stringify(save)) } catch { /* cuota o almacenamiento bloqueado */ }
}

export function exportSave(save: Save): string {
  return JSON.stringify(save, null, 2)
}

export function importSave(text: string): { save: Save } | { error: string } {
  const save = parseSave(text)
  return save ? { save } : { error: 'El archivo no es un progreso válido de este juego.' }
}

export function dueReviews(save: Save, now: Date): string[] {
  const byMission = new Map<string, { attempt: Attempt; at: number }[]>()
  for (const attempt of save.attempts) {
    if (!attempt.result) continue
    const list = byMission.get(attempt.missionId) ?? []
    list.push({ attempt, at: Date.parse(attempt.result.finishedAt) })
    byMission.set(attempt.missionId, list)
  }
  const due: string[] = []
  for (const [missionId, list] of byMission) {
    const valid = list.filter((x) => !Number.isNaN(x.at))
    if (valid.length === 0) continue
    const latest = valid.reduce((a, b) => (b.at > a.at ? b : a))
    const days = nextReviewDays(list.length - 1, latest.attempt.hints)
    if (now.getTime() >= latest.at + days * DAY_MS) due.push(missionId)
  }
  return due
}

export function pickVariant(save: Save, mission: Mission): Variant {
  const used = [...save.attempts, ...(save.current ? [save.current] : [])].filter((a) => a.missionId === mission.id)
  const count = (v: Variant) => used.filter((a) => a.variantId === v.id).length
  // Empate por orden: reduce solo sustituye con un recuento estrictamente menor.
  return mission.variants.reduce((best, v) => (count(v) < count(best) ? v : best))
}
