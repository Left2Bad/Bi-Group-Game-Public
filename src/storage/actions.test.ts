import { describe, expect, it } from 'vitest'
import { DEMO_VERSIONS } from '../../tests/fixtures/contract-demo'
import { createActionStorage } from './actions'
import { STORAGE_KEYS } from './shared'
import { memoryStorage } from './test-storage'

function setup() {
  const storage = memoryStorage()
  const context = { attemptId: 'first', versions: DEMO_VERSIONS, recommendationIds: ['action-1', 'action-2'],
    getStorage: () => storage, now: () => '2026-10-16T09:00:00.000Z' }
  return { storage, context, ...createActionStorage(context) }
}

describe('отметки действий для B', () => {
  it('сохраняет/снимает отметку и восстанавливается из нового экземпляра', () => {
    const store = setup()
    expect(store.loadActions()).toEqual({ status: 'empty' })
    expect(store.setCompleted('action-1', true)).toEqual({ ok: true, completedIds: ['action-1'] })
    expect(createActionStorage(store.context).loadActions()).toEqual({ status: 'loaded', completedIds: ['action-1'] })
    expect(store.setCompleted('action-1', false)).toEqual({ ok: true, completedIds: [] })
  })

  it('разделяет попытки и не меняет черновик или диагностические результаты', () => {
    const store = setup()
    store.storage.setItem(STORAGE_KEYS.draft, 'draft-snapshot')
    store.storage.setItem(STORAGE_KEYS.attempts, 'assessment-snapshot')
    store.setCompleted('action-1', true)
    const second = createActionStorage({ ...store.context, attemptId: 'second' })
    expect(second.loadActions()).toEqual({ status: 'empty' })
    second.setCompleted('action-2', true)
    expect(store.loadActions()).toEqual({ status: 'loaded', completedIds: ['action-1'] })
    expect(store.storage.getItem(STORAGE_KEYS.draft)).toBe('draft-snapshot')
    expect(store.storage.getItem(STORAGE_KEYS.attempts)).toBe('assessment-snapshot')
  })

  it('запрещает неизвестную рекомендацию', () => {
    expect(setup().setCompleted('unknown', true)).toEqual({ ok: false, reason: 'invalid' })
  })

  it.each(['schema', 'assessment', 'scoring', 'recommendations'] as const)('не переносит отметки в другую версию %s', (field) => {
    const store = setup()
    store.setCompleted('action-1', true)
    const versions = { ...DEMO_VERSIONS, [field]: field === 'schema' ? 2 : 'new' }
    const changed = createActionStorage({ ...store.context, versions })
    expect(changed.loadActions()).toEqual({ status: 'incompatible' })
    expect(changed.setCompleted('action-2', true)).toEqual({ ok: false, reason: 'incompatible' })
    expect(store.loadActions()).toEqual({ status: 'loaded', completedIds: ['action-1'] })
  })

  it.each(['{broken', '[]', '{}', '{"schema":1,"records":[{}]}'])('сохраняет повреждённые данные без перезаписи %#', (raw) => {
    const store = setup()
    store.storage.setItem(STORAGE_KEYS.actions, raw)
    expect(store.loadActions()).toEqual({ status: 'invalid' })
    expect(store.setCompleted('action-1', true)).toEqual({ ok: false, reason: 'invalid' })
    expect(store.storage.getItem(STORAGE_KEYS.actions)).toBe(raw)
  })

  it('обрабатывает запрет получения storage и quota записи', () => {
    const { context } = setup()
    const denied = createActionStorage({ ...context, getStorage: () => { throw new Error('blocked') } })
    expect(denied.loadActions()).toEqual({ status: 'unavailable' })
    expect(denied.setCompleted('action-1', true)).toEqual({ ok: false, reason: 'unavailable' })
    const full = createActionStorage({ ...context, getStorage: () => ({ ...memoryStorage(), setItem() { throw new Error('full') } }) })
    expect(full.setCompleted('action-1', true)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('ограничивает отметки последними 10 попытками', () => {
    const store = setup()
    for (let index = 0; index < 12; index++) createActionStorage({ ...store.context, attemptId: `attempt-${index}` }).setCompleted('action-1', true)
    const data = JSON.parse(store.storage.getItem(STORAGE_KEYS.actions) ?? '{}')
    expect(data.records).toHaveLength(10)
    expect(data.records[0].attemptId).toBe('attempt-11')
    expect(store.loadActions()).toEqual({ status: 'empty' })
  })

  it('не пишет JSON, который превышает собственный предел чтения', () => {
    const store = setup()
    const record = { attemptId: 'previous', versions: { ...DEMO_VERSIONS, assessment: '' },
      updatedAt: store.context.now(), completed: {} }
    const envelope = { schema: 1, records: [record] }
    record.versions.assessment = 'v'.repeat(128 * 1024 - JSON.stringify(envelope).length - 10)
    const raw = JSON.stringify(envelope)
    store.storage.setItem(STORAGE_KEYS.actions, raw)
    expect(store.setCompleted('action-1', true)).toEqual({ ok: false, reason: 'invalid' })
    expect(store.storage.getItem(STORAGE_KEYS.actions)).toBe(raw)
  })
})
