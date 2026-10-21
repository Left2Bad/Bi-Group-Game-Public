import { TRAIT_IDS } from '../domain/types.ts'
import type { TraitId } from '../domain/types.ts'
import { comparableDynamic } from './domain.ts'
import type { DevelopmentWeek, DynamicAttempt, SkillEvaluation } from './domain.ts'
import { OTHER_SKILL, SKILL_RUBRIC_VERSION, expectedSkills, skillDefinition } from './skills.ts'
import type { SkillDefinition } from './skills.ts'

import { msg, russian } from '../i18n/translate.ts'
import type { Translate } from '../i18n/translate.ts'
/**
 * Карточка развития сотрудника для руководителя (новая динамическая методика). Чистые функции без пересчёта оценок:
 * всё строится из уже сохранённых попыток. Изменение процентов — это изменение ответов в тесте, а не доказанный рост на рабочем месте.
 */

/**
 * Почему динамику нельзя показать: одна попытка; прежние попытки несопоставимы по методике или настройкам оценки;
 * последний результат сохранён без идентификаторов навыков; у сопоставимых прежних попыток нет идентификаторов навыков.
 */
export type DynamicsGap = 'single' | 'incompatible' | 'no-skill-ids' | 'baseline-without-ids'

export const DYNAMICS_GAP_TEXT: Readonly<Record<DynamicsGap, string>> = {
  single: msg('Динамика появится после повторной диагностики.'),
  incompatible: msg('Сравнение невозможно: прежние попытки проведены по другой методике или с другими настройками оценки (рубрика, банк вопросов, модель, уровень размышлений). Их проценты напрямую не сравниваются.'),
  'no-skill-ids': msg('Оценка навыков сохранена до введения устойчивых идентификаторов навыков. Она показана как есть; динамика по навыкам для неё не рассчитывается и не пересчитывается задним числом.'),
  'baseline-without-ids': msg('Сравнение навыков невозможно: в прежних сопоставимых попытках навыки оценивались без устойчивых идентификаторов, а совпадения свободных названий для сравнения недостаточно.'),
}


export interface Delta { readonly baseline: number; readonly current: number; readonly delta: number }

export interface TraitDynamics {
  readonly baseline: DynamicAttempt | null
  readonly gap: DynamicsGap | null
  /** Есть более ранние попытки, несопоставимые с последней: входной считается первая сопоставимая. */
  readonly skippedEarlier: boolean
  readonly rows: Readonly<Record<TraitId, Delta | null>>
}

const completedAscending = (history: readonly DynamicAttempt[]) => history
  .filter((item) => item.status === 'completed' && item.evaluation)
  .sort((a, b) => (a.completedAt ?? a.createdAt).localeCompare(b.completedAt ?? b.createdAt))

/** Входная оценка — самая ранняя завершённая попытка, сопоставимая с последней по существующим правилам совместимости. */
export function traitDynamics(latest: DynamicAttempt, history: readonly DynamicAttempt[]): TraitDynamics {
  const earlier = completedAscending(history).filter((item) => item.id !== latest.id)
  const baseline = earlier.find((item) => comparableDynamic(item, latest)) ?? null
  const rows = Object.fromEntries(TRAIT_IDS.map((id) => {
    if (!baseline) return [id, null]
    const before = baseline.evaluation!.traits[id].finalPercent
    const now = latest.evaluation!.traits[id].finalPercent
    return [id, { baseline: before, current: now, delta: now - before }]
  })) as Record<TraitId, Delta | null>
  return { baseline, rows, gap: baseline ? null : earlier.length ? 'incompatible' : 'single',
    skippedEarlier: Boolean(baseline && earlier[0]!.id !== baseline.id) }
}

export type SkillRowState = 'assessed' | 'insufficient'
export interface SkillRow {
  readonly key: string
  readonly name: string
  readonly state: SkillRowState
  readonly skill: SkillEvaluation | null
  readonly definition: SkillDefinition | null
  readonly expected: boolean
  readonly change: Delta | null
  /** Почему для оценённого навыка нет изменения. */
  readonly changeGap: 'not-in-baseline' | 'not-comparable' | null
}
export interface SkillCard {
  readonly rows: readonly SkillRow[]
  /** Результат сохранён до каталога навыков: названия свободные, сравнение невозможно. */
  readonly legacy: boolean
  readonly baseline: DynamicAttempt | null
  readonly gap: DynamicsGap | null
}

const hasSkillIds = (attempt: DynamicAttempt) => attempt.evaluation?.skillRubricVersion === SKILL_RUBRIC_VERSION
  && (attempt.evaluation.skills ?? []).every((skill) => typeof skill.skillId === 'string')

/**
 * Оценённые навыки последней попытки и навыки, ожидаемые от должности, по которым ответов недостаточно.
 * Динамика по навыку — только при одинаковых skillId и версии каталога в сопоставимых попытках.
 */
export function skillCard(latest: DynamicAttempt, history: readonly DynamicAttempt[]): SkillCard {
  const skills = latest.evaluation?.skills ?? []
  const legacy = !hasSkillIds(latest)
  const earlier = completedAscending(history).filter((item) => item.id !== latest.id)
  const baseline = legacy ? null : earlier.find((item) => comparableDynamic(item, latest) && hasSkillIds(item)) ?? null
  const gap: DynamicsGap | null = baseline ? null : legacy ? 'no-skill-ids' : !earlier.length ? 'single'
    : earlier.some((item) => comparableDynamic(item, latest)) ? 'baseline-without-ids' : 'incompatible'
  const expected = legacy ? [] : expectedSkills(latest.jobRole)
  const assessed: SkillRow[] = skills.map((skill, index) => {
    const definition = !legacy && skill.skillId && skill.skillId !== OTHER_SKILL ? skillDefinition(skill.skillId) ?? null : null
    const before = definition && baseline ? baseline.evaluation!.skills!.find((item) => item.skillId === definition.id) : undefined
    return { key: definition?.id ?? `${skill.skillId ?? 'legacy'}-${index}`, name: skill.name, state: 'assessed', skill, definition,
      expected: Boolean(definition && expected.some((item) => item.id === definition.id)),
      change: before ? { baseline: before.percent, current: skill.percent, delta: skill.percent - before.percent } : null,
      changeGap: before ? null : baseline && definition ? 'not-in-baseline' : 'not-comparable' }
  })
  const missing: SkillRow[] = expected.filter((item) => !skills.some((skill) => skill.skillId === item.id)).map((definition) => ({
    key: definition.id, name: definition.name, state: 'insufficient', skill: null, definition, expected: true, change: null, changeGap: null }))
  return { rows: [...assessed, ...missing], legacy, baseline, gap }
}

/** Существующий план на 30 дней; для ранних результатов без roadmap — тот же запасной план, что видит сотрудник. */
export function planWeeks(attempt: DynamicAttempt, t: Translate = russian): readonly DevelopmentWeek[] {
  const scores = attempt.evaluation!.traits
  if (attempt.evaluation!.roadmap) return attempt.evaluation!.roadmap
  const sorted = [...TRAIT_IDS].sort((a, b) => scores[a].finalPercent - scores[b].finalPercent)
  const strongest = sorted.at(-1)!
  const focus = sorted.slice(0, 2)
  return [focus[0]!, focus[1]!, focus[0]!, focus[1]!].map((trait, index) => ({
    week: index + 1, trait, mode: 'growth' as const,
    action: index < 2 ? scores[trait].nextStep : t('Примените следующий шаг в новой рабочей ситуации: {step}', { step: scores[trait].nextStep }),
    successCriterion: scores[trait].successCriterion, support: scores[strongest].strength,
  }))
}

/** День окончания недели: 7, 14, 21 и 30 — повторная диагностика в конце маршрута. */
export const weekEndDay = (week: number) => week === 4 ? 30 : week * 7

export function planDeadline(attempt: DynamicAttempt, days: number): string {
  const value = new Date(attempt.completedAt ?? attempt.createdAt)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString()
}

export interface RouteWeek extends DevelopmentWeek {
  readonly deadline: string
  /** Когда сотрудник отметил практику; null — отметки нет. Это самостоятельная отметка, не подтверждение руководителя. */
  readonly markedAt: string | null
}
export interface RouteProgress {
  readonly weeks: readonly RouteWeek[]
  readonly marked: number
  readonly next: RouteWeek | null
  readonly retestAt: string
}

export function routeProgress(attempt: DynamicAttempt, marks: readonly { readonly week: number; readonly completedAt: string }[]): RouteProgress {
  const weeks = planWeeks(attempt).map((item): RouteWeek => ({ ...item, deadline: planDeadline(attempt, weekEndDay(item.week)),
    markedAt: marks.find((mark) => mark.week === item.week)?.completedAt ?? null }))
  return { weeks, marked: weeks.filter((item) => item.markedAt).length, next: weeks.find((item) => !item.markedAt) ?? null,
    retestAt: planDeadline(attempt, 30) }
}

/** Все завершённые попытки без дублей: входная, предыдущая и текущая. Для сравнения навыков этого достаточно. */
export const attemptsForComparison = (attempt: DynamicAttempt, ...others: (DynamicAttempt | null | undefined)[]) =>
  [...new Map([...others, attempt].filter((item): item is DynamicAttempt => Boolean(item)).map((item) => [item.id, item])).values()]
