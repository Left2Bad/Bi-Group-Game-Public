import { describe, expect, it } from 'vitest'
import { completed } from '../../tests/fixtures/dynamic-attempts'
import { buildTeamReport } from '../domain/team'
import { teamMemberFromDynamic } from './team-member'

describe('участник профиля команды по новой методике', () => {
  it('берёт итоговые проценты четырёх качеств без пересчёта, должность из попытки и не выдумывает согласованность', () => {
    const member = teamMemberFromDynamic('u1', 'Иван', completed('a1', 1, { percent: 50 }))
    expect(member.role).toBe('Прораб')
    expect(member.consistency).toBeNull()
    expect(member.result.traits.criticalThinking.percent).toBe(50)
    expect(member.result.traits.engagement.percent).toBe(80)
    expect(member.result.traits.discipline.level).toBe('developing')
  })
  it('участвует в отчёте команды: среднее, зона роста и опора', () => {
    const report = buildTeamReport([teamMemberFromDynamic('u1', 'Иван', completed('a1', 1, { percent: 50 })), teamMemberFromDynamic('u2', 'Анна', completed('a2', 2, { percent: 60 }))])
    expect(report.average).toEqual({ criticalThinking: 55, confidence: 65, discipline: 75, engagement: 85 })
    expect(report.weakest).toBe('criticalThinking')
    expect(report.strongest).toBe('engagement')
    expect(report.attention).toEqual([])
  })
})
