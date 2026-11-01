import { useState } from 'react'
import { answerFor, type Mission, type Variant } from '../../engine/mission'
import type { Attempt } from '../../save'
import { ESTIMATE_KEYS, type EstimateDraft, type EstimateKey } from './attemptActions'
import { scrambled } from './BriefingPhase'

const LABELS: Record<EstimateKey, string> = {
  readRps: 'Lecturas por segundo',
  writeRps: 'Escrituras por segundo',
  storageGbPerMonth: 'Almacenamiento nuevo al mes (GB)',
}
const VERDICTS = { bien: 'Bien: mismo orden de magnitud', cerca: 'Cerca: a un orden de magnitud', lejos: 'Lejos: a más de un orden de magnitud' }
const NUMBER_HINT = 'Escribe un número mayor que cero, por ejemplo 40'

type Props = {
  mission: Mission
  variant: Variant
  attempt: Attempt
  draft: EstimateDraft
  onDraft: (d: EstimateDraft) => void
  /** Devuelve las estimaciones inválidas; vacío si se aceptó el envío. */
  onSubmit: (d: EstimateDraft) => EstimateKey[]
  onContinue: () => void
}

export default function EstimatePhase({ mission, variant, attempt, draft, onDraft, onSubmit, onContinue }: Props) {
  const [invalid, setInvalid] = useState<EstimateKey[]>([])
  const revealed = ESTIMATE_KEYS.every((k) => attempt.facts.estimates[k])

  if (revealed) {
    return (
      <section>
        <h2>Resultado de tu estimación</h2>
        <table className="verdicts">
          <thead><tr><th>Estimación</th><th>Tu cifra</th><th>Real</th><th>Veredicto</th></tr></thead>
          <tbody>
            {ESTIMATE_KEYS.map((k) => (
              <tr key={k}>
                <th scope="row">{LABELS[k]}</th>
                <td>{draft[k]}</td>
                <td>{variant[k].toLocaleString('es')}</td>
                <td>{VERDICTS[attempt.facts.estimates[k]!]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Requisitos completos</h3>
        <ul className="requirements">
          {scrambled(mission.questions).map((q) => (
            <li key={q.id}>
              <strong>{q.text}</strong> {answerFor(q, variant)}{' '}
              <em>
                {!q.useful ? '(no cambia el diseño)' : attempt.facts.askedQuestionIds.includes(q.id) ? '(lo preguntaste)' : '(no lo preguntaste)'}
              </em>
            </li>
          ))}
        </ul>
        <h4>Alcance</h4>
        <ul className="requirements">
          {scrambled(mission.scope).map((s) => (
            <li key={s.id}>
              {s.label}: {s.inScope ? 'entra' : 'queda fuera'}{' '}
              <em>({Boolean(attempt.facts.scopeChoices[s.id]) === s.inScope ? 'lo marcaste bien' : 'lo marcaste distinto'})</em>
            </li>
          ))}
        </ul>
        <p>El diseño se evaluará contra estos requisitos reales, no contra el alcance que marcaste.</p>
        <button type="button" className="primary" onClick={onContinue}>Ir a la fase de diseño</button>
      </section>
    )
  }

  const submit = () => setInvalid(onSubmit(draft))
  return (
    <section>
      <h2>Estimación</h2>
      <p>Antes de diseñar, estima el tráfico y los datos. Se juzga por orden de magnitud.</p>
      <form onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
        {ESTIMATE_KEYS.map((k) => (
          <div key={k} className="field">
            <label htmlFor={`est-${k}`}>{LABELS[k]}</label>
            <input
              id={`est-${k}`}
              inputMode="decimal"
              value={draft[k]}
              aria-invalid={invalid.includes(k)}
              aria-describedby={invalid.includes(k) ? `err-${k}` : undefined}
              onChange={(e) => { onDraft({ ...draft, [k]: e.target.value }); setInvalid((i) => i.filter((x) => x !== k)) }}
            />
            {invalid.includes(k) && <p id={`err-${k}`} className="error" role="alert">{NUMBER_HINT}</p>}
          </div>
        ))}
        <button type="submit" className="primary">Enviar estimaciones</button>
      </form>
    </section>
  )
}
