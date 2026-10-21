import type { AssessmentResult, Question, TraitId } from './types'

/**
 * Индикатор согласованности ответов.
 *
 * В тесте нет «правильного» ответа: три рабочих варианта в каждой ситуации дают одинаковую сумму баллов.
 * Поэтому ответы «как надо» выдают не баллы, а характер выбора. Индикатор смотрит на два признака и
 * никогда не меняет проценты профиля:
 *  1. «Золотая середина» — почти везде выбран компромиссный вариант (по 2 балла обоим качествам).
 *     Это самый «безопасно звучащий» ответ, и именно его выбирает тот, кто угадывает ожидания.
 *  2. «Одна и та же позиция» — почти везде выбрана одна и та же буква A/B/C/D независимо от текста.
 *     Порядок вариантов в каталоге перемешан, поэтому такая серия означает, что текст не читали.
 *
 * Мы намеренно не сравниваем «противоположные» ответы в похожих ситуациях: человек вправе вести себя
 * по-разному в разных ситуациях, и такое сравнение давало бы ложные срабатывания на внимательных людях.
 *
 * Пороги подобраны моделированием (docs/methodology.md, раздел «Индикатор согласованности»).
 * Индикатор — подсказка для размышления, а не вывод о честности и не основание для кадровых решений.
 */
export const CONSISTENCY_THRESHOLDS = {
  /** Компромиссных вариантов из 15: «стоит перепроверить» / «низкая согласованность». */
  balanced: { watch: 9, flag: 12 },
  /** Одинаковых позиций A/B/C/D из 15. */
  samePosition: { watch: 8, flag: 10 },
} as const

export type ConsistencyLevel = 'consistent' | 'check' | 'low'
export type ConsistencySignalId = 'balanced' | 'position'
export type ConsistencySeverity = 'none' | 'watch' | 'flag'

export interface ConsistencySignal {
  readonly id: ConsistencySignalId
  readonly severity: ConsistencySeverity
  /** Измеренное значение признака. */
  readonly value: number
  /** Число ситуаций, из которых оно получено. */
  readonly outOf: number
  readonly watchAt: number
  readonly flagAt: number
}

export interface ConsistencyReport {
  readonly level: ConsistencyLevel
  readonly signals: readonly ConsistencySignal[]
  /** Сколько раз выбран вариант с нулём баллов обоим качествам. Справочно, на уровень не влияет. */
  readonly avoidCount: number
  readonly total: number
}

/** Баллы выбранного варианта по основному и дополнительному качеству ситуации; null, если расчёт неполон. */
function chosenPoints(result: AssessmentResult, question: Question): { primary: number; secondary: number; position: number } | null {
  const optionId = result.answers[question.id]
  const position = question.options.findIndex((option) => option.id === optionId)
  if (position < 0) return null
  const pointsFor = (trait: TraitId) => result.traits[trait]?.evidence.find((item) => item.questionId === question.id)?.points
  const primary = pointsFor(question.trait)
  const secondary = pointsFor(question.secondaryTrait)
  return primary === undefined || secondary === undefined ? null : { primary, secondary, position }
}

const severityOf = (value: number, limits: { readonly watch: number; readonly flag: number }): ConsistencySeverity =>
  value >= limits.flag ? 'flag' : value >= limits.watch ? 'watch' : 'none'

/**
 * Возвращает null, если по результату нельзя восстановить выбор в каждой ситуации
 * (например, у синтетического результата нет доказательств): тогда индикатор просто не показывается.
 */
export function assessConsistency(result: AssessmentResult, questions: readonly Question[]): ConsistencyReport | null {
  if (questions.length === 0) return null
  const picks = questions.map((question) => chosenPoints(result, question))
  if (picks.some((pick) => pick === null)) return null

  let balanced = 0
  let avoidCount = 0
  const positions = new Map<number, number>()
  for (const pick of picks) {
    const { primary, secondary, position } = pick!
    if (primary === secondary) { if (primary > 0) balanced += 1; else avoidCount += 1 }
    positions.set(position, (positions.get(position) ?? 0) + 1)
  }

  const total = questions.length
  const samePosition = Math.max(...positions.values())
  const signals: ConsistencySignal[] = [
    { id: 'balanced', value: balanced, outOf: total, watchAt: CONSISTENCY_THRESHOLDS.balanced.watch,
      flagAt: CONSISTENCY_THRESHOLDS.balanced.flag, severity: severityOf(balanced, CONSISTENCY_THRESHOLDS.balanced) },
    { id: 'position', value: samePosition, outOf: total, watchAt: CONSISTENCY_THRESHOLDS.samePosition.watch,
      flagAt: CONSISTENCY_THRESHOLDS.samePosition.flag, severity: severityOf(samePosition, CONSISTENCY_THRESHOLDS.samePosition) },
  ]
  const level: ConsistencyLevel = signals.some((signal) => signal.severity === 'flag') ? 'low'
    : signals.some((signal) => signal.severity === 'watch') ? 'check' : 'consistent'
  return { level, signals, avoidCount, total }
}
