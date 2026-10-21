import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { api, post } from '../auth/api'
import { useI18n } from '../i18n/context'
import { reportContentProgress, useContentRetry } from '../i18n/content-progress'
import { attemptTexts, isContentLang, localizeAttempt } from './content-i18n'
import type { ContentLang, TranslationStatus } from './content-i18n'
import type { DynamicAttempt } from './domain'

/** Переводы, уже полученные в этой вкладке: обратное переключение языка не требует запросов. */
const cache = new Map<ContentLang, Map<string, string>>()
const known = (lang: ContentLang) => {
  let map = cache.get(lang)
  if (!map) { map = new Map(); cache.set(lang, map) }
  return map
}
const POLL_MS = 1500

/**
 * Попытка на выбранном языке. Для русского возвращается как есть. Для казахского и английского запрашивает перевод
 * у сервера (endpoint — POST, принимающий { lang }), пока он не готов, и сообщает прогресс полосе под переключателем языка.
 * Непереведённые строки остаются русскими, поэтому страница работает и во время перевода, и при его сбое.
 */
export function useLocalizedAttempt<T extends DynamicAttempt | null>(attempt: T, endpoint: string | null): T {
  const { lang } = useI18n()
  const contentLang = isContentLang(lang) ? lang : null
  const retry = useContentRetry()
  const seenRetry = useRef(retry)
  const [version, setVersion] = useState(0)
  const key = useId()
  const texts = useMemo(() => attempt && contentLang ? attemptTexts(attempt) : [], [attempt, contentLang])

  useEffect(() => {
    if (!contentLang || !endpoint || texts.length === 0) return
    const map = known(contentLang)
    const total = texts.length
    const count = () => texts.reduce((sum, text) => sum + (map.has(text) ? 1 : 0), 0)
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const retrying = retry !== seenRetry.current
    seenRetry.current = retry
    const tick = async (first: boolean) => {
      if (count() === total) { reportContentProgress(key, { total, done: total, state: 'ready' }); return }
      reportContentProgress(key, { total, done: count(), state: 'translating' })
      try {
        const status = await api<TranslationStatus>(endpoint, post({ lang: contentLang, ...(first && retrying ? { retry: true } : {}) }))
        if (!live) return
        let added = 0
        for (const [source, text] of Object.entries(status.texts ?? {})) if (map.get(source) !== text) { map.set(source, text); added++ }
        if (added) setVersion((value) => value + 1)
        const done = count()
        if (done === total) reportContentProgress(key, { total, done, state: 'ready' })
        else if (status.state === 'failed') reportContentProgress(key, { total, done, state: 'failed', ...(status.error ? { error: status.error } : {}) })
        else { reportContentProgress(key, { total, done, state: 'translating' }); timer = setTimeout(() => { void tick(false) }, POLL_MS) }
      } catch (reason) {
        if (live) reportContentProgress(key, { total, done: count(), state: 'failed', error: (reason as Error).message })
      }
    }
    void tick(true)
    return () => { live = false; clearTimeout(timer); reportContentProgress(key, null) }
  }, [contentLang, endpoint, texts, retry, key])

  return useMemo(() => {
    void version
    return attempt && contentLang ? localizeAttempt(attempt, known(contentLang)) as T : attempt
  }, [attempt, contentLang, version])
}
