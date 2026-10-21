import type { ConsistencyReport } from './consistency'
import { getArchetype } from './archetype'
import type { TeamReport } from './team'
import { TRAIT_IDS } from './types'
import type { AssessmentResult, Question, TraitId, TraitLevel } from './types'

/**
 * Экспорт результатов как заготовка для интеграции с системой обучения (LMS).
 * Формат не зависит от языка интерфейса: только идентификаторы, числа и коды уровней.
 * Любое несовместимое изменение формата повышает FORMAT_VERSION.
 */
export const EXPORT_FORMAT_VERSION = 1
export const ATTEMPT_SCHEMA = 'bi-academy.attempt'
export const TEAM_SCHEMA = 'bi-academy.team'

export interface AttemptExportTrait {
  readonly id: TraitId
  readonly points: number
  readonly maxPoints: number
  readonly percent: number
  readonly level: TraitLevel
}

export interface AttemptExportAnswer {
  readonly questionId: string
  readonly optionId: string
  /** Буква варианта в каталоге: A–D. */
  readonly position: string
  /** Баллы выбранного варианта по качествам этой ситуации. */
  readonly points: Readonly<Partial<Record<TraitId, number>>>
}

export interface AttemptExport {
  readonly schema: typeof ATTEMPT_SCHEMA
  readonly formatVersion: typeof EXPORT_FORMAT_VERSION
  readonly exportedAt: string
  readonly attempt: {
    readonly id: string
    readonly completedAt: string
    readonly versions: AssessmentResult['versions']
  }
  readonly profile: {
    readonly archetypeCode: string
    readonly traits: readonly AttemptExportTrait[]
  }
  /** null, если индикатор нельзя вычислить. Это подсказка, а не вывод о честности. */
  readonly consistency: {
    readonly level: ConsistencyReport['level']
    readonly signals: readonly { readonly id: string; readonly value: number; readonly outOf: number; readonly severity: string }[]
  } | null
  readonly answers: readonly AttemptExportAnswer[]
}

export function buildAttemptExport(input: {
  readonly result: AssessmentResult
  readonly questions: readonly Question[]
  readonly consistency: ConsistencyReport | null
  readonly exportedAt: string
}): AttemptExport {
  const { result, questions, consistency, exportedAt } = input
  return {
    schema: ATTEMPT_SCHEMA,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt,
    attempt: { id: result.attemptId, completedAt: result.completedAt, versions: { ...result.versions } },
    profile: {
      archetypeCode: getArchetype(result).code,
      traits: TRAIT_IDS.map((id) => {
        const { points, maxPoints, percent, level } = result.traits[id]
        return { id, points, maxPoints, percent, level }
      }),
    },
    consistency: consistency
      ? { level: consistency.level, signals: consistency.signals.map(({ id, value, outOf, severity }) => ({ id, value, outOf, severity })) }
      : null,
    answers: questions.flatMap((question) => {
      const optionId = result.answers[question.id]
      const position = question.options.findIndex((option) => option.id === optionId)
      if (optionId === undefined || position < 0) return []
      const points: Partial<Record<TraitId, number>> = {}
      for (const trait of [question.trait, question.secondaryTrait]) {
        const found = result.traits[trait]?.evidence.find((item) => item.questionId === question.id)
        if (found) points[trait] = found.points
      }
      return [{ questionId: question.id, optionId, position: 'ABCD'[position] ?? String(position), points }]
    }),
  }
}

export const ATTEMPT_CSV_HEADER = ['attempt_id', 'completed_at', 'assessment_version', 'archetype', 'trait', 'points', 'max_points', 'percent', 'level', 'consistency'] as const

/** Одна строка на качество: удобно загружать в таблицу или импортировать в LMS. */
export function attemptCsvRows(data: AttemptExport): (string | number)[][] {
  return data.profile.traits.map((trait) => [
    data.attempt.id, data.attempt.completedAt, data.attempt.versions.assessment, data.profile.archetypeCode,
    trait.id, trait.points, trait.maxPoints, trait.percent, trait.level, data.consistency?.level ?? '',
  ])
}

export interface TeamExportMember {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly archetypeCode: string
  readonly traits: Readonly<Record<TraitId, { readonly percent: number; readonly level: TraitLevel }>>
  readonly consistency: ConsistencyReport['level'] | null
}

export interface TeamExport {
  readonly schema: typeof TEAM_SCHEMA
  readonly formatVersion: typeof EXPORT_FORMAT_VERSION
  readonly exportedAt: string
  /** true, если сотрудники вымышленные. Такой файл нельзя считать данными реальной команды. */
  readonly demo: boolean
  readonly teamName: string
  readonly members: readonly TeamExportMember[]
  readonly average: Readonly<Record<TraitId, number>>
  readonly weakest: TraitId
  readonly strongest: TraitId
}

export function buildTeamExport(report: TeamReport, options: { readonly teamName: string; readonly demo: boolean; readonly exportedAt: string }): TeamExport {
  return {
    schema: TEAM_SCHEMA,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: options.exportedAt,
    demo: options.demo,
    teamName: options.teamName,
    members: report.members.map((member) => ({
      id: member.id, name: member.name, role: member.role, archetypeCode: member.archetype.code,
      traits: Object.fromEntries(TRAIT_IDS.map((id) =>
        [id, { percent: member.result.traits[id].percent, level: member.result.traits[id].level }])) as TeamExportMember['traits'],
      consistency: member.consistency?.level ?? null,
    })),
    average: { ...report.average },
    weakest: report.weakest,
    strongest: report.strongest,
  }
}

export const TEAM_CSV_HEADER = [
  'member_id', 'name', 'role', 'archetype',
  ...TRAIT_IDS.map((id) => `${id}_percent`), ...TRAIT_IDS.map((id) => `${id}_level`), 'consistency',
] as const

export function teamCsvRows(data: TeamExport): (string | number)[][] {
  return data.members.map((member) => [
    member.id, member.name, member.role, member.archetypeCode,
    ...TRAIT_IDS.map((id) => member.traits[id].percent), ...TRAIT_IDS.map((id) => member.traits[id].level), member.consistency ?? '',
  ])
}

/** Ячейка, которую Excel или Sheets могли бы выполнить как формулу, получает апостроф впереди. */
function cell(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** CSV по RFC 4180: запятая-разделитель, CRLF, кавычки удваиваются. Перед текстом ставится BOM, чтобы Excel узнал UTF-8. */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  return '\uFEFF' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function toJson(data: AttemptExport | TeamExport): string {
  return JSON.stringify(data, null, 2) + '\n'
}

const dayOf = (iso: string) => iso.slice(0, 10)

export const attemptFileName = (data: AttemptExport, extension: 'json' | 'csv') =>
  `bi-academy-profile-${dayOf(data.attempt.completedAt)}.${extension}`

export const teamFileName = (data: TeamExport, extension: 'json' | 'csv') =>
  `bi-academy-team${data.demo ? '-demo' : ''}-${dayOf(data.exportedAt)}.${extension}`
