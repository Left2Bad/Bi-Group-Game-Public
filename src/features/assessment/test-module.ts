import type { AssessmentModule } from './session'
import type { Answers, TraitId } from '../../domain/types'
import { DEMO_VERSIONS, demoQuestions, demoResult, demoScoring } from '../../../tests/fixtures/contract-demo'

/** Заглушка вычислителя только для тестирования оркестрации A. Формулу проверяет C. */
export function createTestModule(overrides: Partial<AssessmentModule> = {}): AssessmentModule {
  return {
    versions: DEMO_VERSIONS, questions: demoQuestions, scoring: demoScoring,
    calculateProfile: (answers, context) => {
      const selected = structuredClone(answers) as Answers
      const fixtureTrait = (trait: TraitId) => ({ ...structuredClone(demoResult.traits[trait]),
        evidence: demoResult.traits[trait].evidence.map((item) => ({ ...item, optionId: selected[item.questionId] ?? item.optionId })),
      })
      return { ok: true, result: {
        ...structuredClone(demoResult), attemptId: context.attemptId, completedAt: context.completedAt, answers: selected,
        traits: { criticalThinking: fixtureTrait('criticalThinking'), confidence: fixtureTrait('confidence'),
          discipline: fixtureTrait('discipline'), engagement: fixtureTrait('engagement') },
      } }
    },
    ...overrides,
  }
}
