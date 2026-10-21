import { useSyncExternalStore } from 'react'

/**
 * Общий прогресс перевода сгенерированного контента. Страницы сообщают, сколько строк их попытки уже переведено,
 * а полоса под переключателем языка показывает сумму. Повтор после сбоя тоже идёт через это хранилище.
 */
export interface ContentProgressEntry { readonly total: number; readonly done: number; readonly state: 'ready' | 'translating' | 'failed'; readonly error?: string }
export interface ContentProgress { readonly total: number; readonly done: number; readonly translating: boolean; readonly failed: string | null }

const entries = new Map<string, ContentProgressEntry>()
const listeners = new Set<() => void>()
let snapshot: ContentProgress = { total: 0, done: 0, translating: false, failed: null }
let retries = 0
const retryListeners = new Set<() => void>()

function publish() {
  const all = [...entries.values()]
  const failed = all.find((item) => item.state === 'failed')
  snapshot = { total: all.reduce((sum, item) => sum + item.total, 0), done: all.reduce((sum, item) => sum + item.done, 0),
    translating: all.some((item) => item.state === 'translating'), failed: failed ? failed.error ?? '' : null }
  for (const listener of listeners) listener()
}

export function reportContentProgress(key: string, entry: ContentProgressEntry | null) {
  if (entry) entries.set(key, entry)
  else entries.delete(key)
  publish()
}

export function useContentProgress(): ContentProgress {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => snapshot, () => snapshot)
}

/** Повторить перевод после сбоя: все страницы с непереведённым контентом отправят запрос заново. */
export function retryContentTranslation() {
  retries++
  for (const listener of retryListeners) listener()
}

export function useContentRetry(): number {
  return useSyncExternalStore((listener) => { retryListeners.add(listener); return () => retryListeners.delete(listener) }, () => retries, () => retries)
}
