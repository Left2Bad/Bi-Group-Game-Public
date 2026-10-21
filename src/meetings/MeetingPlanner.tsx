import { useState } from 'react'
import type { FormEvent } from 'react'
import { MEETING_MESSAGE_MAX, STATUS_TEXT, defaultMeetingValue, formatMeetingDate, isUpcoming } from './meetings'
import type { Meeting } from './meetings'
import { useNow } from './useNow'
import styles from './MeetingPlanner.module.css'
import { useI18n } from '../i18n/context'

/** Данные и действия для бесед одной команды. Без них (пример команды) раздел бесед не показывается. */
export interface MeetingsControl {
  readonly list: readonly Meeting[]
  readonly schedule: (employeeId: string, at: string, message: string) => Promise<void>
  readonly cancel: (meetingId: string) => Promise<void>
}

/** Ячейка «Беседа» в таблице качеств: статус действующей беседы либо кнопка назначения, если есть показатель ниже нормы. */
export function MeetingCell({ employeeId, name, below, control, open, onToggle }: {
  readonly employeeId: string; readonly name: string; readonly below: readonly string[]
  readonly control: MeetingsControl; readonly open: boolean; readonly onToggle: () => void
}) {
  const { t, lang } = useI18n()
  const active = control.list.find((item) => item.employeeId === employeeId && isUpcoming(item))
  if (active) return <span className={styles.chip} data-status={active.status}>{t(STATUS_TEXT[active.status])}<small>{formatMeetingDate(active.at, lang)}</small></span>
  if (below.length === 0) return <span className={styles.none} title={t('Показатели в норме')}>—</span>
  return <button type="button" className={styles.open} aria-expanded={open} aria-label={t('Назначить беседу: {name}', { name })} onClick={onToggle}>{open ? t('Свернуть') : t('Назначить беседу')}</button>
}

/** Форма приглашения на беседу: дата и время, необязательное сообщение. Сотрудник примет или отклонит приглашение. */
export function MeetingForm({ employeeId, name, below, control, onDone }: {
  readonly employeeId: string; readonly name: string; readonly below: readonly string[]
  readonly control: MeetingsControl; readonly onDone: () => void
}) {
  const { t } = useI18n()
  const [at, setAt] = useState(defaultMeetingValue)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const time = new Date(at)
    if (!at || Number.isNaN(time.getTime()) || time.getTime() < Date.now()) { setError(t('Укажите дату и время встречи в будущем.')); return }
    setBusy(true); setError(null)
    try { await control.schedule(employeeId, time.toISOString(), message.trim()); onDone() }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <form className={styles.form} onSubmit={(event) => { void submit(event) }} noValidate aria-label={t('Беседа с {name}', { name })}>
    <p className={styles.reason}><strong>{t('Беседа с {name}.', { name })}</strong>{' '}{t('Ниже нормы: {join}.', { join: below.join(', ') })}</p>
    <label>{t('Дата и время встречи')}<input type="datetime-local" value={at} required disabled={busy} onChange={(event) => { setAt(event.target.value); setError(null) }} /></label>
    <label>{t('Сообщение сотруднику (необязательно)')}<textarea rows={3} maxLength={MEETING_MESSAGE_MAX} value={message} disabled={busy} placeholder={t('Например: обсудим результаты теста и план на 30 дней')}
        onChange={(event) => setMessage(event.target.value)} /></label>
    <p className={styles.hint}>{t('Сотрудник получит уведомление и сможет принять или отклонить приглашение. {length} из {MEETING_MESSAGE_MAX}', { length: message.length, MEETING_MESSAGE_MAX })}</p>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    <div className={styles.actions}>
      <button type="submit" className={styles.submit} disabled={busy}>{busy ? t('Отправляем…') : t('Отправить приглашение')}</button>
      <button type="button" className={styles.link} disabled={busy} onClick={onDone}>{t('Отмена')}</button>
    </div>
  </form>
}

/** Список встреч команды: статус ответа сотрудника и отмена будущих встреч. */
export function MeetingList({ control }: { readonly control: MeetingsControl }) {
  const { t, lang } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = useNow()
  const sorted = [...control.list].sort((a, b) => Number(isUpcoming(b, now)) - Number(isUpcoming(a, now)) || (isUpcoming(a, now) ? Date.parse(a.at) - Date.parse(b.at) : Date.parse(b.at) - Date.parse(a.at)))
  async function cancel(id: string) {
    setBusy(true); setError(null)
    try { await control.cancel(id) } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <section className={styles.list} aria-labelledby="meetings-title">
    <h3 id="meetings-title">{t('Встречи с сотрудниками')}</h3>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    {sorted.length === 0 ? <p className={styles.hint}>{t('Встреч пока нет. Если у сотрудника показатель ниже нормы, в таблице появится кнопка «Назначить беседу».')}</p>
      : <ul>{sorted.map((item) => <li key={item.id}>
        <div><strong>{t(item.employeeName)}</strong><span>{formatMeetingDate(item.at, lang)}</span></div>
        <span className={styles.chip} data-status={item.status}>{t(STATUS_TEXT[item.status])}{item.status === 'accepted' && !isUpcoming(item, now) ? t(' · прошла') : ''}</span>
        {item.message && <p>{t(item.message)}</p>}
        {isUpcoming(item, now) && <button type="button" className={styles.link} disabled={busy} onClick={() => { void cancel(item.id) }} aria-label={t('Отменить встречу с {employeeName}', { employeeName: item.employeeName })}>{t('Отменить')}</button>}
      </li>)}</ul>}
  </section>
}
