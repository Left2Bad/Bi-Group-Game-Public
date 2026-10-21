import type { DataVersions } from '../domain/types'
import { HISTORY_LIMIT } from './attempts'
import { browserStorage, isRecord, isTimestamp, isVersions, sameVersions, STORAGE_KEYS } from './shared'
import type { StorageProvider } from './shared'

interface CompletionRecord {
  readonly attemptId: string
  readonly versions: DataVersions
  readonly updatedAt: string
  readonly completed: Readonly<Record<string, string>>
}
type ReadRecordsResult =
  | { readonly status: 'loaded'; readonly records: readonly CompletionRecord[] }
  | { readonly status: 'empty' | 'invalid' | 'incompatible' | 'unavailable' }
export type LoadActionsResult =
  | { readonly status: 'loaded'; readonly completedIds: readonly string[] }
  | { readonly status: 'empty' | 'invalid' | 'incompatible' | 'unavailable' }
export type SaveActionResult =
  | { readonly ok: true; readonly completedIds: readonly string[] }
  | { readonly ok: false; readonly reason: 'invalid' | 'incompatible' | 'unavailable' }

interface ActionStorageContext {
  readonly attemptId: string
  readonly versions: DataVersions
  readonly recommendationIds: readonly string[]
  readonly getStorage?: StorageProvider
  readonly now?: () => string
}

/** Отметки действий привязаны к попытке и всем версиям, диагностические данные не меняются. */
export function createActionStorage({ attemptId, versions, recommendationIds, getStorage = browserStorage,
  now = () => new Date().toISOString() }: ActionStorageContext) {
  const allowed = new Set(recommendationIds)
  const validContext = !!attemptId && attemptId.length <= 128 && isVersions(versions)
    && allowed.size === recommendationIds.length && allowed.size <= 32
    && recommendationIds.every((id) => id.length > 0 && id.length <= 128)

  function isCompletionRecord(value: unknown): value is CompletionRecord {
    return isRecord(value) && typeof value.attemptId === 'string' && value.attemptId.length > 0
      && isVersions(value.versions) && isTimestamp(value.updatedAt) && isRecord(value.completed)
      && Object.keys(value.completed).length <= 32 && Object.values(value.completed).every(isTimestamp)
  }
  function readRecords(): ReadRecordsResult {
    if (!validContext) return { status: 'invalid' }
    let raw: string | null
    try { raw = getStorage().getItem(STORAGE_KEYS.actions) } catch { return { status: 'unavailable' } }
    if (raw === null) return { status: 'empty' }
    if (raw.length > 128 * 1024) return { status: 'invalid' }
    try {
      const data: unknown = JSON.parse(raw)
      if (!isRecord(data) || typeof data.schema !== 'number') return { status: 'invalid' }
      if (data.schema !== 1) return { status: 'incompatible' }
      if (!Array.isArray(data.records) || data.records.length > HISTORY_LIMIT || !data.records.every(isCompletionRecord)
        || new Set(data.records.map((item: CompletionRecord) => item.attemptId)).size !== data.records.length) return { status: 'invalid' }
      const current = data.records.find((item: CompletionRecord) => item.attemptId === attemptId) as CompletionRecord | undefined
      if (current && !sameVersions(current.versions, versions)) return { status: 'incompatible' }
      if (current && Object.keys(current.completed).some((id) => !allowed.has(id))) return { status: 'invalid' }
      return { status: 'loaded', records: data.records }
    } catch { return { status: 'invalid' } }
  }
  function ids(record: CompletionRecord | undefined) {
    return recommendationIds.filter((id) => record && Object.hasOwn(record.completed, id))
  }
  function loadActions(): LoadActionsResult {
    const loaded = readRecords()
    if (loaded.status !== 'loaded') return loaded
    const current = loaded.records.find((record) => record.attemptId === attemptId)
    return current ? { status: 'loaded', completedIds: ids(current) } : { status: 'empty' }
  }
  function setCompleted(recommendationId: string, completed: boolean): SaveActionResult {
    if (!validContext || !allowed.has(recommendationId)) return { ok: false, reason: 'invalid' }
    const loaded = readRecords()
    if (loaded.status !== 'loaded' && loaded.status !== 'empty') return { ok: false, reason: loaded.status }
    const previous = loaded.status === 'loaded' ? loaded.records : []
    const current = previous.find((record) => record.attemptId === attemptId)
    const nextCompleted = { ...current?.completed }
    const updatedAt = now()
    if (!isTimestamp(updatedAt)) return { ok: false, reason: 'invalid' }
    if (completed) Object.defineProperty(nextCompleted, recommendationId, { value: updatedAt, enumerable: true, configurable: true })
    else delete nextCompleted[recommendationId]
    const record: CompletionRecord = { attemptId, versions: { ...versions }, updatedAt, completed: nextCompleted }
    const records = [record, ...previous.filter((item) => item.attemptId !== attemptId)].slice(0, HISTORY_LIMIT)
    const raw = JSON.stringify({ schema: 1, records })
    if (raw.length > 128 * 1024) return { ok: false, reason: 'invalid' }
    try {
      getStorage().setItem(STORAGE_KEYS.actions, raw)
      return { ok: true, completedIds: ids(record) }
    } catch { return { ok: false, reason: 'unavailable' } }
  }
  return { loadActions, setCompleted }
}
