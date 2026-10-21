import type { TraitId } from '../domain/types'
import { msg } from '../i18n/translate'

/**
 * Вымышленная команда строительного участка для демонстрации экрана руководителя.
 * Ответы не записаны вручную: для каждого человека задано, чему он отдаёт приоритет,
 * и ответы выбираются по этим весам, а профиль считает та же формула, что и для сотрудника.
 */
export interface TeamPersona {
  readonly id: string
  readonly name: string
  readonly role: string
  /** Чем больше вес, тем чаще человек выбирает вариант в пользу этого качества. */
  readonly weights: Readonly<Record<TraitId, number>>
  /** Ситуации, где человек выбирает уход от ответственности (вариант с 0–1 баллом). */
  readonly avoids?: readonly string[]
}

export const TEAM_NAME = msg('Участок № 3, жилой комплекс (пример)')

export const TEAM: readonly TeamPersona[] = [
  { id: 'p1', name: msg('Ерлан Б.'), role: msg('Начальник участка'), weights: { criticalThinking: 1, confidence: 1, discipline: 1, engagement: 1 } },
  { id: 'p2', name: msg('Динара К.'), role: msg('Инженер ПТО'), weights: { criticalThinking: 3, confidence: 1, discipline: 3, engagement: 3 } },
  { id: 'p3', name: msg('Сергей М.'), role: msg('Мастер участка'), weights: { criticalThinking: 1, confidence: 3, discipline: 1, engagement: 3 }, avoids: ['Q11'] },
  { id: 'p4', name: msg('Асель Т.'), role: msg('Инженер стройконтроля'), weights: { criticalThinking: 3, confidence: 2, discipline: 3, engagement: 1 } },
  { id: 'p5', name: msg('Нурлан О.'), role: msg('Бригадир монолитчиков'), weights: { criticalThinking: 1, confidence: 3, discipline: 2, engagement: 2 }, avoids: ['Q03'] },
  { id: 'p6', name: msg('Алексей В.'), role: msg('Прораб'), weights: { criticalThinking: 2, confidence: 2, discipline: 1, engagement: 3 }, avoids: ['Q09'] },
  { id: 'p7', name: msg('Мадина Ж.'), role: msg('Инженер по охране труда'), weights: { criticalThinking: 2, confidence: 3, discipline: 3, engagement: 1 } },
  { id: 'p8', name: msg('Тимур А.'), role: msg('Молодой специалист'), weights: { criticalThinking: 2, confidence: 1, discipline: 1, engagement: 2 }, avoids: ['Q02', 'Q08', 'Q12'] },
]
