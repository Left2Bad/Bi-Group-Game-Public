import type { AssessmentResult, TraitId, TraitLevel, TraitResult } from '../domain/types'
import { TRAIT_IDS } from '../domain/types'
import type { DynamicAttempt } from './domain'

export const displayLevel = (percent: number): TraitLevel => percent >= 75 ? 'strength' : percent >= 55 ? 'developing' : 'priority'

/** View adapter for the existing character/avatar UI. Never saved or used to recalculate an assessment. */
export function preferenceProfile(attempt: DynamicAttempt): AssessmentResult {
  const traits = {} as Record<TraitId, TraitResult>
  for (const trait of TRAIT_IDS) {
    const percent = attempt.evaluation?.traits[trait].preferencePercent ?? 0
    traits[trait] = { trait, points: percent, maxPoints: 100, percent, level: displayLevel(percent), evidence: [] }
  }
  return {
    attemptId: attempt.id, completedAt: attempt.completedAt ?? attempt.createdAt,
    versions: { schema: 1, assessment: attempt.method, scoring: attempt.method, recommendations: attempt.method },
    answers: attempt.choiceAnswers,
    traits,
  }
}
