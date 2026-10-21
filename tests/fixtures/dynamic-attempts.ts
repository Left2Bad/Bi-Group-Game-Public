import { TRAIT_IDS } from '../../src/domain/types'
import type { TraitId } from '../../src/domain/types'
import { DYNAMIC_METHOD, RUBRIC_VERSION } from '../../src/dynamic/domain'
import type { DynamicAttempt, SkillEvaluation } from '../../src/dynamic/domain'
import { SKILL_RUBRIC_VERSION } from '../../src/dynamic/skills'

/** Завершённые попытки новой методики для проверки карточки руководителя. Проценты задаются явно и не пересчитываются. */
export const skill = (skillId: SkillEvaluation['skillId'], name: string, percent: number): SkillEvaluation => ({
  ...(skillId ? { skillId } : {}), name, level: percent / 25, percent, evidence: 'проверю данные', explanation: 'Описан способ работы.',
  nextStep: 'Провести проверку.', learningVenue: 'BIU', learningTopic: 'Планирование работ' })

export function completed(id: string, day: number, options: { percent?: number; jobRole?: string; model?: string; skills?: SkillEvaluation[]; catalog?: boolean; roadmap?: boolean } = {}): DynamicAttempt {
  const percent = options.percent ?? 60
  const traits = Object.fromEntries(TRAIT_IDS.map((trait, index) => [trait, { preferencePercent: percent, professionalPercent: percent, behaviorPercent: percent,
    finalPercent: percent + index * 10, evidence: 'проверю данные', strength: `Сильная сторона ${trait}`, nextStep: `Шаг ${trait}`, successCriterion: `Критерий ${trait}` }])) as Record<TraitId, never>
  return { id, method: DYNAMIC_METHOD, promptVersion: 'bank-selection-v1', model: options.model ?? 'gpt-6-luna', reasoningEffort: 'high', bankVersion: 'bank-v1',
    jobRole: options.jobRole ?? 'Прораб', createdAt: `2026-10-${String(day).padStart(2, '0')}T08:00:00.000Z`, completedAt: `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`,
    status: 'completed', choices: [], choiceAnswers: {}, openQuestions: [], openAnswers: {},
    evaluation: { rubricVersion: RUBRIC_VERSION, promptVersion: 'bank-selection-v1', model: options.model ?? 'gpt-6-luna', reasoningEffort: 'high', traits,
      skills: options.skills ?? [skill('work-planning', 'Планирование работ', 50)],
      ...(options.catalog === false ? {} : { skillRubricVersion: SKILL_RUBRIC_VERSION }),
      ...(options.roadmap === false ? {} : { roadmap: TRAIT_IDS.map((trait, index) => ({ week: index + 1, trait, mode: 'growth' as const,
        action: `Практика ${index + 1}`, successCriterion: `Критерий ${index + 1}`, support: 'Опора' })) }) } }
}
