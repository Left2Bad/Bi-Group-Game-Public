import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TRAIT_IDS } from '../domain/types'
import type { AssessmentResult } from '../domain/types'
import { useI18n } from '../i18n/context'
import { dateLocale } from '../i18n/translate'
import { compareAttempts } from '../storage/attempts'
import { sameVersions } from '../storage/shared'
import { Card } from '../ui/primitives'
import { useTraitLabels } from '../ui/use-labels'
import { useAssessment } from './assessment-context'
import styles from './AttemptHistory.module.css'


/** Только навигация/сравнение снимков A; содержимое результата остаётся в компоненте B. */
export function AttemptHistory() {
  const { session, snapshot } = useAssessment()
  const { t, lang } = useI18n()
  const { traitNames: names } = useTraitLabels()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [baselineId, setBaselineId] = useState('')
  if (!session || !snapshot || snapshot.attempts.length === 0) return null
  const { attempts, result } = snapshot
  const dateFormat = new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Qyzylorda' })
  const label = (attempt: AssessmentResult) =>
    t('Прохождение {n} · {date} (UTC+5)', { n: attempts.length - attempts.indexOf(attempt), date: dateFormat.format(new Date(attempt.completedAt)) })
  const baseline = attempts.find((attempt) => attempt.attemptId === baselineId)
  const comparison = baseline && result ? compareAttempts(baseline, result) : null
  const alternatives = attempts.filter((attempt) => attempt.attemptId !== result?.attemptId)
  const hasCompatible = alternatives.some((attempt) => sameVersions(attempt.versions, result?.versions ?? session.module.versions))
  return <Card className={styles.history}>
    <h2>{t('Сохранённые попытки')}</h2>
    <p>{t('Просмотр истории сохраняет активный черновик. После обновления страницы открывается последний профиль; если есть черновик — продолжение теста.')}</p>
    <label className={styles.field}>
      {t('Открыть сохранённый профиль')}
      <select value={attempts.some((attempt) => attempt.attemptId === result?.attemptId) ? result?.attemptId : ''}
        onChange={(event) => { if (session.openAttempt(event.target.value)) navigate(pathname === '/results' ? '/results?tab=details' : '/results') }}>
        <option value="" disabled>{t('Выберите прохождение')}</option>
        {attempts.map((attempt) => {
          const compatible = sameVersions(attempt.versions, session.module.versions)
          return <option key={attempt.attemptId} value={attempt.attemptId} disabled={!compatible}>
            {label(attempt)}{compatible ? '' : t(' — другая версия, просмотр недоступен')}
          </option>
        })}
      </select>
    </label>
    {result && <>
      {hasCompatible ? <label className={styles.field}>
        {t('Сравнить текущий профиль с')}
        <select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>
          <option value="">{t('Без сравнения')}</option>
          {alternatives.map((attempt) => <option key={attempt.attemptId} value={attempt.attemptId}
            disabled={!sameVersions(attempt.versions, result.versions)}>
            {label(attempt)}{sameVersions(attempt.versions, result.versions) ? '' : t(' — другая версия')}
          </option>)}
        </select>
      </label> : <p>{t('Для сравнения нужны две попытки одной версии. Сейчас сравнение недоступно.')}</p>}
      {comparison?.ok && baseline && <>
        <p>{t('База: {label}. Разница считается как открытый профиль минус база, в процентных пунктах.', { label: label(baseline) })}</p>
        <table>
          <caption>{t('Разница ответов по четырём качествам')}</caption>
          <thead><tr><th scope="col">{t('Качество')}</th><th scope="col">{t('База')}</th><th scope="col">{t('Профиль')}</th><th scope="col">{t('Δ, п.п.')}</th></tr></thead>
          <tbody>{TRAIT_IDS.map((trait) => <tr key={trait}>
            <th scope="row">{names[trait]}</th><td>{baseline.traits[trait].percent}%</td><td>{result.traits[trait].percent}%</td>
            <td>{comparison.delta[trait] > 0 ? '+' : ''}{comparison.delta[trait]} {t('п.п.')}</td>
          </tr>)}</tbody>
        </table>
        <p>{t('Сравнение показывает, как изменились ваши решения между попытками.')}</p>
      </>}
      {comparison && !comparison.ok && <p role="status">{t('Эти попытки нельзя сравнить: выберите другое прохождение той же версии.')}</p>}
    </>}
  </Card>
}
