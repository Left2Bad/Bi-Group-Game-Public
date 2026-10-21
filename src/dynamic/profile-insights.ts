import { CRITERIA } from './domain.ts'
import type { CriterionId, DynamicEvaluation, TraitEvaluation } from './domain.ts'
import { msg, russian } from '../i18n/translate.ts'
import type { Translate } from '../i18n/translate.ts'

export const CRITERION_NAMES: Readonly<Record<CriterionId, string>> = {
  facts: msg('Факты и риски'), safety: msg('Технология и охрана труда'), reasoning: msg('Обоснование'),
  responsibility: msg('Ответственность'), communication: msg('Коммуникация'), plan: msg('План и проверка результата'),
}

/** Критерии рубрики с уровнем ниже «обоснованного решения» (3 из 4): это места, где ответам не хватило полноты. */
export function weakCriteria(evaluation: DynamicEvaluation) {
  if (!evaluation.criteria) return []
  return CRITERIA.map((id) => ({ id, name: CRITERION_NAMES[id], ...evaluation.criteria![id] }))
    .filter((item) => item.level < 3).sort((a, b) => a.level - b.level)
}

/** Разрыв между выбором в ситуациях и поведением в ответах. Показывается при разнице от 10 процентов. */
export function componentGap(score: TraitEvaluation, t: Translate = russian): string | null {
  const written = score.behaviorPercent ?? score.professionalPercent
  const chosen = score.preferencePercent
  if (chosen - written >= 10) return t('В выборе ситуаций это качество проявилось заметнее ({chosen}%), чем в ваших ответах ({written}%): в ответах не хватило конкретных действий и проверки результата.', { chosen, written })
  if (written - chosen >= 10) return t('В ответах это качество проявилось заметнее ({written}%), чем в выборе ситуаций ({chosen}%): в готовых вариантах вы чаще выбирали другой приоритет.', { written, chosen })
  return null
}

/** Темы для изучения по навыкам ниже 75%: рекомендации модели, а не назначенные или пройденные курсы. */
export function academyTopics(evaluation: DynamicEvaluation | null | undefined, venue: 'BuildEX' | 'BIU'): string[] {
  return [...new Set((evaluation?.skills ?? []).filter((skill) => skill.learningVenue === venue && skill.percent < 75).map((skill) => skill.learningTopic))]
}
