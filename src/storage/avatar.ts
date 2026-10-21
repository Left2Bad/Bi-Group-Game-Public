import { isAvatarParams } from '../domain/avatar'
import type { AvatarParams } from '../domain/avatar'
import { browserStorage, isRecord, STORAGE_KEYS } from './shared'
import type { StorageProvider, StorageWriteResult } from './shared'

/**
 * Выбор аватара: персонаж по тесту (по умолчанию) или герой, созданный сотрудником.
 * Хранится только в этом браузере и удаляется вместе с остальными данными BI Academy.
 */
export type AvatarChoice =
  | { readonly kind: 'test' }
  | { readonly kind: 'custom'; readonly params: AvatarParams; readonly description?: string | undefined }

export const TEST_AVATAR: AvatarChoice = { kind: 'test' }
const SCHEMA = 1
const listeners = new Set<() => void>()

export function loadAvatarChoice(getStorage: StorageProvider = browserStorage): AvatarChoice {
  try {
    const raw = getStorage().getItem(STORAGE_KEYS.avatar)
    if (!raw || raw.length > 4096) return TEST_AVATAR
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.schema !== SCHEMA) return TEST_AVATAR
    if (value.kind === 'custom' && isAvatarParams(value.params)) {
      return { kind: 'custom', params: value.params, description: typeof value.description === 'string' ? value.description.slice(0, 600) : undefined }
    }
    return TEST_AVATAR
  } catch { return TEST_AVATAR }
}

export function saveAvatarChoice(choice: AvatarChoice, getStorage: StorageProvider = browserStorage): StorageWriteResult {
  try {
    getStorage().setItem(STORAGE_KEYS.avatar, JSON.stringify({ schema: SCHEMA, ...choice }))
    listeners.forEach((listener) => listener())
    return { ok: true }
  } catch { return { ok: false, reason: 'unavailable' } }
}

export function subscribeAvatarChoice(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEYS.avatar || event.key === null) listener() }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}
