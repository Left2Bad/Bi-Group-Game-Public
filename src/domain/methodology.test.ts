import { describe, expect, it } from 'vitest'
import { demoAnswers, DEMO_COMPLETED_AT } from '../content/demo'
import { questions, scoring } from '../content/questions'
import { practices } from '../content/recommendations'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { calculateProfile } from './score'
import { buildRecommendations } from './recommend'
import { DATA_VERSIONS, TRAIT_IDS } from './types'
import type { Answers, TraitId } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, attemptId: 'methodology-check', completedAt: DEMO_COMPLETED_AT }
function resultFor(answers: Answers) {
  const calculated = calculateProfile(answers, context)
  if (!calculated.ok) throw new Error(calculated.error.message)
  return calculated.result
}
const pointsOf = (questionId: string, optionId: string, trait: TraitId) =>
  scoring.find((rule) => rule.questionId === questionId && rule.optionId === optionId && rule.trait === trait)!.points

describe('финальная матрица методики v2 M01–M08', () => {
  it('M01: каждый вариант связан ровно с двумя правилами (основное и дополнительное качество) и объяснением', () => {
    expect(new Set(questions.flatMap((q) => q.options.map((o) => o.id))).size).toBe(60)
    for (const q of questions) {
      expect(q.context.trim()).not.toBe('')
      expect(q.text.trim()).not.toBe('')
      for (const option of q.options) {
        expect(option.text.trim()).not.toBe('')
        const rules = scoring.filter((rule) => rule.questionId === q.id && rule.optionId === option.id)
        expect(rules.map((rule) => rule.trait).sort()).toEqual([q.trait, q.secondaryTrait].sort())
        for (const rule of rules) {
          expect(rule.reason.trim()).not.toBe('')
          expect(rule.developmentTag).toBe(`${q.id}:${rule.trait}`)
          expect(practices[rule.developmentTag]).toBeDefined()
        }
      }
    }
  })

  it('M03/M08: каждая из 60 замен меняет только два качества своей ситуации; каталог не мутирует', () => {
    const before = JSON.stringify({ questions, scoring, demoAnswers })
    const original = resultFor(demoAnswers.A)
    for (const question of questions) for (const option of question.options) {
      const changed = resultFor(Object.freeze({ ...demoAnswers.A, [question.id]: option.id }))
      for (const trait of TRAIT_IDS.filter((id) => id !== question.trait && id !== question.secondaryTrait)) {
        expect(changed.traits[trait]).toEqual(original.traits[trait])
      }
      for (const trait of [question.trait, question.secondaryTrait]) {
        const score = changed.traits[trait]
        expect(Number.isFinite(score.percent)).toBe(true)
        expect(score.percent).toBeGreaterThanOrEqual(0)
        expect(score.percent).toBeLessThanOrEqual(100)
      }
    }
    expect(JSON.stringify({ questions, scoring, demoAnswers })).toBe(before)
  })

  it('M02: 100% по всем четырём качествам одновременно недостижимо — ровный максимум 67%', () => {
    const balanced = resultFor(manualSets.balanced.answers)
    expect(TRAIT_IDS.map((id) => balanced.traits[id].percent)).toEqual([67, 67, 67, 67])
    for (const trait of TRAIT_IDS) {
      const focused = Object.fromEntries(questions.map((q) => {
        const best = [...q.options].sort((a, b) => [q.trait, q.secondaryTrait].includes(trait)
          ? pointsOf(q.id, b.id, trait) - pointsOf(q.id, a.id, trait) : 0)[0]!
        return [q.id, best.id]
      }))
      const result = resultFor(focused)
      expect(result.traits[trait].percent).toBe(100)
      expect(TRAIT_IDS.filter((id) => id !== trait).every((id) => result.traits[id].percent < 100)).toBe(true)
    }
  })

  it.each([null, [], 'answers', 15])('M04: неверный формат %j не публикует результат', (answers) => {
    expect(calculateProfile(answers, context)).toMatchObject({ ok: false, error: { code: 'invalid-answers' } })
  })

  it.each([
    ['minimum', ['criticalThinking', 'engagement']],
    ['balanced', ['criticalThinking', 'confidence']],
  ] as const)('M05/M06: %s — стабильные ничьи и не более двух приоритетов', (key, priorities) => {
    const result = resultFor(manualSets[key].answers)
    const before = JSON.stringify(result)
    const plan = buildRecommendations(result)
    expect(plan.priorityTraits).toEqual(priorities)
    expect(plan.recommendations).toHaveLength(4)
    expect(plan.recommendations.every((item) => item.kind === 'development')).toBe(true)
    expect(buildRecommendations(result)).toEqual(plan)
    expect(JSON.stringify(result)).toBe(before)
  })

  it('M07: для каждой из 30 пар «ситуация × качество» есть практика именно по слабому выбранному ответу', () => {
    let checked = 0
    for (const target of questions) for (const trait of [target.trait, target.secondaryTrait]) {
      const answers: Record<string, string> = { ...manualSets.balanced.answers }
      const weakest = [...target.options].sort((a, b) => pointsOf(target.id, a.id, trait) - pointsOf(target.id, b.id, trait))[0]!
      answers[target.id] = weakest.id
      const result = resultFor(answers)
      expect(result.traits[trait].level).not.toBe('strength')
      const recommendation = buildRecommendations(result).recommendations.find((item) => item.trait === trait)!
      expect(recommendation.questionIds).toEqual([target.id])
      expect(recommendation.developmentTag).toBe(`${target.id}:${trait}`)
      expect(recommendation).toMatchObject({ ...practices[`${target.id}:${trait}`], kind: 'development', durationDays: 7 })
      const evidence = result.traits[trait].evidence.find((item) => item.questionId === target.id)!
      expect(recommendation.reason).toContain(evidence.reason)
      for (const value of [recommendation.action, recommendation.practice, recommendation.successCriterion]) expect(value.trim()).not.toBe('')
      checked++
    }
    expect(checked).toBe(30)
  })

  it('M08: runtime-демо совпадает с независимыми ручными эталонами и меняет только Q13', () => {
    expect(demoAnswers.A).toEqual(manualSets.demoA.answers)
    expect(demoAnswers.B).toEqual(manualSets.demoB.answers)
    expect(Object.keys(demoAnswers.A).filter((id) => demoAnswers.A[id as keyof typeof demoAnswers.A] !== demoAnswers.B[id as keyof typeof demoAnswers.B])).toEqual(['Q13'])
    for (const [scenario, fixture] of [['A', manualSets.demoA], ['B', manualSets.demoB]] as const) {
      const result = resultFor(demoAnswers[scenario])
      expect(TRAIT_IDS.map((id) => result.traits[id].points)).toEqual(fixture.points)
      expect(TRAIT_IDS.map((id) => result.traits[id].percent)).toEqual(fixture.percent)
    }
  })
})
