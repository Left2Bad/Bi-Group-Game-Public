import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../auth/api'
import { AvatarPage } from '../features/avatar/AvatarPage'
import { Card, Page } from '../ui/primitives'
import type { DynamicAttempt } from './domain'
import { preferenceProfile } from './presentation'
import { useI18n } from '../i18n/context'

export function DynamicAvatarPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const id = params.get('attempt')
  const [attempt, setAttempt] = useState<DynamicAttempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const load = async () => {
      const selected = id ?? (await api<{ attempts: DynamicAttempt[] }>('/dynamic/attempts?status=completed&limit=1&offset=0')).attempts.find((item) => item.status === 'completed')?.id
      if (selected) {
        const data = await api<{ attempt: DynamicAttempt }>(`/dynamic/attempts/${encodeURIComponent(selected)}`)
        if (live) setAttempt(data.attempt)
      }
    }
    void load().catch((reason: Error) => { if (live) setError(reason.message) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id])
  if (attempt?.evaluation) return <AvatarPage result={preferenceProfile(attempt)} backTo={`/results?attempt=${encodeURIComponent(attempt.id)}`} required />
  return <Page><Card>{loading ? <p role="status">{t('Загружаем профиль…')}</p> : <><h1>{t('Сначала пройдите тест')}</h1>{error && <p role="alert">{t(error)}</p>}<Link to="/assessment">{t('Перейти к тесту')}</Link></>}</Card></Page>
}
