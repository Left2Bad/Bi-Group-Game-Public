import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../auth/api'
import { questions } from '../content/questions'
import type { AssessmentResult } from '../domain/types'
import { assessmentModule } from '../app/assessment-module'
import { ResultsPage } from '../features/results/ResultsPage'
import { Button, Card, Page } from '../ui/primitives'
import { useI18n } from '../i18n/context'
import { dateLocale } from '../i18n/translate'

/** Все старые результаты доступны по страницам и остаются в прежней методике. */
export function LegacyHistoryPage() {
  const { t, lang } = useI18n()
  const [offset, setOffset] = useState(0)
  const [attempts, setAttempts] = useState<AssessmentResult[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<AssessmentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api<{ attempts: AssessmentResult[]; total: number }>(`/attempts?limit=10&offset=${offset}`)
      .then((data) => { if (live) { setAttempts(data.attempts); setTotal(data.total); setSelected(data.attempts[0] ?? null) } })
      .catch((reason: Error) => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [offset])
  return <Page><Card><h1>{t('Результаты прежней методики')}</h1>
    <p>{t('Эти прохождения содержат 15 заранее подготовленных ситуаций и рассчитаны по прежним правилам. Их проценты нельзя напрямую сравнивать с новой методикой.')}</p>
    <p><Link to="/results">{t('Вернуться к новой истории')}</Link></p>
    {error && <p role="alert">{t(error)}</p>}
    <p>{t('Всего старых попыток: {total}', { total })}</p>
    <ol>{attempts.map((item) => <li key={item.attemptId}><button type="button" onClick={() => setSelected(item)}>
      {new Date(item.completedAt).toLocaleString(dateLocale(lang))} · {item.attemptId === selected?.attemptId ? t('открыто') : t('открыть')}</button></li>)}</ol>
    <div style={{ display: 'flex', gap: 10 }}>
      <Button tone="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 10))}>{t('Новее')}</Button>
      <Button tone="secondary" disabled={offset + 10 >= total} onClick={() => setOffset(offset + 10)}>{t('Раньше')}</Button>
    </div>
  </Card>
    {selected && <ResultsPage result={selected} questions={questions} personal={false}
      plan={assessmentModule.buildRecommendations?.(selected) ?? null} />}
  </Page>
}
