import { describe, expect, it } from 'vitest'
import { questions, scoring } from '../content/questions'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { asAllStrengths } from '../../tests/fixtures/high-profile'
import { buildRecommendations } from './recommend'
import { calculateProfile } from './score'
import { interpretLevel } from './interpret'
import { DATA_VERSIONS, TRAIT_IDS } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, attemptId: 'test-1', completedAt: '2026-10-16T09:00:00.000Z' }

describe('содержание и расчёт C (методика v2)', () => {
  it('имеет 15 ситуаций с основным и дополнительным качеством и 120 уникальных правил', () => {
    expect(questions.map((q) => q.trait)).toEqual([
      ...Array(4).fill('criticalThinking'), ...Array(4).fill('confidence'),
      ...Array(4).fill('discipline'), ...Array(3).fill('engagement'),
    ])
    expect(new Set(questions.map((q) => q.id)).size).toBe(15)
    expect(scoring).toHaveLength(120)
    expect(new Set(scoring.map((r) => `${r.questionId}:${r.optionId}:${r.trait}`)).size).toBe(120)
    for (const q of questions) {
      expect(q.options).toHaveLength(4)
      expect(q.secondaryTrait).not.toBe(q.trait)
    }
  })

  it('измеряет каждое качество 7–8 раз: максимумы 24/21/21/24', () => {
    const appearances = TRAIT_IDS.map((trait) => questions.filter((q) => q.trait === trait || q.secondaryTrait === trait).length)
    expect(appearances).toEqual([8, 7, 7, 8])
    const result = calculateProfile(manualSets.balanced.answers, context)
    if (!result.ok) throw new Error('Неверный эталон')
    expect(TRAIT_IDS.map((id) => result.result.traits[id].maxPoints)).toEqual([24, 21, 21, 24])
  })

  it('в каждой ситуации нет доминирующего варианта: три рабочих решения дают по 4 балла, четвёртое — 0–1', () => {
    for (const q of questions) {
      const totals = q.options.map((o) => scoring.filter((r) => r.questionId === q.id && r.optionId === o.id)
        .reduce((sum, r) => sum + r.points, 0)).sort()
      expect(totals.slice(1)).toEqual([4, 4, 4])
      expect(totals[0]).toBeLessThanOrEqual(1)
      const pairs = q.options.map((o) => [q.trait, q.secondaryTrait].map((trait) =>
        scoring.find((r) => r.questionId === q.id && r.optionId === o.id && r.trait === trait)!.points).join('/'))
      expect(pairs).toEqual(expect.arrayContaining(['3/1', '1/3', '2/2']))
    }
  })

  it('длины вариантов сопоставимы: худший ответ не угадывается по краткости', () => {
    for (const q of questions) {
      const lengths = q.options.map((o) => o.text.length)
      expect(Math.min(...lengths) / Math.max(...lengths)).toBeGreaterThan(0.6)
    }
  })

  it.each(Object.entries(manualSets))('%s: совпадает с ручным эталоном', (_, fixture) => {
    const output = calculateProfile(fixture.answers, context)
    expect(output.ok).toBe(true)
    if (!output.ok) return
    expect(TRAIT_IDS.map((id) => output.result.traits[id].points)).toEqual(fixture.points)
    expect(TRAIT_IDS.map((id) => output.result.traits[id].percent)).toEqual(fixture.percent)
  })

  it('не меняет входные ответы и даёт тот же результат повторно', () => {
    const answers = Object.freeze({ ...manualSets.demoA.answers })
    expect(calculateProfile(answers, context)).toEqual(calculateProfile(answers, context))
    expect(answers.Q13).toBe('Q13-A')
  })

  it('отклоняет неполный, неизвестный и чужой вариант', () => {
    for (const answers of [
      Object.fromEntries(Object.entries(manualSets.demoA.answers).slice(1)),
      { ...manualSets.demoA.answers, Q99: 'Q99-A' },
      { ...manualSets.demoA.answers, Q01: 'Q02-B' },
    ]) expect(calculateProfile(answers, context)).toMatchObject({ ok: false, error: { code: 'invalid-answers' } })
  })

  it('отклоняет каталог без правила для дополнительного качества', () => {
    const broken = scoring.filter((r) => !(r.questionId === 'Q05' && r.optionId === 'Q05-A' && r.trait === 'criticalThinking'))
    expect(calculateProfile(manualSets.demoA.answers, { ...context, scoring: broken }))
      .toMatchObject({ ok: false, error: { code: 'invalid-content' } })
  })

  it('проверяет границы по неокруглённой доле', () => {
    expect([0.5499, 0.55, 0.7499, 0.75].map(interpretLevel)).toEqual(['priority', 'developing', 'developing', 'strength'])
  })

  it('выбирает приоритет и действие по слабому выбранному ответу', () => {
    const a = calculateProfile(manualSets.demoA.answers, context)
    const b = calculateProfile(manualSets.demoB.answers, context)
    if (!a.ok || !b.ok) throw new Error('Неверный эталон')
    expect(buildRecommendations(a.result).priorityTraits).toEqual(['engagement', 'confidence'])
    expect(buildRecommendations(a.result).recommendations[0]).toMatchObject({ trait: 'engagement', questionIds: ['Q13'], developmentTag: 'Q13:engagement' })
    expect(buildRecommendations(b.result).priorityTraits).toEqual(['confidence', 'engagement'])
    expect(buildRecommendations(b.result).recommendations[0]?.trait).toBe('confidence')
    expect(buildRecommendations(b.result).recommendations.every((r) => r.questionIds.every((id) => b.result.answers[id]))).toBe(true)
  })

  it('не выдумывает слабые стороны, если все качества — сильные стороны', () => {
    const high = calculateProfile(manualSets.demoA.answers, context)
    if (!high.ok) throw new Error('Неверный эталон')
    const plan = buildRecommendations(asAllStrengths(high.result))
    expect(plan.priorityTraits).toEqual([])
    expect(plan.recommendations.every((r) => r.kind === 'maintenance')).toBe(true)
  })

  it('при равной сумме учитывает конкретный слабый ответ', () => {
    const first = { ...manualSets.demoA.answers }
    const second = { ...manualSets.demoA.answers, Q13: 'Q13-B', Q07: 'Q07-D' }
    const a = calculateProfile(first, context), b = calculateProfile(second, context)
    if (!a.ok || !b.ok) throw new Error('Неверные ответы')
    expect(a.result.traits.engagement.points).toBe(11)
    expect(b.result.traits.engagement.points).toBe(11)
    const recA = buildRecommendations(a.result).recommendations.find((r) => r.trait === 'engagement')
    const recB = buildRecommendations(b.result).recommendations.find((r) => r.trait === 'engagement')
    expect(recA?.questionIds).toEqual(['Q13'])
    expect(recB?.questionIds).toEqual(['Q07'])
    expect(recA?.action).not.toBe(recB?.action)
  })
})
