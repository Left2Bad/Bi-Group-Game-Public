import { describe, expect, it } from 'vitest'
import { questions, scoring } from '../content/questions'
import { TEAM } from '../content/team'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { calculateProfile } from './score'
import { answersForPersona, buildTeamMembers, buildTeamReport, memberFromResult } from './team'
import { DATA_VERSIONS, TRAIT_IDS } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, completedAt: '2026-10-10T08:00:00.000Z' }

describe('профиль команды', () => {
  it('считает вымышленных сотрудников той же формулой и даёт разнообразные архетипы', () => {
    const members = buildTeamMembers(TEAM, context)
    expect(members).toHaveLength(8)
    for (const member of members) {
      const recomputed = calculateProfile(member.result.answers, { ...context, attemptId: 'check' })
      if (!recomputed.ok) throw new Error('bad')
      expect(TRAIT_IDS.map((id) => recomputed.result.traits[id].percent)).toEqual(TRAIT_IDS.map((id) => member.result.traits[id].percent))
    }
    expect(new Set(members.map((member) => member.archetype.code)).size).toBeGreaterThanOrEqual(5)
  })

  it('равные веса дают ровный профиль «Главного инженера»', () => {
    const balanced = { id: 'x', name: 'X', role: 'Y', weights: { criticalThinking: 1, confidence: 1, discipline: 1, engagement: 1 } }
    expect(answersForPersona(balanced, questions, scoring)).toEqual(manualSets.balanced.answers)
  })

  it('находит зону роста и опору команды', () => {
    const report = buildTeamReport(buildTeamMembers(TEAM, context))
    expect(TRAIT_IDS).toContain(report.weakest)
    expect(report.weakest).not.toBe(report.strongest)
    for (const trait of TRAIT_IDS) expect(report.average[report.weakest]).toBeLessThanOrEqual(report.average[trait])
    expect(report.archetypeCounts.reduce((sum, item) => sum + item.count, 0)).toBe(8)
  })

  it('добавляет собственный результат к команде', () => {
    const own = calculateProfile(manualSets.demoA.answers, { ...context, attemptId: 'own' })
    if (!own.ok) throw new Error('bad')
    const members = [...buildTeamMembers(TEAM, context), memberFromResult('own', 'Вы', 'Ваш результат', own.result)]
    expect(buildTeamReport(members).archetypeCounts.reduce((sum, item) => sum + item.count, 0)).toBe(9)
  })
})
