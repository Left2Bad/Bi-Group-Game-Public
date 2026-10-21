import { describe, expect, it } from 'vitest'
import { demoResult } from '../../tests/fixtures/contract-demo'
import { compareAttempts, createAttemptStorage, HISTORY_LIMIT } from './attempts'
import { STORAGE_KEYS } from './shared'
import { memoryStorage } from './test-storage'

function setup() {
  const storage = memoryStorage()
  return { storage, ...createAttemptStorage(() => storage) }
}

describe('история попыток M11', () => {
  it('сохраняет снимок и не дублирует повторный submit', () => {
    const store = setup()
    expect(store.loadAttempts()).toEqual({ status: 'empty' })
    expect(store.appendAttempt(demoResult).ok).toBe(true)
    expect(store.appendAttempt(structuredClone(demoResult)).ok).toBe(true)
    const loaded = store.loadAttempts()
    expect(loaded).toEqual({ status: 'loaded', attempts: [demoResult] })
    if (loaded.status === 'loaded') Reflect.deleteProperty(loaded.attempts[0]?.answers ?? {}, 'Q01')
    expect(store.loadAttempts()).toEqual({ status: 'loaded', attempts: [demoResult] })
  })

  it('отвергает запись изменённого результата под старым ID', () => {
    const store = setup()
    store.appendAttempt(demoResult)
    expect(store.appendAttempt({ ...demoResult, completedAt: '2026-10-17T00:00:00.000Z' })).toEqual({ ok: false, reason: 'conflict' })
    expect(store.loadAttempts()).toEqual({ status: 'loaded', attempts: [demoResult] })
  })

  it('оставляет последние 10 попыток, не меняя старую после новой', () => {
    const store = setup()
    for (let index = 0; index < HISTORY_LIMIT + 2; index++) store.appendAttempt({ ...demoResult, attemptId: `attempt-${index}` })
    const loaded = store.loadAttempts()
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') return
    expect(loaded.attempts).toHaveLength(10)
    expect(loaded.attempts.map((attempt) => attempt.attemptId)).toEqual(Array.from({ length: 10 }, (_, index) => `attempt-${11 - index}`))
    expect(demoResult.attemptId).toBe('contract-demo-attempt-A')
  })

  it.each(['{broken', 'null', '{}', JSON.stringify({ schema: 1, attempts: [{ ...demoResult, answers: {} }] }),
    JSON.stringify({ schema: 1, attempts: [{ ...demoResult, traits: {} }] }),
    JSON.stringify({ schema: 1, attempts: [{ ...demoResult, completedAt: 'bad' }] }),
    JSON.stringify({ schema: 1, attempts: [demoResult, demoResult] }),
    ' '.repeat(524289),
  ])('сохраняет повреждённую историю без молчаливой перезаписи %#', (raw) => {
    const store = setup()
    store.storage.setItem(STORAGE_KEYS.attempts, raw)
    expect(store.loadAttempts()).toEqual({ status: 'invalid' })
    expect(store.appendAttempt(demoResult)).toEqual({ ok: false, reason: 'invalid' })
    expect(store.storage.getItem(STORAGE_KEYS.attempts)).toBe(raw)
  })

  it('не перезаписывает неизвестную схему истории', () => {
    const store = setup()
    store.storage.setItem(STORAGE_KEYS.attempts, JSON.stringify({ schema: 2, attempts: [] }))
    expect(store.loadAttempts()).toEqual({ status: 'incompatible' })
    expect(store.appendAttempt(demoResult)).toEqual({ ok: false, reason: 'incompatible' })
  })

  it('возвращает статус при запрете чтения и переполнении записи', () => {
    expect(createAttemptStorage(() => { throw new Error('blocked') }).loadAttempts()).toEqual({ status: 'unavailable' })
    const store = createAttemptStorage(() => ({ ...memoryStorage(), setItem() { throw new Error('full') } }))
    expect(store.appendAttempt(demoResult)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('сравнивает разные совместимые попытки в процентных пунктах', () => {
    const after = { ...demoResult, attemptId: 'next', traits: {
      ...demoResult.traits, engagement: { ...demoResult.traits.engagement, percent: 78 },
    } }
    expect(compareAttempts(demoResult, after)).toEqual({ ok: true, delta: {
      criticalThinking: 0, confidence: 0, discipline: 0, engagement: 34,
    } })
    expect(compareAttempts(demoResult, demoResult)).toEqual({ ok: false, reason: 'same-attempt' })
  })

  it.each(['schema', 'assessment', 'scoring', 'recommendations'] as const)('блокирует сравнение несовместимой версии %s', (field) => {
    const changed = { ...demoResult, attemptId: 'next', versions: { ...demoResult.versions, [field]: field === 'schema' ? 2 : 'changed' } }
    expect(compareAttempts(demoResult, changed)).toEqual({ ok: false, reason: 'incompatible' })
  })
})
