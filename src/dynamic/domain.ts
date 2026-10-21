import { TRAIT_IDS } from '../domain/types.ts'
import type { TraitId } from '../domain/types'
import type { SkillId } from './skills.ts'

export const DYNAMIC_METHOD = 'bi-academy-dynamic-v2'
export const RUBRIC_VERSION = 'dual-rubric-v1'
export const PROMPT_VERSION = 'bank-selection-v1'
export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ReasoningEffort = typeof REASONING_EFFORTS[number]
export const CRITERIA = ['facts', 'safety', 'reasoning', 'responsibility', 'communication', 'plan'] as const
export type CriterionId = typeof CRITERIA[number]
export const TRAIT_CRITERIA: Readonly<Record<TraitId, readonly CriterionId[]>> = {
  criticalThinking: ['facts', 'safety', 'reasoning'],
  confidence: ['reasoning', 'responsibility', 'communication'],
  discipline: ['safety', 'responsibility', 'plan'],
  engagement: ['responsibility', 'communication', 'plan'],
}
export interface CriterionEvaluation { readonly level: number; readonly evidence: string; readonly explanation: string }
export interface BehaviorEvaluation { readonly level: number; readonly evidence: string; readonly explanation: string }
export interface SkillEvaluation {
  /** Stable catalog ID (professional-skills-v1+). Absent in results saved before the catalog: such skills are shown but never compared. */
  readonly skillId?: SkillId | 'other'
  readonly name: string; readonly level: number; readonly percent: number
  readonly evidence: string; readonly explanation: string; readonly nextStep: string
  /** Suggested area of study, not an actual enrollment or completed course. */
  readonly learningVenue: 'BuildEX' | 'BIU'; readonly learningTopic: string
}
export interface DevelopmentWeek {
  readonly week: number; readonly trait: TraitId; readonly mode: 'growth' | 'consolidation'
  readonly action: string; readonly successCriterion: string; readonly support: string
}
export const PAIRS: readonly [TraitId, TraitId][] = [
  ['criticalThinking', 'confidence'], ['discipline', 'engagement'],
  ['criticalThinking', 'discipline'], ['confidence', 'engagement'],
  ['criticalThinking', 'engagement'], ['confidence', 'discipline'],
  ['confidence', 'criticalThinking'], ['engagement', 'discipline'],
  ['discipline', 'criticalThinking'], ['engagement', 'confidence'],
]
export const OPEN_TRAITS: readonly TraitId[] = [
  'criticalThinking', 'confidence', 'discipline', 'engagement', 'criticalThinking',
]
export const PREFERENCE_WEIGHTS = [[4, 1], [3, 2], [2, 3], [1, 4]] as const

export interface ChoiceOption { readonly id: string; readonly text: string; readonly primary: number; readonly secondary: number }
export interface ChoiceQuestion {
  readonly id: string; readonly context: string; readonly text: string
  readonly primaryTrait: TraitId; readonly secondaryTrait: TraitId
  readonly options: readonly ChoiceOption[]
}
export interface OpenQuestion { readonly id: string; readonly text: string; readonly trait: TraitId; readonly promptVersion?: string }
export interface TraitEvaluation {
  readonly preferencePercent: number
  readonly professionalPercent: number
  /** Behavioral evidence from the 15 answers, separate from the professional skills rubric. */
  readonly behaviorPercent?: number
  readonly finalPercent: number
  readonly evidence: string
  readonly strength: string
  readonly nextStep: string
  readonly successCriterion: string
  readonly questionId?: string
}
export interface DynamicEvaluation {
  readonly rubricVersion: string
  readonly promptVersion?: string
  readonly model: string
  readonly reasoningEffort?: ReasoningEffort | null
  readonly traits: Readonly<Record<TraitId, TraitEvaluation>>
  /** Optional only for results persisted before professional-v2. */
  readonly criteria?: Readonly<Record<CriterionId, CriterionEvaluation>>
  readonly behavior?: Readonly<Record<TraitId, BehaviorEvaluation>>
  readonly skills?: readonly SkillEvaluation[]
  /** Version of the skill catalog used for skillId; absent in older results. */
  readonly skillRubricVersion?: string
  readonly unsafe?: boolean
  readonly safetyExplanation?: string
  readonly roadmap?: readonly DevelopmentWeek[]
  /** Анализ «до и после» со второй попытки: сравнение ответов с первым и серединным прохождением. */
  readonly progress?: ProgressAnalysis
}
export const PROGRESS_PROMPT_VERSION = 'progress-v2'
export type ProgressVerdict = 'better' | 'same' | 'worse'
/** Цитаты — дословные фрагменты ответов; пустая строка, если подходящей цитаты нет. Проценты модель не считает. */
export interface ProgressImprovement { readonly area: string; readonly before: string; readonly now: string; readonly explanation: string }
export interface ProgressAnalysis {
  readonly promptVersion: string
  readonly model: string
  readonly createdAt: string
  /** Первое прохождение закреплено как точка отсчёта; серединное есть с третьей попытки. */
  readonly firstId: string
  readonly middleId: string | null
  readonly summary: string
  readonly professionalism: { readonly verdict: ProgressVerdict; readonly explanation: string; readonly before: string; readonly now: string }
  /** Как менялись ответы через серединную попытку; пусто, если её нет. */
  readonly trajectory: string
  readonly improvements: readonly ProgressImprovement[]
  readonly attention: readonly { readonly area: string; readonly explanation: string }[]
  readonly nextFocus: string
}
export interface DynamicAttempt {
  readonly id: string; readonly method: string; readonly promptVersion: string; readonly model: string
  readonly bankVersion?: string
  /** Absent in legacy attempts: keep omitting reasoning rather than applying a new server default. */
  readonly reasoningEffort?: ReasoningEffort | null
  readonly jobRole: string; readonly createdAt: string; readonly completedAt: string | null
  readonly status: 'choices' | 'open' | 'ready' | 'completed'
  readonly choices: readonly ChoiceQuestion[]
  readonly choiceAnswers: Readonly<Record<string, string>>
  readonly openQuestions: readonly OpenQuestion[]
  readonly openAnswers: Readonly<Record<string, string>>
  readonly evaluation: DynamicEvaluation | null
}

export function choicePreference(attempt: DynamicAttempt): Record<TraitId, number> {
  const points = Object.fromEntries(TRAIT_IDS.map((id) => [id, 0])) as Record<TraitId, number>
  const maximum = { ...points }
  for (const question of attempt.choices) {
    maximum[question.primaryTrait] += Math.max(...question.options.map((option) => option.primary))
    maximum[question.secondaryTrait] += Math.max(...question.options.map((option) => option.secondary))
    const answer = question.options.find((option) => option.id === attempt.choiceAnswers[question.id])
    if (answer) {
      points[question.primaryTrait] += answer.primary
      points[question.secondaryTrait] += answer.secondary
    }
  }
  return Object.fromEntries(TRAIT_IDS.map((id) => [id, maximum[id] ? Math.round(100 * points[id] / maximum[id]) : 0])) as Record<TraitId, number>
}

/** Профессиональное свидетельство имеет больший вес; разные качества растут независимо. */
export function finalPercent(preference: number, professional: number): number {
  return Math.round(0.2 * preference + 0.8 * professional)
}

/** Ten structured choices and five written answers contribute in proportion to their count. */
export function combinedTraitPercent(choice: number, writtenBehavior: number): number {
  return Math.round((2 * choice + writtenBehavior) / 3)
}

/** Six anchored 0–4 rubric levels; dangerous decisions cap every professional score at 25%. */
export function professionalPercent(criteria: Readonly<Record<CriterionId, CriterionEvaluation>>, trait: TraitId, unsafe: boolean): number {
  const ids = TRAIT_CRITERIA[trait]
  const percent = Math.round(100 * ids.reduce((sum, id) => sum + criteria[id].level, 0) / (4 * ids.length))
  return unsafe ? Math.min(25, percent) : percent
}

export function comparableDynamic(left: DynamicAttempt, right: DynamicAttempt): boolean {
  return !!left.evaluation && !!right.evaluation && left.method === right.method && left.evaluation.rubricVersion === right.evaluation.rubricVersion
    && (left.bankVersion ?? null) === (right.bankVersion ?? null)
    && left.evaluation.model === right.evaluation.model
    && (left.evaluation.reasoningEffort ?? null) === (right.evaluation.reasoningEffort ?? null)
    && (left.reasoningEffort ?? null) === (right.reasoningEffort ?? null)
    && left.evaluation.promptVersion === right.evaluation.promptVersion
    && left.promptVersion === right.promptVersion && left.model === right.model
    && left.status === 'completed' && right.status === 'completed'
}

/** Для цикла «до и после» достаточно той же методики и рубрики: модель и банк вопросов могут обновляться между прохождениями. */
export function progressComparable(left: DynamicAttempt, right: DynamicAttempt): boolean {
  return left.status === 'completed' && right.status === 'completed' && !!left.evaluation && !!right.evaluation
    && left.method === right.method && left.evaluation.rubricVersion === right.evaluation.rubricVersion
}

export interface ProgressAnchors {
  /** Первое прохождение — закреплённая точка отсчёта; null, пока попытка одна. */
  readonly first: DynamicAttempt | null
  /** Серединное прохождение: при 7 попытках — 4-е. Есть с третьей попытки. */
  readonly middle: DynamicAttempt | null
  /** Сколько сопоставимых прохождений до текущего включительно. */
  readonly count: number
}

/**
 * Опорные точки для попытки: история — завершённые попытки по возрастанию даты. Учитываются только прохождения
 * до текущего включительно, поэтому у старой попытки прогресс такой же, каким был в день её оценки.
 */
export function progressAnchors(attempt: DynamicAttempt, history: readonly DynamicAttempt[]): ProgressAnchors {
  const series = history.filter((item) => item.id !== attempt.id && progressComparable(item, attempt))
  const position = history.findIndex((item) => item.id === attempt.id)
  const before = position < 0 ? series : series.filter((item) => history.indexOf(item) < position)
  const all = [...before, attempt]
  const count = all.length
  return { first: count >= 2 ? all[0]! : null, middle: count >= 3 ? all[Math.floor((count - 1) / 2)]! : null, count }
}
