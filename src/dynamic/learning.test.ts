import { describe, expect, it } from 'vitest'
import type { DynamicAttempt, SkillEvaluation } from './domain'
import { skillLearning, traitLearning } from './learning'

const skill = (skillId: NonNullable<SkillEvaluation['skillId']>, level: number, extra: Partial<SkillEvaluation> = {}): SkillEvaluation => ({
  skillId, name: String(skillId), level, percent: level * 25, evidence: 'x', explanation: 'x', nextStep: 'Следующий шаг',
  learningVenue: 'BuildEX', learningTopic: '', ...extra })
const attempt = (jobRole: string, skills: SkillEvaluation[]) => ({ jobRole, evaluation: { skills } }) as unknown as DynamicAttempt

describe('skillLearning', () => {
  it('ставит слабые навыки первыми, пропускает уровень 4 и берёт тему модели', () => {
    const result = skillLearning(attempt('инженер ПТО', [skill('documentation', 3), skill('quality-control', 4),
      skill('work-planning', 1, { learningVenue: 'BIU', learningTopic: 'Графики работ' })]))
    expect(result.map((item) => item.skillName).slice(0, 2)).toEqual(['work-planning', 'documentation'])
    expect(result[0]).toMatchObject({ venue: 'BIU', topic: 'Графики работ', level: 1 })
    expect(result[1]!.study.length).toBeGreaterThan(1)
    expect(result.some((item) => item.skillName === 'quality-control')).toBe(false)
  })
  it('рекомендует основы для навыков должности без свидетельства', () => {
    const result = skillLearning(attempt('прораб', [skill('duties', 2)]), 10)
    expect(result.find((item) => item.skillName === 'Практика: монолит')).toMatchObject({ venue: 'BuildEX', level: null })
  })
  it('у каждого качества есть тема BuildEX или BIU', () => {
    for (const trait of ['criticalThinking', 'confidence', 'discipline', 'engagement'] as const)
      expect(['BuildEX', 'BIU']).toContain(traitLearning(trait).venue)
  })
})
