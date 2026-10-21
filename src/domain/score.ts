import { interpretLevel } from './interpret.ts'
import { TRAIT_IDS } from './types.ts'
import type { CalculateProfile, Evidence, Question, ScoringRule, TraitId, TraitResult, ValidationIssue } from './types'
import { validateAnswers } from './validate.ts'
import { msg } from '../i18n/translate.ts'

const ruleKey = (questionId: string, optionId: string, trait: TraitId) => `${questionId}:${optionId}:${trait}`
const traitsOf = (q: Question): readonly TraitId[] => [q.trait, q.secondaryTrait]

/** 15 ситуаций, основное качество 4/4/4/3, у каждой ситуации второе качество, 4 варианта, 120 правил. */
function isValidContent(questions: readonly Question[], scoring: readonly ScoringRule[]): boolean {
  if (questions.length !== 15 || new Set(questions.map((q) => q.id)).size !== 15) return false
  if (!TRAIT_IDS.every((trait, i) => questions.filter((q) => q.trait === trait).length === (i === 3 ? 3 : 4))) return false
  if (!questions.every((q) => TRAIT_IDS.includes(q.secondaryTrait) && q.secondaryTrait !== q.trait
    && q.options.length === 4 && new Set(q.options.map((o) => o.id)).size === 4)) return false
  if (scoring.length !== questions.length * 4 * 2) return false
  const keys = new Set<string>()
  for (const rule of scoring) {
    const q = questions.find((item) => item.id === rule.questionId)
    const key = ruleKey(rule.questionId, rule.optionId, rule.trait)
    if (!q || !q.options.some((o) => o.id === rule.optionId) || !traitsOf(q).includes(rule.trait) || keys.has(key)
      || !Number.isInteger(rule.points) || rule.points < 0 || rule.points > 3
      || !rule.reason.trim() || !rule.developmentTag.trim()) return false
    keys.add(key)
  }
  return questions.every((q) => q.options.every((o) => traitsOf(q).every((trait) => keys.has(ruleKey(q.id, o.id, trait)))))
}

export const calculateProfile: CalculateProfile = (answers, context) => {
  const { questions, scoring } = context
  if (!isValidContent(questions, scoring)) {
    return { ok: false, error: { code: 'invalid-content', message: msg('Каталог вопросов или оценок неполон.'), issues: [] } }
  }
  const validation = validateAnswers(answers, questions)
  if (!validation.ok) return { ok: false, error: { code: 'invalid-answers', message: msg('Ответьте на все 15 вопросов.'), issues: validation.issues } }
  const ruleByKey = new Map<string, ScoringRule>(scoring.map((r) => [ruleKey(r.questionId, r.optionId, r.trait), r]))
  const traits = {} as Record<TraitId, TraitResult>
  for (const trait of TRAIT_IDS) {
    const relevant = questions.filter((q) => traitsOf(q).includes(trait))
    const evidence: Evidence[] = relevant.map((q) => ({ ...ruleByKey.get(ruleKey(q.id, validation.answers[q.id]!, trait))! }))
    const points = evidence.reduce((sum, item) => sum + item.points, 0)
    const maxPoints = relevant.length * 3
    traits[trait] = { trait, points, maxPoints, percent: Math.round(100 * points / maxPoints),
      level: interpretLevel(points / maxPoints), evidence }
  }
  return { ok: true, result: { attemptId: context.attemptId, completedAt: context.completedAt,
    versions: { ...context.versions }, answers: { ...validation.answers }, traits } }
}

export type { ValidationIssue }
