import type { AssessmentModule } from '../features/assessment/session'
import { questions, scoring } from '../content/questions'
import { calculateProfile } from '../domain/score'
import { buildRecommendations } from '../domain/recommend'
import { DATA_VERSIONS } from '../domain/types'

/** Реальные данные/чистые функции C; runtime не зависит от тестовых fixtures. */
export const assessmentModule: AssessmentModule = {
  questions, scoring, versions: DATA_VERSIONS, calculateProfile, buildRecommendations,
}
