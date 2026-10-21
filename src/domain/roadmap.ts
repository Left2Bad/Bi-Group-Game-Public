import { LESSONS } from '../content/lessons'
import { practices } from '../content/recommendations'
import { msg } from '../i18n/translate'
import { TRAIT_IDS } from './types'
import type { AssessmentResult, RoadmapWeek, TraitId } from './types'

const ratio = (result: AssessmentResult, trait: TraitId) => result.traits[trait].points / result.traits[trait].maxPoints

/** Ответы по качеству от самого слабого; ничья — по ID вопроса, как в выборе рекомендаций. */
function byWeakness(result: AssessmentResult, trait: TraitId) {
  return [...result.traits[trait].evidence]
    .sort((a, b) => a.points - b.points || a.questionId.localeCompare(b.questionId))
}

/**
 * Траектория на 30 дней по двум фокусным качествам.
 * Недели 1–2 — главная практика по каждому фокусу (совпадает с картой маршрута),
 * недели 3–4 — следующая по слабости ситуация того же качества и второй микро-урок.
 * Неделя 4 заканчивается повторным тестом: история попыток покажет изменение профиля.
 */
export function buildRoadmap(result: AssessmentResult, priorityTraits: readonly TraitId[]): readonly RoadmapWeek[] {
  const byRatio = [...TRAIT_IDS].sort((a, b) => ratio(result, a) - ratio(result, b) || TRAIT_IDS.indexOf(a) - TRAIT_IDS.indexOf(b))
  const focus = [...priorityTraits]
  for (const trait of byRatio) if (focus.length < 2 && !focus.includes(trait)) focus.push(trait)
  const [first, second] = focus as [TraitId, TraitId]

  const plan: readonly [TraitId, number, 0 | 1][] = [[first, 0, 0], [second, 0, 0], [first, 1, 1], [second, 1, 1]]
  const days = [msg('Дни 1–7'), msg('Дни 8–14'), msg('Дни 15–21'), msg('Дни 22–30')] as const
  return plan.map(([trait, rank, lessonIndex], index) => {
    const evidence = byWeakness(result, trait)
    const item = evidence[rank] ?? evidence[0]
    if (!item) throw new Error(`Нет ответов для ${trait}`)
    const practice = practices[item.developmentTag]
    if (!practice) throw new Error(`Нет практики для ${item.developmentTag}`)
    const week = (index + 1) as RoadmapWeek['week']
    return {
      week, days: days[index]!, trait, lesson: LESSONS[trait][lessonIndex],
      title: rank === 0 ? msg('Главная практика') : msg('Закрепление в новой ситуации'),
      action: practice.action, successCriterion: practice.successCriterion,
      questionId: item.questionId, checkpoint: week === 4,
    }
  })
}
