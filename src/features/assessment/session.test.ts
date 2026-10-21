import { describe, expect, it, vi } from 'vitest'
import { demoAnswers, demoDraft, demoQuestions, DEMO_VERSIONS } from '../../../tests/fixtures/contract-demo'
import { STORAGE_KEYS } from '../../storage/shared'
import { createAttemptStorage } from '../../storage/attempts'
import { memoryStorage } from '../../storage/test-storage'
import { createAssessmentSession } from './session'
import type { AssessmentSession } from './session'
import { createTestModule } from './test-module'

const now = () => '2026-10-16T08:00:00.000Z'
function setup() {
  const storage = memoryStorage()
  const calculateProfile = vi.fn(createTestModule().calculateProfile)
  const module = createTestModule({ calculateProfile })
  const session = createAssessmentSession({ module, getStorage: () => storage, now, newAttemptId: () => 'attempt-test' })
  return { storage, calculateProfile, module, session }
}
function answerAll(session: AssessmentSession) {
  for (const question of session.module.questions) {
    const answer = demoAnswers[question.id]
    if (!answer) throw new Error('Fixture missing answer')
    session.selectOption(answer)
    session.next()
  }
}

describe('состояние прохождения A — M09', () => {
  it('не пропускает неотвеченный вопрос и не рассчитывает неполный профиль', () => {
    const { session, calculateProfile } = setup()
    session.next()
    session.selectOption('Q02-A')
    expect(session.getSnapshot().draft.currentQuestionId).toBe('Q01')
    expect(session.getSnapshot().draft.answers).toEqual({})
    expect(session.finish()).toBeNull()
    expect(calculateProfile).not.toHaveBeenCalled()
  })

  it('заменяет выбор, сохраняет его при возврате и уведомляет подписчика', () => {
    const { session } = setup()
    const changed = vi.fn()
    const unsubscribe = session.subscribe(changed)
    session.selectOption('Q01-A'); session.next(); session.back(); session.selectOption('Q01-C')
    expect(session.getSnapshot().draft.answers).toEqual({ Q01: 'Q01-C' })
    expect(changed).toHaveBeenCalledTimes(4)
    unsubscribe()
    session.next()
    expect(changed).toHaveBeenCalledTimes(4)
  })

  it('восстанавливается на седьмом вопросе из нового экземпляра сессии', () => {
    const { session, storage, module } = setup()
    for (const question of demoQuestions.slice(0, 6)) {
      session.selectOption(question.options[0].id); session.next()
    }
    const resumed = createAssessmentSession({ module, getStorage: () => storage, now })
    expect(resumed.getSnapshot().initialLoad).toBe('loaded')
    expect(resumed.getSnapshot().draft).toEqual(session.getSnapshot().draft)
    expect(resumed.getSnapshot().draft.currentQuestionId).toBe('Q07')
  })

  it('позволяет просмотреть/исправить ответы и завершить расчёт только один раз', () => {
    const { session, calculateProfile, storage } = setup()
    answerAll(session)
    expect(session.getSnapshot().phase).toBe('review')
    session.editQuestion('Q15')
    session.selectOption('Q15-A'); session.next()
    const result = session.finish()
    expect(result?.answers.Q15).toBe('Q15-A')
    expect(calculateProfile).toHaveBeenCalledTimes(1)
    expect(calculateProfile.mock.calls[0]?.[1].attemptId).toBe('attempt-test')
    expect(session.finish()).toBe(result)
    expect(calculateProfile).toHaveBeenCalledTimes(1)
    expect(storage.getItem(STORAGE_KEYS.draft)).toBeNull()
    expect(session.getSnapshot().phase).toBe('completed')
  })

  it.each(['error', 'throw', 'mismatch'] as const)('сохраняет ответы при ошибке вычислителя: %s', (mode) => {
    const normal = createTestModule()
    const module = createTestModule({ calculateProfile: (answers, context) => {
      if (mode === 'throw') throw new Error('calculator unavailable')
      if (mode === 'error') return { ok: false, error: { code: 'invalid-content', message: 'Правила недоступны', issues: [] } }
      const result = normal.calculateProfile(answers, context)
      if (!result.ok) return result
      return { ok: true, result: { ...result.result, attemptId: 'wrong-attempt' } }
    } })
    const storage = memoryStorage()
    const session = createAssessmentSession({ module, getStorage: () => storage, now })
    answerAll(session)
    expect(session.finish()).toBeNull()
    expect(session.getSnapshot().phase).toBe('review')
    expect(session.getSnapshot().result).toBeNull()
    expect(session.getSnapshot().error).toBeTruthy()
    expect(storage.getItem(STORAGE_KEYS.draft)).not.toBeNull()
  })
})

describe('сохранённые попытки и повторное прохождение', () => {
  it('восстанавливает завершённый результат из истории и проверяет его вычислителем', () => {
    const { session, module, storage } = setup()
    answerAll(session)
    const first = session.finish()
    expect(first).not.toBeNull()
    const reloaded = createAssessmentSession({ module, getStorage: () => storage, now })
    expect(reloaded.getSnapshot().result).toEqual(first)
    expect(reloaded.getSnapshot().phase).toBe('completed')
    expect(reloaded.getSnapshot().attempts).toHaveLength(1)
  })

  it('редактирует копию ответов и создаёт новый снимок, сохраняя старый', () => {
    const { module, storage } = setup()
    const newAttemptId = vi.fn().mockReturnValueOnce('first').mockReturnValueOnce('second')
    const session = createAssessmentSession({ module, getStorage: () => storage, now, newAttemptId })
    answerAll(session)
    const original = structuredClone(session.finish())
    expect(session.editCompletedAttempt('first')).toBe(true)
    session.selectOption('Q01-A')
    session.editQuestion('Q15'); session.next()
    const second = session.finish()
    expect(second?.attemptId).toBe('second')
    expect(session.getSnapshot().attempts).toHaveLength(2)
    expect(session.getSnapshot().attempts[1]).toEqual(original)
    const loaded = createAttemptStorage(() => storage).loadAttempts()
    expect(loaded.status === 'loaded' && loaded.attempts[1]).toEqual(original)
  })

  it('не публикует подменённые сохранённые проценты', () => {
    const { session, module, storage } = setup()
    answerAll(session); session.finish()
    const raw = JSON.parse(storage.getItem(STORAGE_KEYS.attempts) ?? '{}')
    raw.attempts[0].traits.engagement.percent = 99
    storage.setItem(STORAGE_KEYS.attempts, JSON.stringify(raw))
    const reloaded = createAssessmentSession({ module, getStorage: () => storage, now })
    expect(reloaded.getSnapshot().result).toBeNull()
    expect(reloaded.getSnapshot().attempts).toHaveLength(0)
    expect(reloaded.getSnapshot().historyNotice).toContain('не соответствует')
  })

  it('не открывает и не редактирует попытку несовместимой версии', () => {
    const { session, module, storage } = setup()
    answerAll(session)
    const result = session.finish()
    if (!result) throw new Error('Test attempt missing')
    storage.removeItem(STORAGE_KEYS.attempts)
    createAttemptStorage(() => storage).appendAttempt({ ...result, versions: { ...result.versions, scoring: 'old' } })
    const reloaded = createAssessmentSession({ module, getStorage: () => storage, now })
    expect(reloaded.getSnapshot().result).toBeNull()
    expect(reloaded.openAttempt(result.attemptId)).toBe(false)
    expect(reloaded.editCompletedAttempt(result.attemptId)).toBe(false)
  })

  it('оставляет полный черновик при отказе записи истории', () => {
    const { module, storage } = setup()
    const session = createAssessmentSession({ module, now, getStorage: () => ({ ...storage, setItem(key, value) {
      if (key === STORAGE_KEYS.attempts) throw new Error('quota')
      storage.setItem(key, value)
    } }) })
    answerAll(session)
    expect(session.finish()).not.toBeNull()
    expect(session.getSnapshot().historyNotice).toContain('Не удалось сохранить')
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.draft) ?? '{}').answers).toEqual(demoAnswers)
  })

  it('просмотр старого результата не перезаписывает активный черновик', () => {
    const { session, storage } = setup()
    answerAll(session); session.finish()
    session.startOver(); session.selectOption('Q01-C'); session.next()
    const draftBefore = storage.getItem(STORAGE_KEYS.draft)
    expect(session.openAttempt('attempt-test')).toBe(true)
    expect(session.getSnapshot().draft.currentQuestionId).toBe('Q02')
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe(draftBefore)
  })
})

describe('восстановление и работа в памяти', () => {
  it.each(['invalid', 'incompatible'] as const)('не перезаписывает %s черновик до явного сброса', (status) => {
    const storage = memoryStorage()
    const raw = status === 'invalid' ? '{broken' : JSON.stringify({ ...demoDraft, versions: { ...DEMO_VERSIONS, scoring: 'old' } })
    storage.setItem(STORAGE_KEYS.draft, raw)
    const session = createAssessmentSession({ module: createTestModule(), getStorage: () => storage, now })
    expect(session.getSnapshot().recovery).toBe(status)
    session.selectOption('Q01-A'); session.next()
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe(raw)
    session.startOver()
    session.selectOption('Q01-A')
    expect(session.getSnapshot().recovery).toBeNull()
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.draft) ?? '{}').answers).toEqual({ Q01: 'Q01-A' })
  })

  it('завершает прохождение в памяти при полностью недоступном localStorage', () => {
    const session = createAssessmentSession({ module: createTestModule(), now,
      getStorage: () => { throw new DOMException('blocked', 'SecurityError') } })
    answerAll(session)
    expect(session.getSnapshot().storageUnavailable).toBe(true)
    expect(session.finish()).not.toBeNull()
  })

  it('при quota на записи не теряет ответы в памяти', () => {
    const storage = memoryStorage()
    const session = createAssessmentSession({ module: createTestModule(), now,
      getStorage: () => ({ ...storage, setItem() { throw new DOMException('full', 'QuotaExceededError') } }) })
    session.selectOption('Q01-B'); session.next()
    expect(session.getSnapshot().draft.answers.Q01).toBe('Q01-B')
    expect(session.getSnapshot().draft.currentQuestionId).toBe('Q02')
    expect(session.getSnapshot().storageUnavailable).toBe(true)
  })

  it('сброс черновика сохраняет историю; удаление данных удаляет только ключи приложения', () => {
    const { session, storage } = setup()
    storage.setItem(STORAGE_KEYS.attempts, 'history')
    storage.setItem('other-session', 'keep')
    session.selectOption('Q01-A'); session.startOver()
    expect(storage.getItem(STORAGE_KEYS.attempts)).toBe('history')
    session.deleteMyData()
    expect(storage.getItem(STORAGE_KEYS.attempts)).toBeNull()
    expect(storage.getItem('other-session')).toBe('keep')
    expect(session.getSnapshot().draft.answers).toEqual({})
  })
})
