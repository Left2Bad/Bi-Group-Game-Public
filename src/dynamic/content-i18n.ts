/**
 * Перевод сгенерированного контента попытки: ситуаций, открытых вопросов, оценки, маршрута и анализа прогресса.
 *
 * Исходный текст всегда русский и хранится в попытке без изменений. Переводы лежат отдельно (таблица
 * content_translations) и накладываются на попытку только при показе. Ключ перевода — сама русская строка,
 * поэтому одна и та же ситуация из банка переводится один раз для всех попыток.
 *
 * Не переводятся: ответы сотрудника и дословные цитаты из них (evidence, before, now) — это слова самого человека;
 * названия навыков «other» — по ним сравниваются попытки.
 */
import { OTHER_SKILL } from './skills.ts'
import type { DynamicAttempt, DynamicEvaluation, ProgressAnalysis } from './domain.ts'

export const CONTENT_LANGS = ['kk', 'en'] as const
export type ContentLang = typeof CONTENT_LANGS[number]
export const isContentLang = (value: unknown): value is ContentLang =>
  typeof value === 'string' && (CONTENT_LANGS as readonly string[]).includes(value)

type TextMap = (text: string) => string

function mapProgress(progress: ProgressAnalysis, map: TextMap): ProgressAnalysis {
  return { ...progress, summary: map(progress.summary),
    professionalism: { ...progress.professionalism, explanation: map(progress.professionalism.explanation) },
    trajectory: map(progress.trajectory),
    improvements: progress.improvements.map((item) => ({ ...item, area: map(item.area), explanation: map(item.explanation) })),
    attention: progress.attention.map((item) => ({ area: map(item.area), explanation: map(item.explanation) })),
    nextFocus: map(progress.nextFocus) }
}

function mapEvaluation(evaluation: DynamicEvaluation, map: TextMap): DynamicEvaluation {
  const record = <T extends object>(value: Readonly<Record<string, T>>, fn: (item: T) => T) =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fn(item)]))
  return { ...evaluation,
    traits: record(evaluation.traits, (item) => ({ ...item, strength: map(item.strength), nextStep: map(item.nextStep),
      successCriterion: map(item.successCriterion) })) as DynamicEvaluation['traits'],
    ...(evaluation.criteria ? { criteria: record(evaluation.criteria, (item) => ({ ...item, explanation: map(item.explanation) })) as NonNullable<DynamicEvaluation['criteria']> } : {}),
    ...(evaluation.behavior ? { behavior: record(evaluation.behavior, (item) => ({ ...item, explanation: map(item.explanation) })) as NonNullable<DynamicEvaluation['behavior']> } : {}),
    ...(evaluation.skills ? { skills: evaluation.skills.map((skill) => ({ ...skill,
      name: skill.skillId && skill.skillId !== OTHER_SKILL ? map(skill.name) : skill.name,
      explanation: map(skill.explanation), nextStep: map(skill.nextStep), learningTopic: map(skill.learningTopic) })) } : {}),
    ...(evaluation.safetyExplanation !== undefined ? { safetyExplanation: map(evaluation.safetyExplanation) } : {}),
    ...(evaluation.roadmap ? { roadmap: evaluation.roadmap.map((week) => ({ ...week, action: map(week.action),
      successCriterion: map(week.successCriterion), support: map(week.support) })) } : {}),
    ...(evaluation.progress ? { progress: mapProgress(evaluation.progress, map) } : {}) }
}

/** Единый список переводимых полей: по нему и собираются строки для перевода, и накладывается готовый перевод. */
export function mapAttemptTexts(attempt: DynamicAttempt, map: TextMap): DynamicAttempt {
  return { ...attempt,
    choices: attempt.choices.map((question) => ({ ...question, context: map(question.context), text: map(question.text),
      options: question.options.map((option) => ({ ...option, text: map(option.text) })) })),
    openQuestions: attempt.openQuestions.map((question) => ({ ...question, text: map(question.text) })),
    evaluation: attempt.evaluation ? mapEvaluation(attempt.evaluation, map) : null }
}

/** Все уникальные непустые русские строки попытки, которые нужно перевести. */
export function attemptTexts(attempt: DynamicAttempt): string[] {
  const texts = new Set<string>()
  mapAttemptTexts(attempt, (text) => { if (typeof text === 'string' && text.trim()) texts.add(text); return text })
  return [...texts]
}

/** Накладывает готовые переводы; строки без перевода остаются русскими. */
export function localizeAttempt(attempt: DynamicAttempt, translations: ReadonlyMap<string, string> | Readonly<Record<string, string>>): DynamicAttempt {
  const get = translations instanceof Map ? (text: string) => translations.get(text)
    : (text: string) => Object.hasOwn(translations, text) ? (translations as Record<string, string>)[text] : undefined
  return mapAttemptTexts(attempt, (text) => get(text) ?? text)
}

/** Ответ сервера о состоянии перевода попытки. */
export interface TranslationStatus {
  readonly lang: ContentLang
  readonly total: number
  readonly done: number
  /** Готовые переводы: русская строка → перевод. */
  readonly texts: Readonly<Record<string, string>>
  readonly state: 'ready' | 'translating' | 'failed'
  readonly error?: string
}
