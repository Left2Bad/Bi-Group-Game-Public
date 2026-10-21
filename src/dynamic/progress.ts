import { TRAIT_IDS } from '../domain/types.ts'
import type { TraitId } from '../domain/types.ts'
import { CRITERIA } from './domain.ts'
import type { DynamicAttempt, ProgressVerdict, SkillEvaluation } from './domain.ts'
import { CRITERION_NAMES } from './profile-insights.ts'
import { OTHER_SKILL } from './skills.ts'
import { msg } from '../i18n/translate.ts'

/**
 * Цикл «до и после» во вкладке «Прогресс»: проценты последней попытки против первой (закреплённой) и серединной.
 * Ничего не пересчитывается: берутся уже сохранённые оценки. Критерий рубрики 0–4 показан как 0–100% (шаг 25%).
 */
export interface ProgressRow {
  readonly key: string
  readonly name: string
  readonly now: number
  /** null — в той попытке пункт не оценивался: изменение не показывается. */
  readonly first: number | null
  readonly middle: number | null
}

export interface ProgressRows {
  readonly traits: readonly (ProgressRow & { readonly trait: TraitId })[]
  readonly criteria: readonly ProgressRow[]
  readonly skills: readonly ProgressRow[]
}

/** Вердикт анализа «до и после» для сотрудника и руководителя. */
export const PROGRESS_VERDICT: Readonly<Record<ProgressVerdict, string>> = {
  better: msg('Ответы стали профессиональнее'), same: msg('Уровень ответов прежний'), worse: msg('Ответы стали слабее'),
}

/** «+5%», «−3%» (типографский минус) или «0%». */
export const signedPercent = (delta: number) => delta > 0 ? `+${delta}%` : delta < 0 ? `−${-delta}%` : '0%'
export const progressTrend = (delta: number) => delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

const skillKey = (skill: SkillEvaluation) => skill.skillId && skill.skillId !== OTHER_SKILL ? skill.skillId : `name:${skill.name.trim().toLocaleLowerCase('ru')}`

export function progressRows(attempt: DynamicAttempt, first: DynamicAttempt | null, middle: DynamicAttempt | null,
  traitNames: Readonly<Record<TraitId, string>>): ProgressRows {
  const now = attempt.evaluation!
  const trait = (source: DynamicAttempt | null, id: TraitId) => source?.evaluation?.traits[id]?.finalPercent ?? null
  const criterion = (source: DynamicAttempt | null, id: typeof CRITERIA[number]) => {
    const level = source?.evaluation?.criteria?.[id]?.level
    return level === undefined ? null : 25 * level
  }
  const skill = (source: DynamicAttempt | null, key: string) => source?.evaluation?.skills?.find((item) => skillKey(item) === key)?.percent ?? null
  return {
    traits: TRAIT_IDS.map((id) => ({ key: id, trait: id, name: traitNames[id], now: now.traits[id].finalPercent, first: trait(first, id), middle: trait(middle, id) })),
    criteria: now.criteria ? CRITERIA.map((id) => ({ key: id, name: CRITERION_NAMES[id], now: 25 * now.criteria![id].level,
      first: criterion(first, id), middle: criterion(middle, id) })) : [],
    skills: (now.skills ?? []).map((item) => {
      const key = skillKey(item)
      return { key, name: item.name, now: item.percent, first: skill(first, key), middle: skill(middle, key) }
    }),
  }
}

/** Дата следующего повторного теста: через 30 дней после текущего прохождения. */
export function nextRetest(attempt: DynamicAttempt): Date {
  return new Date(Date.parse(attempt.completedAt ?? attempt.createdAt) + 30 * 86_400_000)
}
