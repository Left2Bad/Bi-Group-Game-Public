import { maintenance, practices } from '../content/recommendations'
import { interpolate, msg } from '../i18n/translate'
import type { Translate } from '../i18n/translate'
import { buildRoadmap } from './roadmap'
import { TRAIT_IDS } from './types'
import type { AssessmentResult, BuildRecommendations, Recommendation, TraitId } from './types'

const REASON_STRONG = msg('По выбранным ответам это сильная сторона. Например, {id}: {reason}')
const REASON_DEVELOPMENT = msg('По выбранному ответу {id}: {reason}')

/**
 * Основание рекомендации — русская фраза-рамка и обоснование выбранного варианта. Рамка переводится,
 * обоснование варианта — часть теста и остаётся как есть.
 */
export function localizeReason(reason: string, t: Translate): string {
  for (const template of [REASON_STRONG, REASON_DEVELOPMENT]) {
    const pattern = new RegExp('^' + template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('{id}', '(\\S+?)').replace('{reason}', '([\\s\\S]*)') + '$')
    const match = pattern.exec(reason)
    if (match) return t(template, { id: match[1]!, reason: match[2]! })
  }
  return reason
}

export const buildRecommendations: BuildRecommendations = (result: AssessmentResult) => {
  const ordered = [...TRAIT_IDS].sort((a, b) => {
    const left = result.traits[a], right = result.traits[b]
    return left.points / left.maxPoints - right.points / right.maxPoints
      || TRAIT_IDS.indexOf(a) - TRAIT_IDS.indexOf(b)
  })
  const needDevelopment = ordered.filter((trait) => result.traits[trait].level !== 'strength')
  const priorityTraits: readonly TraitId[] = needDevelopment.slice(0, 2)
  const selected = needDevelopment.length ? needDevelopment : ordered.slice(0, 2)
  const recommendations: Recommendation[] = selected.map((trait) => {
    const score = result.traits[trait]
    const weakest = [...score.evidence].sort((a, b) => a.points - b.points || a.questionId.localeCompare(b.questionId))[0]
    if (!weakest) throw new Error(`Нет выбранных ответов для ${trait}`)
    const strong = score.level === 'strength'
    const practice = strong ? maintenance[trait] : practices[weakest.developmentTag]
    if (!practice) throw new Error(`Нет практики для ${weakest.developmentTag}`)
    return { id: `${trait}-${strong ? 'maintain' : weakest.questionId}`, trait,
      kind: strong ? 'maintenance' : 'development',
      reason: interpolate(strong ? REASON_STRONG : REASON_DEVELOPMENT, { id: weakest.questionId, reason: weakest.reason }),
      action: practice.action, practice: practice.practice, durationDays: 7,
      successCriterion: practice.successCriterion, questionIds: [weakest.questionId],
      developmentTag: weakest.developmentTag }
  })
  return { priorityTraits, recommendations, roadmap: buildRoadmap(result, priorityTraits) }
}
