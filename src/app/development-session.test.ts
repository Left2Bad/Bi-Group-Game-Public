import { describe, expect, it } from 'vitest'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { assessmentModule } from './assessment-module'
import { createDevelopmentSession, createDevelopmentSessions } from './development-session'
import { memoryStorage } from '../storage/test-storage'
import { STORAGE_KEYS } from '../storage/shared'

function makeResult(id = 'test-actions') {
  const calculated = assessmentModule.calculateProfile(manualSets.demoA.answers, {
    ...assessmentModule, attemptId: id, completedAt: '2026-10-17T00:00:00.000Z',
  })
  if (!calculated.ok) throw new Error(calculated.error.message)
  return calculated.result
}

describe('интеграция действий A с реальным планом C', () => {
  it('сохраняет/восстанавливает/снимает отметки, не меняя результат и другие ключи', () => {
    const storage = memoryStorage()
    const result = makeResult()
    const initial = structuredClone(result)
    storage.setItem(STORAGE_KEYS.attempts, 'history-preserved')
    storage.setItem(STORAGE_KEYS.draft, 'draft-preserved')
    const create = () => createDevelopmentSession({ result, buildRecommendations: assessmentModule.buildRecommendations, getStorage: () => storage })
    const first = create()
    const id = first.getSnapshot().plan?.recommendations[0]?.id
    if (!id) throw new Error('Missing recommendation')
    first.setCompleted(id, true)
    expect(create().getSnapshot().completedIds).toEqual([id])
    first.setCompleted(id, false)
    expect(create().getSnapshot().completedIds).toEqual([])
    expect(result).toEqual(initial)
    expect(storage.getItem(STORAGE_KEYS.attempts)).toBe('history-preserved')
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe('draft-preserved')
    first.setCompleted(id, true)
    const other = createDevelopmentSession({ result: makeResult('other'), buildRecommendations: assessmentModule.buildRecommendations, getStorage: () => storage })
    expect(other.getSnapshot().completedIds).toEqual([])
  })

  it.each(['invalid', 'incompatible'])('сохраняет исходные %s отметки, работает в памяти', (kind) => {
    const storage = memoryStorage()
    const raw = kind === 'invalid' ? '{broken' : '{"schema":99,"records":[]}'
    storage.setItem(STORAGE_KEYS.actions, raw)
    const controller = createDevelopmentSession({ result: makeResult(), buildRecommendations: assessmentModule.buildRecommendations, getStorage: () => storage })
    const id = controller.getSnapshot().plan?.recommendations[0]?.id
    if (!id) throw new Error('Missing recommendation')
    controller.setCompleted(id, true)
    expect(controller.getSnapshot().completedIds).toEqual([id])
    expect(controller.getSnapshot().warning).toBe(true)
    expect(storage.getItem(STORAGE_KEYS.actions)).toBe(raw)
  })

  it('при переполнении держит несколько отметок в памяти и не теряет первую', () => {
    const storage = memoryStorage()
    const controller = createDevelopmentSession({ result: makeResult(), buildRecommendations: assessmentModule.buildRecommendations,
      getStorage: () => ({ ...storage, setItem() { throw new DOMException('Full', 'QuotaExceededError') } }) })
    const ids = controller.getSnapshot().plan?.recommendations.map((item) => item.id) ?? []
    expect(ids).toHaveLength(2)
    for (const id of ids) controller.setCompleted(id, true)
    expect(controller.getSnapshot().completedIds).toEqual(ids)
    controller.setCompleted('unknown', true)
    expect(controller.getSnapshot().completedIds).toEqual(ids)
    controller.setCompleted(ids[0] ?? '', false)
    expect(controller.getSnapshot().completedIds).toEqual(ids.slice(1))
    expect(storage.getItem(STORAGE_KEYS.actions)).toBeNull()
  })

  it('ошибка построения плана не падает наружу', () => {
    const controller = createDevelopmentSession({ result: makeResult(), buildRecommendations() { throw new Error('Unavailable') }, getStorage: memoryStorage })
    expect(controller.getSnapshot().plan).toBeNull()
    controller.setCompleted('unknown', true)
    expect(controller.getSnapshot().completedIds).toEqual([])
  })

  it('memory-only отметки переживают переходы SPA, очищаются удалением и изолированы по попытке', () => {
    const pool = createDevelopmentSessions(() => { throw new DOMException('Blocked', 'SecurityError') })
    const result = makeResult()
    const controller = pool.get(result, assessmentModule.buildRecommendations)
    const id = controller.getSnapshot().plan?.recommendations[0]?.id ?? ''
    controller.setCompleted(id, true)
    expect(pool.get(result, assessmentModule.buildRecommendations).getSnapshot().completedIds).toEqual([id])
    expect(pool.get(makeResult('other'), assessmentModule.buildRecommendations).getSnapshot().completedIds).toEqual([])
    expect(pool.get({ ...result, versions: { ...result.versions, recommendations: 'other-version' } },
      assessmentModule.buildRecommendations).getSnapshot().completedIds).toEqual([])
    pool.clear()
    expect(pool.get(result, assessmentModule.buildRecommendations).getSnapshot().completedIds).toEqual([])
  })
})
