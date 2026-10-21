import { describe, expect, it } from 'vitest'
import { TRAIT_IDS } from '../domain/types'
import { demoAnswers, demoDraft, demoQuestions, demoResult, demoScoring } from '../../tests/fixtures/contract-demo'

describe('контрактный fixture для B/C (не тесты формулы C)', () => {
  it('содержит 15 вопросов, 4 варианта и 60 однозначных правил', () => {
    expect(demoQuestions).toHaveLength(15)
    expect(new Set(demoQuestions.map((q) => q.id)).size).toBe(15)
    expect(demoScoring).toHaveLength(60)
    expect(TRAIT_IDS.map((trait) => demoQuestions.filter((q) => q.trait === trait).length)).toEqual([4, 4, 4, 3])
    for (const question of demoQuestions) {
      expect(question.options).toHaveLength(4)
      const rules = demoScoring.filter((rule) => rule.questionId === question.id)
      expect(rules.map((rule) => rule.points).sort()).toEqual([0, 1, 2, 3])
      for (const option of question.options) {
        expect(rules.filter((rule) => rule.optionId === option.id)).toHaveLength(1)
      }
    }
  })

  it('связывает ручные 83/67/92/44 с реальными выбранными вариантами fixture', () => {
    expect(TRAIT_IDS.map((trait) => demoResult.traits[trait].percent)).toEqual([83, 67, 92, 44])
    for (const trait of TRAIT_IDS) {
      const result = demoResult.traits[trait]
      expect(result.evidence.reduce((sum, item) => sum + item.points, 0)).toBe(result.points)
      for (const evidence of result.evidence) {
        expect(demoAnswers[evidence.questionId]).toBe(evidence.optionId)
      }
    }
    expect(Object.keys(demoDraft.answers)).toHaveLength(6)
    expect(demoDraft.currentQuestionId).toBe('Q07')
  })
})
