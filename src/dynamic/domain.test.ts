import { describe, expect, it } from 'vitest'
import { CRITERIA, DYNAMIC_METHOD, choicePreference, comparableDynamic, finalPercent, PAIRS, PREFERENCE_WEIGHTS, professionalPercent } from './domain'
import type { CriterionEvaluation, CriterionId } from './domain'
import type { DynamicAttempt } from './domain'

const attempt = (): DynamicAttempt => ({
  id: 'example-attempt', method: DYNAMIC_METHOD, promptVersion: 'v1', model: 'test-model', jobRole: 'Инженер',
  createdAt: '2026-10-19T00:00:00.000Z', completedAt: null, status: 'choices',
  choices: PAIRS.map(([primaryTrait, secondaryTrait], index) => ({ id: `C${index + 1}`, context: 'Контекст', text: 'Вопрос', primaryTrait, secondaryTrait,
    options: PREFERENCE_WEIGHTS.map(([primary, secondary], option) => ({ id: `C${index + 1}-${option + 1}`, text: 'Вариант', primary, secondary })) })),
  choiceAnswers: Object.fromEntries(PAIRS.map((_, index) => [`C${index + 1}`, `C${index + 1}-2`])),
  openQuestions: [], openAnswers: {}, evaluation: null,
})

describe('динамическая методика', () => {
  it('оценивает предпочтения без штрафных вариантов и с одинаковой суммой баллов', () => {
    expect(PREFERENCE_WEIGHTS.every(([first, second]) => first + second === 5 && first > 0 && second > 0)).toBe(true)
    expect(choicePreference(attempt())).toEqual({ criticalThinking: 65, confidence: 65, discipline: 60, engagement: 60 })
  })
  it('профессиональные ответы могут поднять несколько качеств независимо выше прежнего предела', () => {
    expect(finalPercent(70, 100)).toBe(94)
    expect(finalPercent(70, 100)).toBeGreaterThan(67)
    expect(finalPercent(30, 0)).toBe(6)
  })
  it('сравнивает только завершённые попытки одной рубрики', () => {
    const scored = { ...attempt(), status: 'completed' as const, evaluation: { rubricVersion: 'v1', model: 'test', traits: {} as never } }
    expect(comparableDynamic(scored, { ...scored, id: 'other' })).toBe(true)
    expect(comparableDynamic(scored, { ...scored, evaluation: { ...scored.evaluation, rubricVersion: 'v2' } })).toBe(false)
    expect(comparableDynamic(scored, { ...scored, promptVersion: 'different' })).toBe(false)
    expect(comparableDynamic(scored, { ...scored, model: 'different' })).toBe(false)
    expect(comparableDynamic(scored, { ...scored, status: 'ready' })).toBe(false)
    expect(comparableDynamic(scored, { ...scored, reasoningEffort: 'high' })).toBe(false)
    const withEffort = { ...scored, reasoningEffort: 'high' as const, evaluation: { ...scored.evaluation, reasoningEffort: 'high' as const } }
    expect(comparableDynamic(withEffort, { ...withEffort, id: 'same-preset' })).toBe(true)
    expect(comparableDynamic(withEffort, { ...withEffort, evaluation: { ...withEffort.evaluation, reasoningEffort: 'medium' } })).toBe(false)
  })
  it('переводит уровни рубрики в независимые проценты и ограничивает опасное решение', () => {
    const criteria = Object.fromEntries(CRITERIA.map((id) => [id, { level: 4, evidence: 'цитата', explanation: 'обоснование' }])) as Record<CriterionId, CriterionEvaluation>
    expect(professionalPercent(criteria, 'criticalThinking', false)).toBe(100)
    expect(professionalPercent(criteria, 'engagement', false)).toBe(100)
    expect(professionalPercent(criteria, 'discipline', true)).toBe(25)
    const weaker = { ...criteria, facts: { ...criteria.facts, level: 0 } }
    expect(professionalPercent(weaker, 'criticalThinking', false)).toBe(67)
    expect(professionalPercent(weaker, 'engagement', false)).toBe(100)
  })
})
