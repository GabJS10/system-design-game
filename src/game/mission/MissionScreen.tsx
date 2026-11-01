import { useEffect, useRef, useState } from 'react'
import { activeTimer, selectHint, type ActivityEvent, type HintUse } from '../../engine/hints'
import type { Mission } from '../../engine/mission'
import { MISSIONS } from '../../missions'
import type { Attempt, Save } from '../../save'
import { navigate, useGame } from '../store'
import {
  abandonAttempt, askQuestion, ESTIMATE_KEYS, isUsefulAsk, isUsefulScopeClick, readDraft, recordHint, setPhase, setScopeChoice, startAttempt, submitEstimates, writeDraft,
  type EstimateDraft, type EstimateKey,
} from './attemptActions'
import BriefingPhase from './BriefingPhase'
import Clock, { useNow } from './Clock'
import EstimatePhase from './EstimatePhase'
import HintPanel from './HintPanel'
import './mission.css'

export default function MissionScreen({ missionId }: { missionId: string }) {
  const mission = MISSIONS.find((m) => m.id === missionId)
  const { save } = useGame()
  if (!mission) return <p className="page">Misión no encontrada. <a href="#/">Volver al mapa</a></p>
  const other = save.current && save.current.missionId !== missionId ? save.current : null
  return other ? <OtherAttempt other={other} mission={mission} /> : <Playing mission={mission} />
}

// Hay un intento de otra misión: nunca se descarta en silencio.
function OtherAttempt({ other, mission }: { other: Attempt; mission: Mission }) {
  const { update } = useGame()
  const otherTitle = MISSIONS.find((m) => m.id === other.missionId)?.title ?? other.missionId
  const abandon = () => {
    if (!window.confirm(`Abandonar el intento de "${otherTitle}"? Se perderá su progreso en curso; tus intentos terminados se conservan.`)) return
    update((s) => startAttempt(abandonAttempt(s), mission, new Date()))
  }
  return (
    <main className="page">
      <h1>{mission.title}</h1>
      <p>Ya tienes un intento en curso de "{otherTitle}". Solo puede haber uno a la vez.</p>
      <p>
        <button type="button" className="primary" onClick={() => navigate(`/mision/${other.missionId}`)}>Continuar con "{otherTitle}"</button>{' '}
        <button type="button" onClick={abandon}>Abandonar ese intento y empezar este</button>
      </p>
      <a href="#/">Volver al mapa</a>
    </main>
  )
}

function Playing({ mission }: { mission: Mission }) {
  const { save, update } = useGame()
  const attempt = save.current
  const [saveFailed, setSaveFailed] = useState(false)
  const [wrongAnswers, setWrongAnswers] = useState(0)
  const [hidden, setHidden] = useState(document.hidden)
  // El registro parte de la visibilidad real al montar: una pestaña oculta no cuenta como tiempo activo.
  const events = useRef<ActivityEvent[]>([{ type: document.hidden ? 'hidden' : 'visible', at: Date.now() }])
  const scopeBeforeLast = useRef<Record<string, boolean> | null>(null)
  const now = useNow(1000)

  const commit = (fn: (s: Save) => Save) => setSaveFailed(!update(fn))
  const edit = (fn: (a: Attempt) => Attempt) => commit((s) => (s.current ? { ...s, current: fn(s.current) } : s))
  const markChange = () => events.current.push({ type: 'change', at: Date.now() })

  useEffect(() => { if (!save.current) commit((s) => startAttempt(s, mission, new Date())) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onChange = () => {
      setHidden(document.hidden)
      events.current.push({ type: document.hidden ? 'hidden' : 'visible', at: Date.now() })
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  if (!attempt) return null
  const variant = mission.variants.find((v) => v.id === attempt.variantId)!
  const inPlay = attempt.phase === 'informe' || attempt.phase === 'estimacion'
  // Con la estimación revelada ya no queda nada que resolver: sin panel de ayuda.
  const revealed = ESTIMATE_KEYS.every((k) => attempt.facts.estimates[k])
  const draft = readDraft(save, mission.id)

  const abandon = () => {
    if (!window.confirm('¿Abandonar este intento? Se perderá su progreso en curso; tus intentos terminados se conservan.')) return
    commit(abandonAttempt)
    navigate('/')
  }
  const goTo = (phase: Attempt['phase']) => { markChange(); setWrongAnswers(0); edit((a) => setPhase(a, phase)) }
  const submit = (d: EstimateDraft): EstimateKey[] => {
    const result = submitEstimates(attempt, variant, d)
    if (!result.ok) { setWrongAnswers((n) => n + 1); return result.invalid }
    markChange()
    edit((a) => { const r = submitEstimates(a, variant, d); return r.ok ? r.attempt : a })
    return []
  }
  const onUse = (u: HintUse) => edit((a) => recordHint(a, u))

  // Con la pestaña oculta no se ofrece ayuda: señales a cero.
  const signals = hidden
    ? { activeMsSinceUsefulChange: 0, sameFailureRuns: 0, wrongAnswers: 0 }
    : { activeMsSinceUsefulChange: Math.max(0, activeTimer(events.current, now)), sameFailureRuns: 0, wrongAnswers }
  const hintSet = selectHint(mission.hints, `${attempt.phase}:*:*`)

  return (
    <main className="mission">
      <header className="mission-header">
        <h1>{mission.title}</h1>
        <Clock startedAt={attempt.startedAt} />
        <button type="button" onClick={abandon}>Abandonar intento</button>
        <a href="#/">Volver al mapa</a>
      </header>
      {saveFailed && (
        <p className="banner banner-warning" role="alert">
          No se pudo guardar el progreso en este navegador. Puedes seguir jugando, pero se perderá al cerrar la pestaña.
        </p>
      )}
      <div className="mission-body">
        <div className="mission-main">
          {attempt.phase === 'informe' && (
            <BriefingPhase
              mission={mission} variant={variant} attempt={attempt}
              onAsk={(id) => { if (isUsefulAsk(mission, attempt, id)) markChange(); edit((a) => askQuestion(a, id)) }}
              onScope={(id, marked) => {
                if (isUsefulScopeClick(mission, attempt, id, marked, scopeBeforeLast.current)) markChange()
                scopeBeforeLast.current = attempt.facts.scopeChoices
                edit((a) => setScopeChoice(a, mission, id, marked))
              }}
              onContinue={() => goTo('estimacion')}
            />
          )}
          {attempt.phase === 'estimacion' && (
            <EstimatePhase
              mission={mission} variant={variant} attempt={attempt} draft={draft}
              onDraft={(d) => commit((s) => writeDraft(s, mission.id, d))}
              onSubmit={submit}
              onContinue={() => goTo('diseno')}
            />
          )}
          {!inPlay && (
            <section>
              <h2>Diseño</h2>
              <p>La fase de diseño llega en la siguiente tanda.</p>
              <a href="#/">Volver al mapa</a>
            </section>
          )}
        </div>
        {inPlay && !(attempt.phase === 'estimacion' && revealed) && <HintPanel key={attempt.phase} hintSet={hintSet} signals={signals} free={false} onUse={onUse} used={attempt.hints} />}
      </div>
    </main>
  )
}
