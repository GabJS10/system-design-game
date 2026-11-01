import { answerFor, type Mission, type Variant } from '../../engine/mission'
import type { Attempt } from '../../save'

// Orden fijo pero sin relación con la utilidad: en los datos las útiles y lo que entra van primero.
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)
export const scrambled = <T extends { id: string }>(items: T[]): T[] => [...items].sort((a, b) => hash(a.id) - hash(b.id))

type Props = {
  mission: Mission
  variant: Variant
  attempt: Attempt
  onAsk: (questionId: string) => void
  onScope: (itemId: string, marked: boolean) => void
  onContinue: () => void
}

export default function BriefingPhase({ mission, variant, attempt, onAsk, onScope, onContinue }: Props) {
  const asked = attempt.facts.askedQuestionIds
  return (
    <section>
      <h2>Informe</h2>
      <p>Interroga al jefe de producto. No todas las preguntas aportan algo al diseño: elige bien.</p>
      <ul className="questions">
        {scrambled(mission.questions).map((q) => (
          <li key={q.id}>
            {asked.includes(q.id) ? (
              <>
                <p className="question-asked">{q.text}</p>
                <p className="answer">{answerFor(q, variant)}</p>
              </>
            ) : (
              <button type="button" className="question" onClick={() => onAsk(q.id)}>{q.text}</button>
            )}
          </li>
        ))}
      </ul>
      <fieldset className="scope">
        <legend>Alcance: marca lo que entra en el sistema</legend>
        {scrambled(mission.scope).map((s) => (
          <label key={s.id}>
            <input type="checkbox" checked={attempt.facts.scopeChoices[s.id] ?? false} onChange={(e) => onScope(s.id, e.target.checked)} />
            {s.label}
          </label>
        ))}
      </fieldset>
      <button type="button" className="primary" onClick={onContinue}>Continuar a la estimación</button>
    </section>
  )
}
