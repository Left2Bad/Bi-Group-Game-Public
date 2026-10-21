/** Unsaved text is scoped to an account and removed with the employee's data. */
export function clearDynamicDrafts(userId: string) {
  try {
    const prefix = `bi-academy:dynamic-text:${userId}:`
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    for (const key of keys) if (key?.startsWith(prefix)) localStorage.removeItem(key)
  } catch { /* Server deletion still succeeds when browser storage is unavailable. */ }
}
