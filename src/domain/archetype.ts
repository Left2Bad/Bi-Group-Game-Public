import { ARCHETYPES, POLES } from '../content/archetypes'
import type { Archetype, Pole } from '../content/archetypes'
import { TRAIT_IDS } from './types'
import type { AssessmentResult, TraitId } from './types'

/**
 * Полюс качества сильный, если его доля не ниже ровного профиля 2/3.
 * Ровный профиль (везде компромисс 2/2) — верхняя граница, доступная всем четырём качествам сразу,
 * поэтому «выше ровного» означает, что человек отдаёт этому качеству приоритет.
 * Порог даёт самое равномерное распределение 16 типов при моделировании ответов.
 */
export const POLE_THRESHOLD = 2 / 3

export interface ArchetypeProfile {
  readonly code: string
  readonly poles: Readonly<Record<TraitId, Pole & { readonly high: boolean }>>
  readonly archetype: Archetype
}

export function getArchetype(result: AssessmentResult): ArchetypeProfile {
  const poles = Object.fromEntries(TRAIT_IDS.map((trait) => {
    const score = result.traits[trait]
    // Допуск для точного сравнения 16/24 и 14/21 с 2/3.
    const high = score.points / score.maxPoints >= POLE_THRESHOLD - 1e-9
    return [trait, { ...(high ? POLES[trait].high : POLES[trait].low), high }]
  })) as Record<TraitId, Pole & { readonly high: boolean }>
  const code = TRAIT_IDS.map((trait) => poles[trait].letter).join('')
  const archetype = ARCHETYPES[code]
  if (!archetype) throw new Error(`Нет архетипа для кода ${code}`)
  return { code, poles, archetype }
}
