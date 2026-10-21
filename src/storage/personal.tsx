import { createContext } from 'react'
import { browserStorage } from './shared'
import type { StorageAccess, StorageProvider } from './shared'

export const PersonalStorageContext = createContext<StorageProvider>(browserStorage)

export function temporaryStorage(): StorageProvider {
  const values = new Map<string, string>()
  return () => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) } })
}

export function accountStorage(userId: string, getStorage: StorageProvider = browserStorage): StorageProvider {
  const prefix = `bi-academy:user:${userId}:`
  return () => {
    const storage = getStorage()
    return { getItem: (key) => storage.getItem(prefix + key), setItem: (key, value) => storage.setItem(prefix + key, value),
      removeItem: (key) => storage.removeItem(prefix + key) }
  }
}

/** Remove only this account's browser data, including unsent answers and upload markers. */
export function clearAccountData(userId: string, getStorage: StorageProvider = browserStorage): boolean {
  try {
    const storage = getStorage() as StorageAccess & Pick<Storage, 'length' | 'key'>
    const prefixes = [`bi-academy:user:${userId}:`, `bi-academy:dynamic-text:${userId}:`]
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const key of keys) if (key && prefixes.some((prefix) => key.startsWith(prefix))) storage.removeItem(key)
    return true
  } catch { return false }
}

/** A reset on another device must also discard this browser's old unsent data. */
export function syncAccountReset(userId: string, resetAt: number, getStorage: StorageProvider = browserStorage): boolean {
  if (!Number.isSafeInteger(resetAt) || resetAt <= 0) return true
  const marker = `bi-academy:user:${userId}:reset-at`
  let storage: StorageAccess
  try { storage = getStorage() } catch { return true }
  try {
    if (storage.getItem(marker) === String(resetAt)) return true
  } catch { return true }
  if (!clearAccountData(userId, getStorage)) return false
  try { storage.setItem(marker, String(resetAt)) } catch { /* Data is already gone; repeat cleanup at the next login. */ }
  return true
}
