import type { AssessmentResult } from '../../src/domain/types'
import { TRAIT_IDS } from '../../src/domain/types'

/**
 * В методике v2 все четыре качества одновременно не могут быть ≥75% (ровный максимум — 67%).
 * Ветку «нет приоритетов, только поддержание» интерфейс и маршрут всё равно обязаны обрабатывать,
 * поэтому проверяем её на синтетическом профиле, где все уровни — сильная сторона.
 */
export function asAllStrengths(result: AssessmentResult): AssessmentResult {
  return { ...result, traits: Object.fromEntries(TRAIT_IDS.map((trait) =>
    [trait, { ...result.traits[trait], level: 'strength' as const }])) as AssessmentResult['traits'] }
}
