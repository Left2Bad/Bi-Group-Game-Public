/**
 * Только синтетический fixture контракта для UI-тестов, не содержание C и не результат пользователя.
 * Правила заданы только по основному качеству: формулу v2 с двумя качествами проверяют тесты C.
 */
import type {
  Answers, AssessmentResult, DataVersions, DevelopmentPlan, Draft, Evidence,
  Points, Question, ScoringRule, TraitId, TraitLevel, TraitResult,
} from '../../src/domain/types'

export const DEMO_VERSIONS = {
  schema: 1, assessment: 'contract-demo-v1', scoring: 'contract-demo-v1', recommendations: 'contract-demo-v1',
} as const satisfies DataVersions

const questionTraits: readonly TraitId[] = [
  'criticalThinking', 'criticalThinking', 'criticalThinking', 'criticalThinking',
  'confidence', 'confidence', 'confidence', 'confidence',
  'discipline', 'discipline', 'discipline', 'discipline',
  'engagement', 'engagement', 'engagement',
]

const secondaryOf: Readonly<Record<TraitId, TraitId>> = {
  criticalThinking: 'discipline', confidence: 'engagement', discipline: 'criticalThinking', engagement: 'confidence',
}

export const demoQuestions: readonly Question[] = questionTraits.map((trait, index) => {
  const id = `Q${String(index + 1).padStart(2, '0')}`
  return {
    id, trait, secondaryTrait: secondaryOf[trait],
    context: 'Синтетический пример для разработки интерфейса',
    text: `Демонстрационная ситуация ${index + 1}. Выберите один из четырёх вариантов.`,
    options: [
      { id: `${id}-A`, text: 'Демонстрационный вариант A' },
      { id: `${id}-B`, text: 'Демонстрационный вариант B' },
      { id: `${id}-C`, text: 'Демонстрационный вариант C' },
      { id: `${id}-D`, text: 'Демонстрационный вариант D' },
    ],
  }
})

export const demoScoring: readonly ScoringRule[] = demoQuestions.flatMap((question, index) =>
  question.options.map((option, optionIndex) => ({
    questionId: question.id, optionId: option.id, trait: question.trait,
    points: ((optionIndex + index) % 4) as Points,
    reason: 'Синтетическое объяснение; участник C подготовит содержательные обоснования.',
    developmentTag: `demo-${question.trait}`,
  })),
)

// Вручную заданные баллы: 10/12, 8/12, 11/12, 4/9. Это не функция расчёта.
const selectedPoints: readonly Points[] = [3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 0, 1, 3]
export const demoAnswers: Answers = Object.fromEntries(demoQuestions.map((question, index) => {
  const rule = demoScoring.find((item) => item.questionId === question.id && item.points === selectedPoints[index])
  if (!rule) throw new Error(`Ошибка fixture: ${question.id}`)
  return [question.id, rule.optionId]
}))

const expected: Record<TraitId, readonly [number, number, number, TraitLevel]> = {
  criticalThinking: [10, 12, 83, 'strength'],
  confidence: [8, 12, 67, 'developing'],
  discipline: [11, 12, 92, 'strength'],
  engagement: [4, 9, 44, 'priority'],
}

function demoTrait(trait: TraitId): TraitResult {
  const [points, maxPoints, percent, level] = expected[trait]
  const evidence: Evidence[] = demoQuestions.filter((q) => q.trait === trait).map((question) => {
    const rule = demoScoring.find((item) => item.questionId === question.id && item.optionId === demoAnswers[question.id])
    if (!rule) throw new Error(`Ошибка свидетельства: ${question.id}`)
    return { ...rule }
  })
  return { trait, points, maxPoints, percent, level, evidence }
}

const traits = {
  criticalThinking: demoTrait('criticalThinking'),
  confidence: demoTrait('confidence'),
  discipline: demoTrait('discipline'),
  engagement: demoTrait('engagement'),
} satisfies Record<TraitId, TraitResult>

export const demoResult: AssessmentResult = {
  attemptId: 'contract-demo-attempt-A', completedAt: '2026-10-16T07:00:00.000Z',
  versions: DEMO_VERSIONS, answers: demoAnswers, traits,
}

export const demoDraft: Draft = {
  versions: DEMO_VERSIONS,
  answers: Object.fromEntries(Object.entries(demoAnswers).slice(0, 6)),
  currentQuestionId: 'Q07', updatedAt: '2026-10-16T06:55:00.000Z',
}

export const demoDevelopmentPlan: DevelopmentPlan = {
  priorityTraits: ['engagement', 'confidence'],
  recommendations: [{
    id: 'contract-demo-action', trait: 'engagement', kind: 'development',
    reason: 'Синтетический пример связи с выбранным ответом Q13.',
    action: 'Обсудите с коллегой один способ совместного решения рабочей задачи.',
    practice: 'Демонстрационная активность, не официальный курс BI.',
    durationDays: 7, successCriterion: 'Зафиксированы ответственный, срок и результат.',
    questionIds: ['Q13'], developmentTag: 'demo-engagement',
  }],
}
