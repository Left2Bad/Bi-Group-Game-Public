import { describe, expect, it } from 'vitest'
import { questions, scoring } from '../content/questions'
import { TEAM, TEAM_NAME } from '../content/team'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { assessConsistency } from './consistency'
import {
  ATTEMPT_CSV_HEADER, ATTEMPT_SCHEMA, attemptCsvRows, attemptFileName, buildAttemptExport, buildTeamExport,
  EXPORT_FORMAT_VERSION, TEAM_CSV_HEADER, TEAM_SCHEMA, teamCsvRows, teamFileName, toCsv, toJson,
} from './export'
import { calculateProfile } from './score'
import { buildTeamMembers, buildTeamReport } from './team'
import { DATA_VERSIONS, TRAIT_IDS } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, completedAt: '2026-10-17T08:30:00.000Z' }
const exportedAt = '2026-10-18T09:00:00.000Z'

function attempt() {
  const output = calculateProfile(manualSets.demoA.answers, { ...context, attemptId: 'attempt-1' })
  if (!output.ok) throw new Error(output.error.message)
  const data = buildAttemptExport({ result: output.result, questions, consistency: assessConsistency(output.result, questions), exportedAt })
  return { result: output.result, data }
}

describe('экспорт результата', () => {
  it('сохраняет проценты, баллы и ответы без потерь и без текстов интерфейса', () => {
    const { result, data } = attempt()
    expect(data.schema).toBe(ATTEMPT_SCHEMA)
    expect(data.formatVersion).toBe(EXPORT_FORMAT_VERSION)
    expect(data.attempt).toEqual({ id: 'attempt-1', completedAt: context.completedAt, versions: DATA_VERSIONS })
    expect(data.profile.traits.map((trait) => trait.percent)).toEqual(manualSets.demoA.percent)
    expect(data.profile.traits.map((trait) => trait.points)).toEqual(manualSets.demoA.points)
    expect(data.profile.traits.map((trait) => trait.id)).toEqual([...TRAIT_IDS])
    expect(data.answers).toHaveLength(15)
    for (const answer of data.answers) {
      expect(answer.optionId).toBe(result.answers[answer.questionId])
      expect(answer.optionId.endsWith(`-${answer.position}`)).toBe(true)
      expect(Object.keys(answer.points)).toHaveLength(2)
    }
    // Сумма баллов по ответам равна сумме баллов по качествам.
    const byAnswers = data.answers.reduce((sum, answer) => sum + Object.values(answer.points).reduce((a, b) => a + b, 0), 0)
    expect(byAnswers).toBe(data.profile.traits.reduce((sum, trait) => sum + trait.points, 0))
  })

  it('JSON читается обратно и содержит индикатор согласованности', () => {
    const { data } = attempt()
    const parsed = JSON.parse(toJson(data))
    expect(parsed).toEqual(data)
    expect(parsed.consistency.level).toBe('consistent')
    expect(parsed.consistency.signals.map((signal: { id: string }) => signal.id)).toEqual(['balanced', 'position'])
  })

  it('CSV: одна строка на качество, заголовок и число колонок совпадают', () => {
    const { data } = attempt()
    const rows = attemptCsvRows(data)
    expect(rows).toHaveLength(4)
    for (const row of rows) expect(row).toHaveLength(ATTEMPT_CSV_HEADER.length)
    const csv = toCsv(ATTEMPT_CSV_HEADER, rows)
    expect(csv.startsWith('\uFEFFattempt_id,completed_at')).toBe(true)
    expect(csv.split('\r\n')).toHaveLength(6)
    expect(csv).toContain('attempt-1,2026-10-17T08:30:00.000Z,bi-academy-v2,')
  })

  it('CSV экранирует кавычки, запятые, переводы строк и формулы', () => {
    const csv = toCsv(['a', 'b', 'c', 'd'], [['x,y', 'say "hi"', 'line\nbreak', '=SUM(A1)'], ['-5', 7, '+1', '@cmd']])
    const lines = csv.slice(1).split('\r\n')
    expect(lines[1]).toBe('"x,y","say ""hi""","line\nbreak",\'=SUM(A1)')
    expect(lines[2]).toBe("'-5,7,'+1,'@cmd")
  })

  it('имена файлов берут дату попытки', () => {
    const { data } = attempt()
    expect(attemptFileName(data, 'json')).toBe('bi-academy-profile-2026-10-17.json')
    expect(attemptFileName(data, 'csv')).toBe('bi-academy-profile-2026-10-17.csv')
  })
})

describe('экспорт команды', () => {
  const report = buildTeamReport(buildTeamMembers(TEAM, context))
  const data = buildTeamExport(report, { teamName: TEAM_NAME, demo: true, exportedAt })

  it('помечает вымышленную команду и сохраняет всех сотрудников', () => {
    expect(data.schema).toBe(TEAM_SCHEMA)
    expect(data.demo).toBe(true)
    expect(data.members).toHaveLength(8)
    expect(teamFileName(data, 'json')).toBe('bi-academy-team-demo-2026-10-18.json')
    expect(data.average).toEqual(report.average)
    expect(data.weakest).toBe(report.weakest)
  })

  it('CSV команды совпадает по числу колонок и несёт проценты и уровни', () => {
    const rows = teamCsvRows(data)
    expect(rows).toHaveLength(8)
    for (const row of rows) expect(row).toHaveLength(TEAM_CSV_HEADER.length)
    const first = data.members[0]!
    expect(rows[0]!.slice(4, 8)).toEqual(TRAIT_IDS.map((id) => first.traits[id].percent))
    expect(rows[0]!.slice(8, 12)).toEqual(TRAIT_IDS.map((id) => first.traits[id].level))
    expect(rows[0]![12]).toBe(first.consistency ?? '')
  })

  it('JSON команды читается обратно без потерь', () => {
    expect(JSON.parse(toJson(data))).toEqual(data)
  })
})
