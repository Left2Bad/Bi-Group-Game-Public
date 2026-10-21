/** Общий контракт D1-03. Изменения согласуют A и C, представление проверяет B. */
export const TRAIT_IDS = ['criticalThinking', 'confidence', 'discipline', 'engagement'] as const
export type TraitId = typeof TRAIT_IDS[number]
export type QuestionId = string
export type OptionId = string
export type Points = 0 | 1 | 2 | 3
export type TraitLevel = 'priority' | 'developing' | 'strength'

/** Версии меняются независимо при изменении схемы, текстов, баллов или рекомендаций. */
export interface DataVersions {
  readonly schema: number
  readonly assessment: string
  readonly scoring: string
  readonly recommendations: string
}

export const DATA_VERSIONS = {
  schema: 1,
  assessment: 'bi-academy-v2',
  scoring: 'bi-academy-v2',
  recommendations: 'bi-academy-v2',
} as const satisfies DataVersions

export interface AnswerOption {
  readonly id: OptionId
  readonly text: string
}

export interface Question {
  readonly id: QuestionId
  /** Основное качество ситуации. */
  readonly trait: TraitId
  /** Дополнительное качество: каждый вариант даёт баллы обоим, поэтому выбор — компромисс. */
  readonly secondaryTrait: TraitId
  readonly context: string
  readonly text: string
  readonly options: readonly [AnswerOption, AnswerOption, AnswerOption, AnswerOption]
}

/** Одно правило на пару «вариант × качество» (основное или дополнительное качество вопроса). */
export interface ScoringRule {
  readonly questionId: QuestionId
  readonly optionId: OptionId
  readonly trait: TraitId
  readonly points: Points
  readonly reason: string
  readonly developmentTag: string
}

/** Отсутствующий ключ — ещё нет ответа; повторный выбор заменяет значение. */
export type Answers = Readonly<Record<QuestionId, OptionId>>

export type Evidence = ScoringRule

export interface TraitResult {
  readonly trait: TraitId
  readonly points: number
  readonly maxPoints: number
  /** Только отображение: round(100 * points / maxPoints). */
  readonly percent: number
  /** Уровень и сортировка определяются по points/maxPoints до округления. */
  readonly level: TraitLevel
  readonly evidence: readonly Evidence[]
}

export interface AssessmentResult {
  readonly attemptId: string
  /** ISO 8601 UTC; передаётся снаружи, чистый расчёт не читает часы. */
  readonly completedAt: string
  readonly versions: DataVersions
  readonly answers: Answers
  readonly traits: Readonly<Record<TraitId, TraitResult>>
}

export interface Recommendation {
  readonly id: string
  readonly trait: TraitId
  readonly kind: 'development' | 'maintenance'
  readonly reason: string
  readonly action: string
  readonly practice: string
  readonly durationDays: number
  readonly successCriterion: string
  readonly questionIds: readonly QuestionId[]
  readonly developmentTag: string
}

export interface MicroLesson {
  readonly title: string
  readonly minutes: number
  readonly idea: string
}

/** Одна неделя траектории на 30 дней. */
export interface RoadmapWeek {
  readonly week: 1 | 2 | 3 | 4
  readonly days: string
  readonly trait: TraitId
  readonly title: string
  readonly lesson: MicroLesson
  readonly action: string
  readonly successCriterion: string
  readonly questionId: QuestionId
  /** Последняя неделя завершается повторным тестом и сравнением профиля. */
  readonly checkpoint: boolean
}

export interface DevelopmentPlan {
  /** Не более двух; при одинаковых долях — порядок TRAIT_IDS. */
  readonly priorityTraits: readonly TraitId[]
  readonly recommendations: readonly Recommendation[]
  /** Траектория на 4 недели; отсутствует только в синтетических fixtures. */
  readonly roadmap?: readonly RoadmapWeek[]
}

export interface Draft {
  readonly versions: DataVersions
  readonly answers: Answers
  readonly currentQuestionId: QuestionId
  readonly updatedAt: string
}

export interface ValidationIssue {
  readonly code: 'missing-answer' | 'unknown-question' | 'unknown-option' | 'invalid-answers'
  readonly questionId?: QuestionId
}

export type ValidationResult =
  | { readonly ok: true; readonly answers: Answers }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] }

export interface CalculationContext {
  readonly attemptId: string
  readonly completedAt: string
  readonly versions: DataVersions
  readonly questions: readonly Question[]
  readonly scoring: readonly ScoringRule[]
}

export type CalculationResult =
  | { readonly ok: true; readonly result: AssessmentResult }
  | { readonly ok: false; readonly error: {
      readonly code: 'invalid-answers' | 'invalid-content'
      readonly message: string
      readonly issues: readonly ValidationIssue[]
    } }

/** C реализует validate.ts, score.ts, recommend.ts с этими сигнатурами. */
export type ValidateAnswers = (answers: unknown, questions: readonly Question[]) => ValidationResult
export type CalculateProfile = (answers: unknown, context: CalculationContext) => CalculationResult
export type BuildRecommendations = (result: AssessmentResult) => DevelopmentPlan

/** A реализует storage в D2-03. Ошибки хранилища не должны падать в React. */
export type LoadDraftResult =
  | { readonly status: 'loaded'; readonly draft: Draft }
  | { readonly status: 'empty' | 'invalid' | 'incompatible' | 'unavailable' }
export type SaveDraftResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unavailable' | 'invalid' }
export type LoadDraft = () => LoadDraftResult
export type SaveDraft = (draft: Draft) => SaveDraftResult
