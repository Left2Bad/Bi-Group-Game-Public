import { getArchetype } from '../domain/archetype'
import { memberFromResult } from '../domain/team'
import type { TeamMember } from '../domain/team'
import { TRAIT_IDS } from '../domain/types'
import type { AssessmentResult, TraitId, TraitResult } from '../domain/types'
import type { DynamicAttempt } from './domain'
import { displayLevel, preferenceProfile } from './presentation'

/**
 * Участник профиля команды по новой методике. Проценты — итоговые четыре качества из сохранённой оценки (без пересчёта),
 * архетип и персонаж — по ответам в ситуациях, как в профиле самого сотрудника. Индикатор согласованности относится
 * к прежней методике, поэтому здесь его нет.
 */
export function teamMemberFromDynamic(id: string, name: string, attempt: DynamicAttempt): TeamMember {
  const evaluation = attempt.evaluation!
  const traits = {} as Record<TraitId, TraitResult>
  for (const trait of TRAIT_IDS) {
    const percent = evaluation.traits[trait].finalPercent
    traits[trait] = { trait, points: percent, maxPoints: 100, percent, level: displayLevel(percent), evidence: [] }
  }
  const result: AssessmentResult = { ...preferenceProfile(attempt), traits }
  return { ...memberFromResult(id, name, attempt.jobRole, result), archetype: getArchetype(preferenceProfile(attempt)), consistency: null }
}
