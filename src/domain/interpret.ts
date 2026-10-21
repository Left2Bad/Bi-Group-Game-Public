import type { TraitLevel } from './types'

/**
 * Получает неокруглённую долю, а не отображаемый процент.
 * В методике v2 сбалансированные ответы дают 67% по всем качествам, а 100% по всем сразу недостижимо,
 * поэтому граница приоритета — 0,55, сильной стороны — 0,75.
 */
export const LEVEL_THRESHOLDS = { priority: 0.55, strength: 0.75 } as const

export function interpretLevel(ratio: number): TraitLevel {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new RangeError('Некорректная доля результата')
  return ratio < LEVEL_THRESHOLDS.priority ? 'priority' : ratio < LEVEL_THRESHOLDS.strength ? 'developing' : 'strength'
}
