import { describe, expect, it } from 'vitest'
import type { Draft } from '../domain/types'
import { DEMO_VERSIONS, demoDraft, demoQuestions } from '../../tests/fixtures/contract-demo'
import { createDraftStorage } from './draft'
import { clearAppData, STORAGE_KEYS } from './shared'
import { memoryStorage } from './test-storage'

function setup() {
  const storage = memoryStorage()
  const drafts = createDraftStorage({ questions: demoQuestions, versions: DEMO_VERSIONS, getStorage: () => storage })
  return { storage, ...drafts }
}

describe('черновик M10', () => {
  it('различает пустой черновик и сохранённый седьмой вопрос', () => {
    const drafts = setup()
    expect(drafts.loadDraft()).toEqual({ status: 'empty' })
    expect(drafts.saveDraft(demoDraft)).toEqual({ ok: true })
    expect(drafts.loadDraft()).toEqual({ status: 'loaded', draft: demoDraft })
    expect(drafts.clearDraft()).toEqual({ ok: true })
    expect(drafts.loadDraft()).toEqual({ status: 'empty' })
  })

  it('сохраняет снимок, изолированный от последующих изменений', () => {
    const drafts = setup()
    const answers = { ...demoDraft.answers }
    drafts.saveDraft({ ...demoDraft, answers })
    delete answers.Q01
    const first = drafts.loadDraft()
    expect(first).toEqual({ status: 'loaded', draft: demoDraft })
    if (first.status === 'loaded') {
      // Симулируем недисциплинированного потребителя, JSON хранения не должен измениться.
      Reflect.deleteProperty(first.draft.answers, 'Q01')
    }
    expect(drafts.loadDraft()).toEqual({ status: 'loaded', draft: demoDraft })
  })

  it.each(['{broken', 'null', '[]', '{}', JSON.stringify({ ...demoDraft, answers: [] }),
    JSON.stringify({ ...demoDraft, updatedAt: 'yesterday' }),
    JSON.stringify({ ...demoDraft, currentQuestionId: 'Q99' }),
    JSON.stringify({ ...demoDraft, answers: { Q99: 'Q99-A' } }),
    JSON.stringify({ ...demoDraft, answers: { Q01: 'Q02-A' } }),
    JSON.stringify({ ...demoDraft, answers: { Q01: 2 } }),
    ' '.repeat(65537),
  ])('не падает на повреждённом/неизвестном содержимом %#', (raw) => {
    const drafts = setup()
    drafts.storage.setItem(STORAGE_KEYS.draft, raw)
    expect(drafts.loadDraft()).toEqual({ status: 'invalid' })
    // Загрузка не уничтожает повреждённые данные без действия пользователя.
    expect(drafts.storage.getItem(STORAGE_KEYS.draft)).toBe(raw)
  })

  it.each(['schema', 'assessment', 'scoring', 'recommendations'] as const)('отвергает несовместимую версию %s', (field) => {
    const drafts = setup()
    const versions = { ...DEMO_VERSIONS, [field]: field === 'schema' ? 2 : 'changed' }
    drafts.storage.setItem(STORAGE_KEYS.draft, JSON.stringify({ ...demoDraft, versions }))
    expect(drafts.loadDraft()).toEqual({ status: 'incompatible' })
  })

  it('не записывает неподходящий черновик поверх старого', () => {
    const drafts = setup()
    drafts.saveDraft(demoDraft)
    const invalid: Draft = { ...demoDraft, answers: { Q01: 'Q02-A' } }
    expect(drafts.saveDraft(invalid)).toEqual({ ok: false, reason: 'invalid' })
    expect(drafts.loadDraft()).toEqual({ status: 'loaded', draft: demoDraft })
  })

  it('обрабатывает отказ получения хранилища', () => {
    const drafts = createDraftStorage({ questions: demoQuestions, versions: DEMO_VERSIONS,
      getStorage: () => { throw new DOMException('blocked', 'SecurityError') } })
    expect(drafts.loadDraft()).toEqual({ status: 'unavailable' })
    expect(drafts.saveDraft(demoDraft)).toEqual({ ok: false, reason: 'unavailable' })
    expect(drafts.clearDraft()).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('обрабатывает отказ чтения и переполнение записи', () => {
    const drafts = createDraftStorage({ questions: demoQuestions, versions: DEMO_VERSIONS,
      getStorage: () => ({
        getItem() { throw new Error('read denied') },
        setItem() { throw new DOMException('full', 'QuotaExceededError') },
        removeItem() { throw new Error('remove denied') },
      }) })
    expect(drafts.loadDraft()).toEqual({ status: 'unavailable' })
    expect(drafts.saveDraft(demoDraft)).toEqual({ ok: false, reason: 'unavailable' })
    expect(drafts.clearDraft()).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('удаление моих данных', () => {
  it('удаляет ключи приложения и сохраняет чужие данные того же домена', () => {
    const storage = memoryStorage()
    for (const key of Object.values(STORAGE_KEYS)) storage.setItem(key, 'own')
    storage.setItem('other-app:session', 'keep')
    expect(clearAppData(() => storage)).toEqual({ ok: true })
    for (const key of Object.values(STORAGE_KEYS)) expect(storage.getItem(key)).toBeNull()
    expect(storage.getItem('other-app:session')).toBe('keep')
  })

  it('сообщает частичный отказ и всё равно пытается удалить остальные ключи', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.attempts, 'own')
    expect(clearAppData(() => ({ ...storage, removeItem(key) {
      if (key === STORAGE_KEYS.draft) throw new Error('denied')
      storage.removeItem(key)
    } }))).toEqual({ ok: false, reason: 'unavailable' })
    expect(storage.getItem(STORAGE_KEYS.attempts)).toBeNull()
  })
})
