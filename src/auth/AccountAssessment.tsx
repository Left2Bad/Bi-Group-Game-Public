import { useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAssessment } from '../app/assessment-context'
import type { AssessmentResult } from '../domain/types'
import { useI18n } from '../i18n/context'
import { createAttemptStorage } from '../storage/attempts'
import type { StorageProvider } from '../storage/shared'
import { Button, Card, Page } from '../ui/primitives'
import { api, saveAccountAttempt } from './api'
import { useAuth } from './context'
import { RestoredAttemptsContext } from './attempt-context'
import { PersonalStorageContext } from '../storage/personal'

export function RestoreAccount({ getStorage, children }: { readonly getStorage: StorageProvider; readonly children: ReactNode }) {
  const { user, enabled } = useAuth()
  const { t } = useI18n()
  const needsRestore = enabled && user?.role === 'employee'
  const [restored, setRestored] = useState<readonly AssessmentResult[]>([])
  const [ready, setReady] = useState(!needsRestore)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!needsRestore) return
    let live = true
    api<{ attempts: AssessmentResult[] }>('/attempts').then(({ attempts }) => {
      if (!live) return
      const history = createAttemptStorage(getStorage)
      const local = history.loadAttempts()
      if (local.status === 'loaded' || local.status === 'empty') {
        const pending = (local.status === 'loaded' ? local.attempts : []).filter((attempt) => {
          if (attempts.some((remote) => remote.attemptId === attempt.attemptId)) return false
          try { return getStorage().getItem(`bi-academy:uploaded:${attempt.attemptId}`) !== '1' } catch { return true }
        })
        const merged = [...attempts, ...pending].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 10)
        if (local.status === 'loaded' ? JSON.stringify(local.attempts) !== JSON.stringify(merged) : merged.length > 0) history.replaceAttempts(merged)
      }
      for (const attempt of attempts) {
        try {
          const key = `bi-academy:uploaded:${attempt.attemptId}`
          if (getStorage().getItem(key) !== '1') getStorage().setItem(key, '1')
        } catch { /* Хранилище может быть недоступно. */ }
      }
      setRestored(attempts)
      setReady(true); setError(null)
    }).catch((reason: Error) => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [needsRestore, getStorage, revision])
  if (ready) return <RestoredAttemptsContext value={restored}>{children}</RestoredAttemptsContext>
  return <Page><Card>{error ? <><p role="alert">{t(error)}</p><Button onClick={() => setRevision((value) => value + 1)}>{t('Попробовать снова')}</Button></>
    : <p role="status">{t('Загружаем сохранённые результаты…')}</p>}</Card></Page>
}

export function AccountAttemptSync() {
  const { user, enabled } = useAuth()
  const { snapshot } = useAssessment()
  const { t } = useI18n()
  const restored = useContext(RestoredAttemptsContext)
  const getStorage = useContext(PersonalStorageContext)
  const synced = useRef(new Set(restored.map((attempt) => attempt.attemptId)))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const attempts = snapshot?.attempts
  useEffect(() => {
    if (!enabled || user?.role !== 'employee' || !attempts?.length) return
    let live = true
    const pending = attempts.filter((attempt) => !synced.current.has(attempt.attemptId))
    if (pending.length === 0) return
    async function sync() {
      setState('saving')
      try {
        await Promise.all([...pending].reverse().map((attempt) => saveAccountAttempt(attempt).then(() => {
          synced.current.add(attempt.attemptId)
          try { getStorage().setItem(`bi-academy:uploaded:${attempt.attemptId}`, '1') } catch { /* Сохранён на сервере. */ }
        })))
        if (live) { setState('saved'); setError(null) }
      } catch (reason) { if (live) { setState('error'); setError((reason as Error).message) } }
    }
    void sync()
    return () => { live = false }
  }, [attempts, enabled, user?.role, revision, getStorage])
  if (!enabled || user?.role !== 'employee' || !attempts?.length || state === 'idle') return null
  return <div data-no-print style={{ maxWidth: 'var(--content-width)', margin: '0 auto', padding: '8px 20px' }}>
    {state === 'error' ? <><p role="alert">{t('Результат сохранён в браузере, но ещё не отправлен в аккаунт.')} {t(error ?? '')}</p>
      <Button tone="secondary" onClick={() => setRevision((value) => value + 1)}>{t('Повторить сохранение')}</Button></>
      : <p role="status">{t(state === 'saving' ? 'Сохраняем результат в аккаунте…' : 'Результат сохранён в аккаунте.')}</p>}
  </div>
}
