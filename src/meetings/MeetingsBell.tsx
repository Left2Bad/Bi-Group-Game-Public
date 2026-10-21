import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { api, post } from '../auth/api'
import { useAuth } from '../auth/context'
import { MEETINGS_CHANGED, STATUS_TEXT, formatMeetingDate, isUpcoming } from './meetings'
import type { Meeting, MeetingsPayload } from './meetings'
import { useNow } from './useNow'
import type { QuestionReport, QuestionReportsPayload } from '../dynamic/ReportQuestion'
import styles from './MeetingsBell.module.css'
import { useI18n } from '../i18n/context'

const REFRESH_MS = 60_000
const BELL = 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'

/**
 * Кнопка уведомлений в шапке. Сотрудник видит приглашения на беседу и принимает или отклоняет их.
 * Руководитель видит, кто ответил на приглашение, список встреч и сообщения «Некорректный вопрос» от сотрудников бригады.
 */
export function MeetingsBell() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const role = user?.role
  const base = role === 'manager' ? '/manager/meetings' : '/meetings'
  const [data, setData] = useState<MeetingsPayload | null>(null)
  const [reports, setReports] = useState<QuestionReportsPayload | null>(null)
  const [open, setOpen] = useState(false)
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const [revision, setRevision] = useState(0)
  const reload = () => setRevision((value) => value + 1)
  useEffect(() => {
    if (!role) return
    let live = true
    const refresh = () => {
      void api<MeetingsPayload>(base).then((next) => { if (live && Array.isArray(next.meetings)) setData(next) })
        .catch(() => { /* Уведомления — дополнение: при ошибке сети список остаётся прежним. */ })
      if (role === 'manager') void api<QuestionReportsPayload>('/manager/question-reports').then((next) => { if (live && Array.isArray(next.reports)) setReports(next) })
        .catch(() => { /* Как и беседы: при ошибке остаётся прежний список. */ })
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    window.addEventListener(MEETINGS_CHANGED, refresh)
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(MEETINGS_CHANGED, refresh) }
  }, [role, base, revision])
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!(event.target instanceof Node && rootRef.current?.contains(event.target))) setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])
  const now = useNow()
  if (!role) return null

  const unread = (data?.unread ?? 0) + (reports?.unread ?? 0)
  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true); setError(null)
    const current = data?.meetings ?? []
    setFresh(new Set([...current.filter((item) => item.unseen).map((item) => item.id), ...(reports?.reports ?? []).filter((item) => item.unseen).map((item) => item.id)]))
    // Сообщения о некорректных вопросах считаются прочитанными при открытии панели, новые остаются подсвечены.
    if (reports?.unread) void api<QuestionReportsPayload>('/manager/question-reports/seen', post({})).then(setReports).catch(() => { /* Повторится при следующем открытии. */ })
    // Ответы и отмены считаются просмотренными, как только панель открыта; неотвеченные приглашения остаются в счётчике.
    if (current.some((item) => item.unseen && (role === 'manager' || item.status === 'cancelled'))) {
      try { setData(await api<MeetingsPayload>(`${base}/seen`, post({}))) } catch { /* Повторится при следующем открытии. */ }
    } else reload()
  }
  async function act(work: () => Promise<MeetingsPayload>) {
    setBusy(true); setError(null)
    try { setData(await work()); window.dispatchEvent(new Event(MEETINGS_CHANGED)) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  const respond = (meeting: Meeting, response: 'accepted' | 'declined') => act(() => api<MeetingsPayload>(`/meetings/${meeting.id}`, { method: 'PUT', body: JSON.stringify({ response }) }))
  const cancel = (meeting: Meeting) => act(() => api<MeetingsPayload>(`/manager/meetings/${meeting.id}/cancel`, post({})))
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Escape' && open) { setOpen(false); buttonRef.current?.focus() } }

  const meetings = data?.meetings ?? []
  const upcoming = meetings.filter((item) => isUpcoming(item, now))
  const others = meetings.filter((item) => !isUpcoming(item, now)).reverse()
  const invitations = upcoming.filter((item) => item.status === 'pending')
  const news = meetings.filter((item) => fresh.has(item.id))

  return <div ref={rootRef} className={styles.bell} onKeyDown={onKeyDown} data-no-print>
    <button ref={buttonRef} type="button" className={styles.button} aria-expanded={open} aria-controls="meetings-panel"
      aria-label={unread > 0 ? t('Уведомления: {unread}', { unread }) : t('Уведомления')} onClick={() => { void toggle() }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={BELL} /></svg>
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <div id="meetings-panel" className={styles.panel} role="region" aria-label={t('Уведомления')}>
      <h2>{t('Уведомления')}</h2>
      {error && <p role="alert" className={styles.error}>{t(error)}</p>}
      {role === 'employee' ? <>
        {invitations.length > 0 && <section aria-label={t('Приглашения на беседу')}><h3>{t('Приглашения на беседу')}</h3>
          <ul className={styles.list}>{invitations.map((item) => <li key={item.id} className={styles.card} data-fresh>
            <p className={styles.title}><strong>{t(item.managerName)}</strong>{' '}{t('приглашает на беседу')}</p>
            <p className={styles.when}>{formatMeetingDate(item.at, lang)}</p>
            {item.message && <p className={styles.message}>{t(item.message)}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.accept} disabled={busy} onClick={() => { void respond(item, 'accepted') }} aria-label={t('Принять приглашение на {formatMeetingDate}', { formatMeetingDate: formatMeetingDate(item.at, lang) })}>{t('Принять')}</button>
              <button type="button" className={styles.decline} disabled={busy} onClick={() => { void respond(item, 'declined') }} aria-label={t('Отклонить приглашение на {formatMeetingDate}', { formatMeetingDate: formatMeetingDate(item.at, lang) })}>{t('Отклонить')}</button>
            </div></li>)}</ul></section>}
        {meetings.length > invitations.length && <section aria-label={t('Ваши беседы')}><h3>{t('Ваши беседы')}</h3>
          <ul className={styles.list}>{[...upcoming.filter((item) => item.status === 'accepted'), ...others].map((item) => <li key={item.id} className={styles.card} data-fresh={fresh.has(item.id) || undefined}>
            <p className={styles.title}><strong>{t(item.managerName)}</strong> · {formatMeetingDate(item.at, lang)}</p>
            <p className={styles.status} data-status={item.status}>{item.status === 'pending' ? t('Срок ответа прошёл') : t(STATUS_TEXT[item.status])}</p></li>)}</ul></section>}
        {meetings.length === 0 && <p className={styles.empty}>{t('Уведомлений нет.')}</p>}
      </> : <>
        {(reports?.reports.length ?? 0) > 0 && <section aria-label={t('Некорректные вопросы')}><h3>{t('Некорректные вопросы')}</h3>
          <ul className={styles.list}>{reports!.reports.map((item) => <ReportCard key={item.id} report={item} fresh={fresh.has(item.id)} />)}</ul></section>}
        {news.length > 0 && <section aria-label={t('Новые ответы')}><h3>{t('Новые ответы')}</h3>
          <ul className={styles.list}>{news.map((item) => <li key={item.id} className={styles.card} data-fresh>
            <p className={styles.title}><strong>{t(item.employeeName)}</strong>: {item.status === 'accepted' ? t('приглашение принято') : t('приглашение отклонено')}</p>
            <p className={styles.when}>{t('Встреча {date}', { date: formatMeetingDate(item.at, lang) })}</p></li>)}</ul></section>}
        <section aria-label={t('Список встреч')}><h3>{t('Список встреч')}</h3>
          {meetings.length === 0 ? <p className={styles.empty}>{t('Встреч пока нет. Назначить беседу можно в разделе «Качества сотрудников» профиля команды.')}</p>
            : <ul className={styles.list}>{[...upcoming, ...others].map((item) => <li key={item.id} className={styles.card}>
              <p className={styles.title}><strong>{t(item.employeeName)}</strong> · {formatMeetingDate(item.at, lang)}</p>
              <p className={styles.status} data-status={item.status}>{t(STATUS_TEXT[item.status])}{item.status === 'accepted' && Date.parse(item.at) < now ? t(' · встреча прошла') : ''}</p>
              {isUpcoming(item, now) && <button type="button" className={styles.link} disabled={busy} onClick={() => { void cancel(item) }} aria-label={t('Отменить встречу с {employeeName}', { employeeName: item.employeeName })}>{t('Отменить')}</button>}
            </li>)}</ul>}
        </section>
      </>}
    </div>}
  </div>
}

/** Сообщение «Некорректный вопрос»: тема, кто и когда прислал, сам вопрос и варианты ответа. */
function ReportCard({ report, fresh }: { readonly report: QuestionReport; readonly fresh: boolean }) {
  const { t, lang } = useI18n()
  const { question } = report
  return <li className={`${styles.card} ${styles.report}`} data-fresh={fresh || undefined}>
    <p className={styles.subject}><span aria-hidden="true">⚑</span>{report.subject}</p>
    <p className={styles.title}>{t('От')}{' '}<strong>{report.employeeName}</strong>{report.teamName ? ` · ${report.teamName}` : ''}</p>
    <p className={styles.when}>{formatMeetingDate(report.reportedAt, lang)}</p>
    <blockquote className={styles.question}>
      {question.context && <p className={styles.context}>{question.context}</p>}
      <p>{question.text}</p>
      {question.options && <ol className={styles.options}>{question.options.map((option, index) => <li key={index}><b>{String.fromCharCode(65 + index)}</b>{option}</li>)}</ol>}
      {question.kind === 'open' && <p className={styles.kind}>{t('Открытый вопрос')}</p>}
    </blockquote>
  </li>
}
