import { describe, expect, it } from 'vitest'
import { questions, scoring } from '../content/questions'
import { LESSONS } from '../content/lessons'
import { practices } from '../content/recommendations'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { asAllStrengths } from '../../tests/fixtures/high-profile'
import { buildRecommendations } from './recommend'
import { calculateProfile } from './score'
import { DATA_VERSIONS } from './types'
import type { Answers } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, attemptId: 'roadmap', completedAt: '2026-10-17T00:00:00.000Z' }
function planFor(answers: Answers) {
  const output = calculateProfile(answers, context)
  if (!output.ok) throw new Error(output.error.message)
  return { result: output.result, plan: buildRecommendations(output.result) }
}

describe('траектория на 30 дней', () => {
  it('чередует два фокуса и начинается с той же практики, что карта маршрута', () => {
    const { plan } = planFor(manualSets.demoA.answers)
    const roadmap = plan.roadmap!
    expect(roadmap.map((week) => week.week)).toEqual([1, 2, 3, 4])
    expect(roadmap.map((week) => week.trait)).toEqual(['engagement', 'confidence', 'engagement', 'confidence'])
    expect(roadmap[0]!.action).toBe(plan.recommendations[0]!.action)
    expect(roadmap[1]!.action).toBe(plan.recommendations[1]!.action)
    expect(roadmap.map((week) => week.checkpoint)).toEqual([false, false, false, true])
    expect(roadmap.map((week) => week.days)).toEqual(['Дни 1–7', 'Дни 8–14', 'Дни 15–21', 'Дни 22–30'])
  })

  it('недели 3–4 берут следующую по слабости ситуацию и второй урок', () => {
    const { result, plan } = planFor(manualSets.demoA.answers)
    const roadmap = plan.roadmap!
    expect(roadmap[2]!.questionId).not.toBe(roadmap[0]!.questionId)
    expect(roadmap[3]!.questionId).not.toBe(roadmap[1]!.questionId)
    expect(roadmap[0]!.lesson).toEqual(LESSONS.engagement[0])
    expect(roadmap[2]!.lesson).toEqual(LESSONS.engagement[1])
    const engagement = [...result.traits.engagement.evidence].sort((a, b) => a.points - b.points || a.questionId.localeCompare(b.questionId))
    expect(roadmap[2]!.questionId).toBe(engagement[1]!.questionId)
    expect(roadmap[2]!.action).toBe(practices[engagement[1]!.developmentTag]!.action)
  })

  it('при одном приоритете добирает второй фокус из самых низких качеств', () => {
    const { plan } = planFor(manualSets.demoB.answers)
    expect(new Set(plan.roadmap!.map((week) => week.trait)).size).toBe(2)
  })

  it('строится и без приоритетов — по двум самым низким качествам', () => {
    const output = calculateProfile(manualSets.demoA.answers, context)
    if (!output.ok) throw new Error('bad')
    const plan = buildRecommendations(asAllStrengths(output.result))
    expect(plan.priorityTraits).toEqual([])
    expect(plan.roadmap!.map((week) => week.trait)).toEqual(['engagement', 'confidence', 'engagement', 'confidence'])
  })

  it('у каждого качества два содержательных урока', () => {
    for (const lessons of Object.values(LESSONS)) for (const lesson of lessons) {
      expect(lesson.title.trim()).not.toBe('')
      expect(lesson.idea.length).toBeGreaterThan(40)
      expect(lesson.minutes).toBeGreaterThan(0)
    }
  })
})
