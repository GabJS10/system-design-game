export type EstimateVerdict = 'bien' | 'cerca' | 'lejos'

export function parseEstimate(text: string): number | null {
  const normalized = text.trim().replace(/\.(?=\d{3}(?!\d))/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return value > 0 ? value : null
}

export function judgeEstimate(value: number, real: number): EstimateVerdict {
  const distance = Math.abs(Math.log10(value / real))
  if (distance <= 0.5) return 'bien'
  return distance <= 1 ? 'cerca' : 'lejos'
}
