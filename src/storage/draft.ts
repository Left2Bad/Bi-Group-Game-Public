import type { Draft, LoadDraft, SaveDraft } from '../domain/types'
import {
  browserStorage, isKnownAnswers, isRecord, isTimestamp, isVersions, sameVersions, STORAGE_KEYS,
} from './shared'
import type { StorageContext, StorageWriteResult } from './shared'

const MAX_DRAFT_LENGTH = 64 * 1024

export interface DraftStorage {
  readonly loadDraft: LoadDraft
  readonly saveDraft: SaveDraft
  readonly clearDraft: () => StorageWriteResult
}

/** Контекст задаёт реальный каталог C; у экземпляра loadDraft()/saveDraft(draft) — общий контракт. */
export function createDraftStorage({ questions, versions, getStorage = browserStorage }: StorageContext): DraftStorage {
  function isDraft(value: unknown): value is Draft {
    return isRecord(value) && isVersions(value.versions) && isTimestamp(value.updatedAt)
      && typeof value.currentQuestionId === 'string'
      && questions.some((question) => question.id === value.currentQuestionId)
      && isKnownAnswers(value.answers, questions)
  }

  const loadDraft: LoadDraft = () => {
    let raw: string | null
    try { raw = getStorage().getItem(STORAGE_KEYS.draft) } catch { return { status: 'unavailable' } }
    if (raw === null) return { status: 'empty' }
    if (raw.length > MAX_DRAFT_LENGTH) return { status: 'invalid' }
    try {
      const value: unknown = JSON.parse(raw)
      if (!isRecord(value) || !isVersions(value.versions)) return { status: 'invalid' }
      if (!sameVersions(value.versions, versions)) return { status: 'incompatible' }
      if (!isDraft(value)) return { status: 'invalid' }
      return { status: 'loaded', draft: {
        versions: { ...value.versions }, answers: { ...value.answers },
        currentQuestionId: value.currentQuestionId, updatedAt: value.updatedAt,
      } }
    } catch {
      return { status: 'invalid' }
    }
  }

  const saveDraft: SaveDraft = (draft) => {
    let raw: string
    try {
      if (!isDraft(draft) || !sameVersions(draft.versions, versions)) return { ok: false, reason: 'invalid' }
      raw = JSON.stringify({ versions: { ...draft.versions }, answers: { ...draft.answers },
        currentQuestionId: draft.currentQuestionId, updatedAt: draft.updatedAt })
      if (raw.length > MAX_DRAFT_LENGTH) return { ok: false, reason: 'invalid' }
    } catch { return { ok: false, reason: 'invalid' } }
    try {
      getStorage().setItem(STORAGE_KEYS.draft, raw)
      return { ok: true }
    } catch { return { ok: false, reason: 'unavailable' } }
  }

  return {
    loadDraft, saveDraft,
    clearDraft() {
      try { getStorage().removeItem(STORAGE_KEYS.draft); return { ok: true } }
      catch { return { ok: false, reason: 'unavailable' } }
    },
  }
}
