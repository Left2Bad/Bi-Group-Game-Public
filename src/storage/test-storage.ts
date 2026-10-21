import type { StorageAccess } from './shared'

/** Только in-memory адаптер тестов; runtime его не импортирует. */
export function memoryStorage(): StorageAccess {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}
