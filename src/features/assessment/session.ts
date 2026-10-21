import type {
  AssessmentResult, BuildRecommendations, CalculateProfile, DataVersions, Draft, LoadDraftResult, OptionId, Question, QuestionId, ScoringRule,
} from '../../domain/types'
import { createDraftStorage } from '../../storage/draft'
import { createAttemptStorage, HISTORY_LIMIT, isAssessmentSnapshot, sameAssessmentSnapshot } from '../../storage/attempts'
import { browserStorage, clearAppData, isKnownAnswers, sameVersions } from '../../storage/shared'
import type { StorageProvider } from '../../storage/shared'

import { msg } from '../../i18n/translate'
/** C подключает каталог и чистый расчёт; A не заменяет их демонстрационными числами. */
export interface AssessmentModule {
  readonly questions: readonly Question[]
  readonly scoring: readonly ScoringRule[]
  readonly versions: DataVersions
  readonly calculateProfile: CalculateProfile
  readonly buildRecommendations?: BuildRecommendations
}

export interface AssessmentSnapshot {
  readonly phase: 'answering' | 'review' | 'completed'
  readonly draft: Draft
  readonly result: AssessmentResult | null
  readonly recovery: 'invalid' | 'incompatible' | null
  readonly storageUnavailable: boolean
  readonly lastSavedAt: string | null
  readonly error: string | null
  readonly initialLoad: LoadDraftResult['status']
  readonly attempts: readonly AssessmentResult[]
  readonly historyNotice: string | null
}

export interface AssessmentSession {
  readonly module: AssessmentModule
  readonly getSnapshot: () => AssessmentSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly selectOption: (optionId: OptionId) => void
  readonly next: () => void
  readonly back: () => void
  readonly editQuestion: (questionId: QuestionId) => void
  readonly finish: () => AssessmentResult | null
  readonly openAttempt: (attemptId: string) => boolean
  readonly editCompletedAttempt: (attemptId: string) => boolean
  /** Вызывать только после подтверждения в UI; результат старой попытки не мутируется. */
  readonly startOver: () => void
  readonly deleteMyData: () => void
}

export function isAssessmentModuleReady(module: AssessmentModule | null): module is AssessmentModule {
  return !!module && module.questions.length === 15
    && new Set(module.questions.map((question) => question.id)).size === 15
    && module.questions.every((question) => question.id.length > 0 && question.options.length === 4
      && new Set(question.options.map((option) => option.id)).size === 4)
}

interface SessionOptions {
  readonly module: AssessmentModule
  readonly getStorage?: StorageProvider
  readonly now?: () => string
  readonly newAttemptId?: () => string
  readonly initialAttempts?: readonly AssessmentResult[]
}

/** Синхронные действия сохраняются до следующего рендера/закрытия вкладки. */
export function createAssessmentSession({
  module, getStorage = browserStorage, now = () => new Date().toISOString(), newAttemptId = () => crypto.randomUUID(), initialAttempts = [],
}: SessionOptions): AssessmentSession {
  if (!isAssessmentModuleReady(module)) throw new Error('Нужны 15 вопросов с четырьмя вариантами')
  const firstQuestion = module.questions[0]
  if (!firstQuestion) throw new Error('Нет первого вопроса')
  const drafts = createDraftStorage({ questions: module.questions, versions: module.versions, getStorage })
  const loaded = drafts.loadDraft()
  const history = createAttemptStorage(getStorage)
  const loadedHistory = history.loadAttempts()
  let historyNotice: string | null = loadedHistory.status !== 'loaded' && loadedHistory.status !== 'empty'
    ? msg('Историю не удалось прочитать. Новая попытка может остаться только в памяти; сохранённые данные не изменены.') : null
  function verifyAttempt(attempt: AssessmentResult): AssessmentResult | null {
    if (!sameVersions(attempt.versions, module.versions) || !isKnownAnswers(attempt.answers, module.questions, true)) return null
    try {
      const calculated = module.calculateProfile({ ...attempt.answers }, { questions: module.questions,
        scoring: module.scoring, versions: { ...module.versions }, attemptId: attempt.attemptId, completedAt: attempt.completedAt })
      return calculated.ok && isAssessmentSnapshot(calculated.result) && sameAssessmentSnapshot(attempt, calculated.result)
        ? structuredClone(calculated.result) : null
    } catch { return null }
  }
  const storedAttempts = loadedHistory.status === 'loaded' ? loadedHistory.attempts : []
  const combined = [...initialAttempts, ...storedAttempts.filter((attempt) => !initialAttempts.some((saved) => saved.attemptId === attempt.attemptId))]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, HISTORY_LIMIT)
  const attempts = combined.filter((attempt) => {
    if (!sameVersions(attempt.versions, module.versions)) return true
    if (verifyAttempt(attempt)) return true
    historyNotice = msg('Часть истории не соответствует ответам или текущим правилам и не будет показана. Данные не перезаписаны.')
    return false
  })
  const latest = attempts.find((attempt) => sameVersions(attempt.versions, module.versions)) ?? null
  const restoredResult = loaded.status === 'empty' || (loaded.status === 'loaded' && Object.keys(loaded.draft.answers).length === 0) ? latest : null
  const emptyDraft = (): Draft => ({
    versions: { ...module.versions }, answers: {}, currentQuestionId: firstQuestion.id, updatedAt: now(),
  })
  let snapshot: AssessmentSnapshot = {
    phase: restoredResult ? 'completed' : 'answering', draft: loaded.status === 'loaded' ? loaded.draft : emptyDraft(), result: restoredResult,
    recovery: loaded.status === 'invalid' || loaded.status === 'incompatible' ? loaded.status : null,
    storageUnavailable: loaded.status === 'unavailable' || loadedHistory.status === 'unavailable',
    lastSavedAt: loaded.status === 'loaded' ? loaded.draft.updatedAt : null,
    error: null, initialLoad: loaded.status, attempts, historyNotice,
  }
  let pendingAttemptId: string | null = null
  const listeners = new Set<() => void>()
  const emit = (next: AssessmentSnapshot) => { snapshot = next; for (const listener of listeners) listener() }
  const currentIndex = () => module.questions.findIndex((question) => question.id === snapshot.draft.currentQuestionId)
  const currentQuestion = () => module.questions[currentIndex()]
  function save(draft: Draft, phase: AssessmentSnapshot['phase'] = 'answering') {
    const saved = drafts.saveDraft(draft)
    emit({ ...snapshot, draft, phase, result: null, error: null,
      storageUnavailable: !saved.ok, lastSavedAt: saved.ok ? draft.updatedAt : snapshot.lastSavedAt })
  }
  function reset(deleteAll: boolean) {
    const removed = deleteAll ? clearAppData(getStorage) : drafts.clearDraft()
    pendingAttemptId = null
    emit({ ...snapshot, phase: 'answering', draft: emptyDraft(), result: null, recovery: null,
      error: null, lastSavedAt: null, storageUnavailable: !removed.ok, initialLoad: 'empty',
      attempts: deleteAll ? [] : snapshot.attempts, historyNotice: deleteAll ? null : snapshot.historyNotice })
  }
  const canChange = () => snapshot.recovery === null && snapshot.phase !== 'completed'

  return {
    module,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    selectOption(optionId) {
      const question = currentQuestion()
      if (!canChange() || snapshot.phase !== 'answering' || !question?.options.some((option) => option.id === optionId)) return
      save({ ...snapshot.draft, updatedAt: now(), answers: { ...snapshot.draft.answers, [question.id]: optionId } })
    },
    next() {
      const question = currentQuestion()
      if (!canChange() || snapshot.phase !== 'answering' || !question || !snapshot.draft.answers[question.id]) return
      const nextQuestion = module.questions[currentIndex() + 1]
      if (nextQuestion) save({ ...snapshot.draft, currentQuestionId: nextQuestion.id, updatedAt: now() })
      else if (isKnownAnswers(snapshot.draft.answers, module.questions, true)) save({ ...snapshot.draft, updatedAt: now() }, 'review')
    },
    back() {
      if (!canChange()) return
      if (snapshot.phase === 'review') { save({ ...snapshot.draft, updatedAt: now() }); return }
      const previous = module.questions[currentIndex() - 1]
      if (previous) save({ ...snapshot.draft, currentQuestionId: previous.id, updatedAt: now() })
    },
    editQuestion(questionId) {
      if (!canChange() || !module.questions.some((question) => question.id === questionId)) return
      save({ ...snapshot.draft, currentQuestionId: questionId, updatedAt: now() })
    },
    finish() {
      if (snapshot.phase === 'completed') return snapshot.result
      if (snapshot.recovery || snapshot.phase !== 'review' || !isKnownAnswers(snapshot.draft.answers, module.questions, true)) return null
      try {
        pendingAttemptId ??= newAttemptId()
        const completedAt = now()
        const calculated = module.calculateProfile({ ...snapshot.draft.answers }, {
          questions: module.questions, scoring: module.scoring, versions: { ...module.versions },
          attemptId: pendingAttemptId, completedAt,
        })
        if (!calculated.ok) { emit({ ...snapshot, error: calculated.error.message }); return null }
        const result = structuredClone(calculated.result)
        const matches = isAssessmentSnapshot(result) && result.attemptId === pendingAttemptId && result.completedAt === completedAt
          && sameVersions(result.versions, module.versions)
          && isKnownAnswers(result.answers, module.questions, true)
          && Object.entries(snapshot.draft.answers).every(([id, answer]) => result.answers[id] === answer)
        if (!matches) { emit({ ...snapshot, error: msg('Результат не соответствует ответам. Попробуйте ещё раз.') }); return null }
        const saved = history.appendAttempt(result)
        if (!saved.ok && saved.reason === 'conflict') {
          pendingAttemptId = null
          emit({ ...snapshot, error: msg('Совпал идентификатор попытки. Предыдущий результат сохранён; повторите отправку.') })
          return null
        }
        // Если история не записалась, оставляем полный черновик как резерв для reload.
        const cleared = saved.ok ? drafts.clearDraft() : { ok: true }
        emit({ ...snapshot, phase: 'completed', result, error: null, lastSavedAt: null,
          attempts: [result, ...snapshot.attempts.filter((attempt) => attempt.attemptId !== result.attemptId)].slice(0, HISTORY_LIMIT),
          historyNotice: saved.ok ? null : msg('Не удалось сохранить завершённую попытку. Профиль доступен в памяти; полный черновик оставлен для восстановления.'),
          storageUnavailable: !saved.ok || !cleared.ok || snapshot.storageUnavailable })
        return result
      } catch {
        emit({ ...snapshot, error: msg('Не удалось рассчитать профиль. Ответы сохранены в текущей сессии; попробуйте ещё раз.') })
        return null
      }
    },
    openAttempt(attemptId) {
      const attempt = snapshot.attempts.find((item) => item.attemptId === attemptId)
      const result = attempt ? verifyAttempt(attempt) : null
      if (!result) return false
      emit({ ...snapshot, result })
      return true
    },
    editCompletedAttempt(attemptId) {
      const attempt = snapshot.attempts.find((item) => item.attemptId === attemptId)
      const result = attempt ? verifyAttempt(attempt) : null
      if (!result) return false
      pendingAttemptId = null
      snapshot = { ...snapshot, recovery: null }
      save({ versions: { ...module.versions }, answers: { ...result.answers }, currentQuestionId: firstQuestion.id, updatedAt: now() })
      return true
    },
    startOver: () => reset(false),
    deleteMyData: () => reset(true),
  }
}
