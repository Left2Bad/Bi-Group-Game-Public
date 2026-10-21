import { useCallback, useContext, useSyncExternalStore } from 'react'
import { loadAvatarChoice, saveAvatarChoice, subscribeAvatarChoice, TEST_AVATAR } from '../storage/avatar'
import type { AvatarChoice } from '../storage/avatar'
import { STORAGE_KEYS } from '../storage/shared'
import { PersonalStorageContext } from '../storage/personal'
import type { StorageProvider } from '../storage/shared'

/** Снимок кешируется по сырой строке, чтобы useSyncExternalStore не получал новый объект на каждом рендере. */
let cached: { readonly raw: string | null; readonly choice: AvatarChoice } | null = null
function snapshot(getStorage: StorageProvider): AvatarChoice {
  let raw: string | null = null
  try { raw = getStorage().getItem(STORAGE_KEYS.avatar) } catch { /* хранилище недоступно: остаётся персонаж по тесту */ }
  if (!cached || cached.raw !== raw) cached = { raw, choice: loadAvatarChoice(getStorage) }
  return cached.choice
}

export function useAvatarChoice(storageOverride?: StorageProvider): readonly [AvatarChoice, (choice: AvatarChoice) => boolean] {
  const personalStorage = useContext(PersonalStorageContext)
  const getStorage = storageOverride ?? personalStorage
  const choice = useSyncExternalStore(subscribeAvatarChoice, () => snapshot(getStorage), () => TEST_AVATAR)
  const save = useCallback((next: AvatarChoice) => saveAvatarChoice(next, getStorage).ok, [getStorage])
  return [choice, save] as const
}
