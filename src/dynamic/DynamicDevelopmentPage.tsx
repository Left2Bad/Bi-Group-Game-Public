import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../auth/api'
import type { RouteComment } from '../auth/api'
import { useTraitLabels } from '../ui/use-labels'
import { Button, Card, Eyebrow, Page, SectionHeading } from '../ui/primitives'
import type { DynamicAttempt } from './domain'
import { useLocalizedAttempt } from './use-localized-attempt'
import { getArchetype } from '../domain/archetype'
import { preferenceProfile } from './presentation'
import { planDeadline, planWeeks } from './manager-card'
import { VENUES, skillLearning, traitLearning } from './learning'
import { ProfileAvatar } from '../ui/ProfileAvatar'
import { useAvatarChoice } from '../ui/use-avatar'
import { STICKER_COLORS } from '../ui/figure-geometry'
import type { AvatarChoice } from '../storage/avatar'
import { FlipCard } from '../ui/FlipCard'
import styles from '../features/development/DevelopmentPage.module.css'
import study from './StudyCards.module.css'
import road from './RoutePath.module.css'
import { RoutePath } from './RoutePath'
import { useI18n } from '../i18n/context'
import { dateLocale } from '../i18n/translate'

/** Цвета карточек «Что ещё изучить» по кругу: синий, жёлтый, бирюзовый, розовый. */
const ACCENTS = ['#5db5ff', '#ffd166', '#5be0a8', '#ff8fb1'] as const
/** Значки карточек: каска, линейка, чертёж, ключ. */
const BADGES = [
  'M4 17h16M5 17a7 7 0 0 1 14 0M12 10V6M9 7.5V11M15 7.5V11',
  'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  'M4 4h16v16H4zM4 9h16M9 9v11M13 13h4M13 16h4',
  'M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5L15 12l-3-3z',
] as const

export function DynamicDevelopmentPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const requestedId = params.get('attempt')
  const [attempt, setAttempt] = useState<DynamicAttempt | null>(null)
  const [completedWeeks, setCompletedWeeks] = useState<number[]>([])
  const [comments, setComments] = useState<RouteComment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [avatar] = useAvatarChoice()
  const shown = useLocalizedAttempt(attempt, attempt ? `/dynamic/attempts/${encodeURIComponent(attempt.id)}/translation` : null)
  useEffect(() => {
    let live = true
    const load = async () => {
      const id = requestedId ?? (await api<{ attempts: DynamicAttempt[] }>('/dynamic/attempts?status=completed&limit=1&offset=0'))
        .attempts.find((item) => item.status === 'completed')?.id
      if (!id) return
      const [a, actions, notes] = await Promise.all([
        api<{ attempt: DynamicAttempt }>(`/dynamic/attempts/${encodeURIComponent(id)}`),
        api<{ completedWeeks: number[] }>(`/dynamic/attempts/${encodeURIComponent(id)}/actions`),
        // Комментарии руководителя — дополнение: если они не загрузились, сам маршрут остаётся доступным.
        api<{ comments: RouteComment[] }>(`/dynamic/attempts/${encodeURIComponent(id)}/comments`).catch(() => ({ comments: [] as RouteComment[] })),
      ])
      if (live) { setAttempt(a.attempt); setCompletedWeeks(actions.completedWeeks); setComments(Array.isArray(notes.comments) ? notes.comments : []) }
    }
    void load().catch((reason: Error) => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [requestedId])
  async function toggle(week: number) {
    if (!attempt) return
    setBusy(true); setError(null)
    const completed = !completedWeeks.includes(week)
    try {
      await api(`/dynamic/attempts/${attempt.id}/actions/${week}`, { method: 'PUT', body: JSON.stringify({ completed }) })
      setCompletedWeeks((items) => completed ? [...items, week] : items.filter((item) => item !== week))
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  if (!attempt?.evaluation) return <Page className={styles.page}><Card><h1>{t('Маршрут развития')}</h1>{error && <p role="alert">{t(error)}</p>}
    <p>{t('Маршрут появится после завершения теста.')}</p><Link to="/assessment">{t('Перейти к тесту')}</Link></Card></Page>
  return <DevelopmentRoute attempt={shown ?? attempt} avatar={avatar} completedWeeks={completedWeeks} comments={comments} busy={busy} error={error}
    onToggle={(week) => { void toggle(week) }} marksNote={t('Отметки сохраняются в вашем аккаунте.')}
    retest={<Link to="/intro">{t('Пройти тест повторно')}</Link>}
    profileUrl={`${import.meta.env.MODE === 'playwright-legacy' ? '/results/new' : '/results'}?attempt=${encodeURIComponent(attempt.id)}`} />
}

/**
 * Маршрут на 30 дней по завершённой попытке. Отметки и комментарии руководителя приходят снаружи:
 * из аккаунта сотрудника или, в примере, из памяти страницы.
 */
export function DevelopmentRoute({ attempt, avatar, completedWeeks, comments, busy = false, error = null, onToggle, marksNote, retest, profileUrl }: {
  readonly attempt: DynamicAttempt; readonly avatar: AvatarChoice
  readonly completedWeeks: readonly number[]; readonly comments: readonly RouteComment[]
  readonly busy?: boolean; readonly error?: string | null; readonly onToggle: (week: number) => void
  /** Где хранится отметка: в аккаунте или только на этой странице. */
  readonly marksNote: string
  /** Действие в контрольной точке дня 30. */
  readonly retest: ReactNode
  readonly profileUrl: string
}) {
  const { t, lang } = useI18n()
  const { traitNames } = useTraitLabels()
  const timelineRef = useRef<HTMLOListElement>(null)
  const scores = attempt.evaluation!.traits
  const weeks = planWeeks(attempt, t)
  const studies = skillLearning(attempt, undefined, t)
  const deadline = (days: number) => new Date(planDeadline(attempt, days)).toLocaleDateString(dateLocale(lang), { timeZone: 'Asia/Qyzylorda' })
  const profile = getArchetype(preferenceProfile(attempt))
  return <Page className={styles.page}>
    <header className={styles.header}><Eyebrow>{t('От результата к практике')}</Eyebrow><h1>{t('Ваш путь на 30 дней')}</h1>
      <p>{t('Начните с одного действия. Примените его в рабочей ситуации и проверьте результат по понятному критерию.')}</p></header>
    <section className={styles.stickers} aria-labelledby="dynamic-stickers-title">
      <ProfileAvatar code={profile.code} choice={avatar} size={260} stickers={completedWeeks.length} />
      <div><p className={styles.stickerCount}>{t('Наклеек: {count} из {total}', { count: completedWeeks.length, total: 4 })}</p><h2 id="dynamic-stickers-title">{t('Наклейки на каске')}</h2>
        <ul className={styles.stickerSlots} aria-hidden="true">{weeks.map(({ week }, index) => <li key={week}
          style={completedWeeks.includes(week) ? { background: STICKER_COLORS[index % STICKER_COLORS.length], borderColor: 'transparent' } : undefined}>{week}</li>)}</ul>
        <p>{t('Отмеченная практика — наклейка на каске. {marksNote}', { marksNote })}</p></div>
    </section>
    <section className={styles.roadmap} aria-label={t('План на 30 дней')}><SectionHeading title={t('План на 30 дней')} description={t('Четыре недели: практика на объекте и тема для изучения в BuildEX или BI University. В конце — повторный тест, чтобы увидеть изменения.')} />
    {error && <p role="alert">{t(error)}</p>}
    <div className={road.track} data-detour={weeks.some(({ week }, index) => index > 0 && completedWeeks.includes(week) && !completedWeeks.includes(weeks[index - 1]!.week)) ? '' : undefined}>
    <ol className={styles.timeline} ref={timelineRef}>{weeks.map((item, index) => { const { week, trait } = item
      const score = scores[trait]
      const learn = traitLearning(trait)
      const done = completedWeeks.includes(week)
      const missing = weeks.slice(0, index).filter((earlier) => !completedWeeks.includes(earlier.week)).map((earlier) => earlier.week)
      return <li key={week} className={`${styles.week} ${road.week}`}>
        <div className={`${styles.weekMarker} ${road.marker}`} data-route-marker data-done={done ? '' : undefined}
          style={{ '--sticker': STICKER_COLORS[index % STICKER_COLORS.length] } as CSSProperties}><span>{week}</span></div>
        <div className={styles.weekBody} data-done={done ? '' : undefined}>
        <h2>{t('Неделя {week} · {trait}', { week, trait: traitNames[trait] })}</h2>
        <p className={styles.weekMeta}><span>{t('Дни {from}–', { from: index * 7 + 1 })}{index === 3 ? 30 : week * 7}</span>{item.mode === 'consolidation' ? t('Закрепление') : t('Развитие')}{' '}{t('· до {deadline}', { deadline: deadline(index === 3 ? 30 : week * 7) })}{done && <b className={road.doneBadge}>{t('выполнено')}</b>}</p>
        {done && missing.length > 0 && <p className={road.early}><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M-7 7 L-2 -9 L2 -9 L7 7 Z" fill="#ff8a3d" /><path d="M-4.4 0 L4.4 0 L5.3 3 L-5.3 3 Z" fill="#fff" /></svg>
          <span>{t('Неделя выполнена вне очереди. Дорога к ней достроится, когда вы отметите')}{' '}{missing.length === 1 ? t('неделю {missing}', { missing: missing[0]! }) : t('недели {list}', { list: missing.join(` ${t('и')} `) })}.</span></p>}
        <p><strong>{t('Что уже получается:')}</strong> {t(score.strength)}</p>
        <p className={styles.weekAction}><strong>{t('Практика:')}</strong> {t(item.action)}</p>
        <p className={styles.weekCriterion}><strong>{t('Как проверить:')}</strong> {t(item.successCriterion)}</p>
        <div className={styles.lesson}><strong>{t('Опора на сильную сторону:')}</strong><p>{t(item.support)}</p></div>
        <div className={styles.lesson}><strong>{t('Изучить в {name}: {topic}', { name: VENUES[learn.venue].name, topic: t(learn.topic) })}</strong>
          <ul className={styles.studyList}>{learn.study.map((line) => <li key={line}>{t(line)}</li>)}</ul></div>
        {comments.some((comment) => comment.week === week) && <div className={styles.managerNotes} role="group" aria-label={t('Комментарии руководителя к неделе {week}', { week })}>
          <strong>{t('Комментарий руководителя')}</strong>
          {comments.filter((comment) => comment.week === week).map((comment) => <p key={comment.id}><span>{t(comment.managerName)} · {new Date(comment.createdAt).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', timeZone: 'Asia/Qyzylorda' })}</span>{t(comment.text)}</p>)}
        </div>}
        {index === 3 && <div className={styles.checkpoint}><strong>{t('Контрольная точка — день 30')}</strong><p>{t('В конце месяца пройдите тест повторно и сравните ответы с этой попыткой.')}</p>{retest}</div>}
        <Button tone="secondary" disabled={busy} onClick={() => onToggle(week)}>
          {completedWeeks.includes(week) ? t('Отменить отметку') : t('Отметить выполнение')}
        </Button>
      </div></li> })}</ol>
    <RoutePath listRef={timelineRef} weeks={weeks.map(({ week }) => week)} completed={completedWeeks} /></div></section>
    {studies.length > 0 && <section className={styles.roadmap} aria-label={t('Что ещё изучить')}>
      <SectionHeading title={t('Что ещё изучить для роста навыков')}
        description={t('Профессиональные навыки из ваших ответов, начиная с самых слабых. Указаны рекомендуемые темы, а не запись на конкретный курс: актуальные программы уточните у наставника или в учебном центре.')} />
      <p className={study.hint}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></svg>{t('Нажмите на карточку или потяните её в сторону: на обороте — что именно изучить и где.')}</p>
      <div className={study.grid}>{studies.map((item, index) => <FlipCard key={item.skillName} label={t(item.skillName)} className={study.card}
        toBackLabel={t('Что изучить')} toFrontLabel={t('Назад')} hintDelay={index === 0 ? 300 : undefined}
        style={{ '--accent': ACCENTS[index % ACCENTS.length] } as CSSProperties}
        front={<div className={study.front}>
          <span className={study.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span className={study.stripe} aria-hidden="true" />
          <div className={study.top}><span className={study.venue}>{VENUES[item.venue].name}</span>
            <span className={study.badge} aria-hidden="true"><svg viewBox="0 0 24 24"><path d={BADGES[index % BADGES.length]} /></svg></span></div>
          <p className={study.skill}>{t(item.skillName)}</p>
          <h3>{t(item.topic)}</h3>
          <div className={study.why}><strong>{t('Почему')}</strong><p>{item.reason}</p></div>
          <span className={study.bolts} aria-hidden="true"><i /><i /><i /></span>
        </div>}
        back={<div className={study.back}>
          <p className={study.skill}>{t(item.skillName)} · {VENUES[item.venue].name}</p>
          <h3>{t('Что изучить')}</h3>
          <ol className={study.steps}>{item.study.map((line) => <li key={line}>{t(line)}</li>)}</ol>
          <a className={study.link} href={VENUES[item.venue].url} target="_blank" rel="noreferrer">{t('Открыть {name}', { name: VENUES[item.venue].name })}{' '}<span aria-hidden="true">↗</span></a>
        </div>} />)}</div>
    </section>}
    <aside className={styles.learning}><h2>{t('Обсудите план с наставником')}</h2><p>{t('Выберите рабочие задачи для практик и уточните, какие программы')}{' '}<a href={VENUES.BuildEX.url} target="_blank" rel="noreferrer">BuildEX</a>{' '}{t('({focus}) и', { focus: t(VENUES.BuildEX.focus) })}{' '}<a href={VENUES.BIU.url} target="_blank" rel="noreferrer">BI University</a>{' '}{t('({focus}) сейчас доступны по этим темам.', { focus: t(VENUES.BIU.focus) })}</p></aside>
    <nav className={styles.links} aria-label={t('Действия с маршрутом')}><Link to={profileUrl}>{t('Вернуться к профилю')}</Link></nav>
  </Page>
}
