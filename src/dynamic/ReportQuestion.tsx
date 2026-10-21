import { useState } from 'react'
import { api, post } from '../auth/api'
import styles from './ReportQuestion.module.css'
import { useI18n } from '../i18n/context'

/** Сообщение руководителю бригады о некорректном вопросе. Ответ на вопрос всё равно сохраняется и учитывается в результате. */
export interface QuestionReport {
  readonly id: string
  readonly subject: string
  readonly questionId: string
  readonly question: { readonly kind: 'choice' | 'open'; readonly context?: string; readonly text: string; readonly options?: readonly string[] }
  readonly employeeName: string
  readonly teamName: string
  readonly reportedAt: string
  readonly unseen: boolean
}
export interface QuestionReportsPayload { readonly reports: readonly QuestionReport[]; readonly unread: number }

const FLAG = 'M5 21V4m0 0h11l-2 4 2 4H5'

/**
 * Кнопка «Некорректный вопрос» под вопросом теста: сначала короткое подтверждение, затем — что вопрос принят к сведению.
 * Отметка не меняет ответ и не исключает вопрос из подсчёта.
 */
export function ReportQuestion({ attemptId, questionId, reported, onReported }: {
  readonly attemptId: string; readonly questionId: string; readonly reported: boolean
  readonly onReported: (questionIds: readonly string[]) => void
}) {
  const { t } = useI18n()
  const [stage, setStage] = useState<'idle' | 'confirm' | 'sending'>('idle')
  const [justSent, setJustSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function send() {
    setStage('sending'); setError(null)
    try {
      const { questionIds } = await api<{ questionIds: string[] }>('/question-reports', post({ attemptId, questionId }))
      setJustSent(true); onReported(questionIds); setStage('idle')
    } catch (reason) { setError((reason as Error).message); setStage('confirm') }
  }
  if (reported) return <div className={styles.done} role="status">
    <span className={styles.check} aria-hidden="true">✓</span>
    <p><strong>{justSent ? t('Спасибо! Вопрос принят к сведению.') : t('Вы уже сообщили об этом вопросе.')}</strong>{' '}{t('Мы рассмотрим его и при необходимости исправим. Ответ на вопрос всё равно нужен — он учитывается в результате.')}</p>
  </div>
  if (stage === 'idle') return <button type="button" className={styles.trigger} onClick={() => setStage('confirm')}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={FLAG} /></svg>{t('Некорректный вопрос')}</button>
  return <div className={styles.confirm} role="group" aria-label={t('Сообщить о некорректном вопросе')}>
    <p>{t('Сообщить, что вопрос составлен некорректно? Сообщение получит руководитель вашей бригады.')}</p>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.send} disabled={stage === 'sending'} onClick={() => { void send() }}>{stage === 'sending' ? t('Отправляем…') : t('Сообщить')}</button>
      <button type="button" className={styles.cancel} disabled={stage === 'sending'} onClick={() => { setStage('idle'); setError(null) }}>{t('Отмена')}</button>
    </div>
  </div>
}
