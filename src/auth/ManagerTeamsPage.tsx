import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { questions } from '../content/questions'
import { memberFromResult } from '../domain/team'
import { teamMemberFromDynamic } from '../dynamic/team-member'
import type { AvatarChoice } from '../storage/avatar'
import { TeamPage } from '../features/team/TeamPage'
import { ResultsPage } from '../features/results/ResultsPage'
import { assessmentModule } from '../app/assessment-module'
import { useI18n } from '../i18n/context'
import { msg } from '../i18n/translate'
import { Button, Card, Page } from '../ui/primitives'
import { api, ApiError, post } from './api'
import type { MemberCard, RouteComment, TeamEmployee, TeamInfo } from './api'
import { useAuth } from './context'
import styles from './ManagerTeamsPage.module.css'
import { validateTeamName } from '../domain/account-validation'
import { clearFieldError, showFieldErrors } from './form-validation'
import { ManagerEmployeeCard } from './ManagerEmployeeCard'
import { AvatarFigure } from '../ui/AvatarFigure'
import { MEETINGS_CHANGED } from '../meetings/meetings'
import type { Meeting, MeetingsPayload } from '../meetings/meetings'
import type { MeetingsControl } from '../meetings/MeetingPlanner'

/** Инициалы для значка участника: «Иван Сотрудник» → «ИС». */
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')

type MemberState = 'pending' | 'done' | 'waiting'
const stateOf = (member: TeamEmployee): MemberState => !member.consented ? 'pending' : member.result || member.dynamicResult ? 'done' : 'waiting'
const STATE_TEXT: Readonly<Record<MemberState, string>> = {
  pending: msg('Ожидает согласия сотрудника'), done: msg('Тест пройден'), waiting: msg('Тест ещё не пройден'),
}

function TeamDetails({ id, onChanged }: { readonly id: string; readonly onChanged: () => void }) {
  const { t } = useI18n()
  const [data, setData] = useState<{ team: TeamInfo; members: TeamEmployee[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<TeamEmployee | null>(null)
  const [revision, setRevision] = useState(0)
  const [copyNotice, setCopyNotice] = useState(false)
  const [card, setCard] = useState<{ id: string; value: MemberCard | null; error: string | null } | null>(null)
  const [meetingList, setMeetingList] = useState<readonly Meeting[]>([])
  // Беседы команды: общий список руководителя, отфильтрованный по этой команде; обновляется и по событию из шапки.
  useEffect(() => {
    let live = true
    const refresh = () => {
      void api<MeetingsPayload>('/manager/meetings').then((value) => { if (live && Array.isArray(value.meetings)) setMeetingList(value.meetings.filter((item) => item.teamId === id)) })
        .catch(() => { /* Список бесед — дополнение: ошибка сети не мешает остальным данным команды. */ })
    }
    refresh()
    window.addEventListener(MEETINGS_CHANGED, refresh)
    return () => { live = false; window.removeEventListener(MEETINGS_CHANGED, refresh) }
  }, [id, revision])
  const meetingsControl: MeetingsControl = {
    list: meetingList,
    schedule: async (employeeId, at, message) => {
      const value = await api<MeetingsPayload>(`/teams/${id}/members/${encodeURIComponent(employeeId)}/meetings`, post({ at, message }))
      setMeetingList(value.meetings.filter((item) => item.teamId === id)); window.dispatchEvent(new Event(MEETINGS_CHANGED))
    },
    cancel: async (meetingId) => {
      const value = await api<MeetingsPayload>(`/manager/meetings/${encodeURIComponent(meetingId)}/cancel`, post({}))
      setMeetingList(value.meetings.filter((item) => item.teamId === id)); window.dispatchEvent(new Event(MEETINGS_CHANGED))
    },
  }
  useEffect(() => {
    let live = true
    api<{ team: TeamInfo; members: TeamEmployee[] }>(`/teams/${id}`)
      .then((value) => { if (live) { setData(value); setError(null); setSelected(null) } })
      .catch((reason: Error) => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [id, revision])
  // Карточка, маршрут и отметки загружаются отдельным запросом: сервер заново проверяет команду и согласие сотрудника.
  useEffect(() => {
    if (!selected) return
    let live = true
    api<MemberCard>(`/teams/${id}/members/${encodeURIComponent(selected.id)}/card`)
      .then((value) => { if (live) setCard({ id: selected.id, value, error: null }) })
      .catch((reason: Error) => { if (live) setCard({ id: selected.id, value: null, error: reason.message }) })
    return () => { live = false }
  }, [id, selected])
  const shownCard = card && card.id === selected?.id ? card : null
  const commentsPath = selected ? `/teams/${id}/members/${encodeURIComponent(selected.id)}/route-comments` : ''
  const withComments = (comments: readonly RouteComment[]) => setCard((current) => current && current.value?.dynamic
    ? { ...current, value: { ...current.value, dynamic: { ...current.value.dynamic, comments } } } : current)
  async function addComment(week: number, text: string) {
    const attemptId = shownCard?.value?.dynamic?.latest.id
    if (!attemptId) return
    const result = await api<{ comments: RouteComment[] }>(commentsPath, post({ attemptId, week, text }))
    withComments(result.comments)
  }
  async function deleteComment(commentId: string) {
    await api(`${commentsPath}/${encodeURIComponent(commentId)}`, { method: 'DELETE' })
    withComments((shownCard?.value?.dynamic?.comments ?? []).filter((comment) => comment.id !== commentId))
  }
  async function remove(member: TeamEmployee) {
    if (!window.confirm(t('Убрать сотрудника «{name}» из команды? Его личные результаты сохранятся.', { name: t(member.name) }))) return
    setBusy(true)
    try { await api(`/teams/${id}/members/${member.id}`, { method: 'DELETE' }); setRevision((value) => value + 1); onChanged() }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  if (!data) return <Card className={styles.sheet}>{error ? <><p role="alert" className={styles.error}>{t(error)}</p><Button onClick={() => setRevision((value) => value + 1)}>{t('Попробовать снова')}</Button></> : <p role="status">{t('Загружаем команду…')}</p>}</Card>
  const copy = () => {
    // true — код в буфере: пропуск можно «оторвать». При ошибке анимации нет, остаётся сообщение.
    return Promise.resolve().then(() => {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      return navigator.clipboard.writeText(data.team.inviteCode)
    }).then(() => { setCopyNotice(true); return true }).catch(() => { setError(t('Не удалось скопировать. Выделите код и скопируйте вручную.')); return false })
  }
  return <TeamSheet team={data.team} members={data.members} error={error} busy={busy} selected={selected} onSelect={setSelected}
    card={shownCard} onAddComment={addComment} onDeleteComment={deleteComment} meetings={meetingsControl}
    translationEndpoint={selected ? `/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(selected.id)}/card/translation` : undefined}
    onRefresh={() => setRevision((value) => value + 1)} onCopy={copy} copyNotice={copyNotice} onRemove={(member) => { void remove(member) }}
    passHint={t('Передайте код сотрудникам: они смогут указать его при регистрации или в своём кабинете.')} />
}

/**
 * Лист команды, карточка выбранного сотрудника и профиль команды. Данные и действия приходят снаружи:
 * из API кабинета руководителя или, в примере, из памяти страницы. Кнопка без обработчика не показывается.
 */
export function TeamSheet({ team, members, error = null, busy = false, selected, onSelect, card, onAddComment, onDeleteComment, meetings,
  onRefresh, onCopy, copyNotice = false, onRemove, passHint, demo = false, translationEndpoint }: {
  /** POST-адрес перевода карточки на казахский/английский; в примере перевода нет. */
  readonly translationEndpoint?: string | undefined
  readonly team: TeamInfo; readonly members: readonly TeamEmployee[]
  readonly error?: string | null; readonly busy?: boolean
  readonly selected: TeamEmployee | null; readonly onSelect: (member: TeamEmployee | null) => void
  /** Карточка выбранного сотрудника; null — ещё загружается. */
  readonly card: { readonly value: MemberCard | null; readonly error: string | null } | null
  readonly onAddComment?: ((week: number, text: string) => Promise<void>) | undefined
  readonly onDeleteComment?: ((id: string) => Promise<void>) | undefined
  readonly meetings?: MeetingsControl | undefined
  readonly onRefresh?: (() => void) | undefined
  /** Возвращает true, когда код скопирован: тогда верхний пропуск отрывается, под ним остаётся следующий. */
  readonly onCopy?: (() => Promise<boolean>) | undefined
  readonly copyNotice?: boolean
  readonly onRemove?: ((member: TeamEmployee) => void) | undefined
  readonly passHint: string
  /** Вымышленная команда: профиль команды подписан как пример. */
  readonly demo?: boolean
}) {
  const { t } = useI18n()
  const passRef = useRef<HTMLDivElement>(null)
  const [torn, setTorn] = useState<readonly number[]>([])
  const copyPass = () => {
    void onCopy?.().then((copied) => {
      if (!copied || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      setTorn((list) => [...list, Date.now()])
      // Следующий пропуск в пачке подтягивается на место, когда оторванный уже свободен (≈ середина анимации отрыва).
      passRef.current?.animate?.([{ transform: 'translateY(9px) scale(.965)', filter: 'brightness(.75)' }, { transform: 'none', filter: 'none' }],
        { duration: 420, delay: 530, easing: 'cubic-bezier(.34, 1.4, .64, 1)', fill: 'backwards' })
    })
  }
  const resultRef = useRef<HTMLElement>(null)
  // Карточка открывается ниже списка: переводим к ней взгляд, чтобы руководитель увидел, что изменилось.
  useEffect(() => { if (selected) resultRef.current?.scrollIntoView?.({ block: 'start' }) }, [selected])
  // В профиль команды попадает последний результат каждого участника с согласием: новая методика, а при её отсутствии — прежняя.
  const reportMembers = members.flatMap((member) => member.dynamicResult?.evaluation ? [teamMemberFromDynamic(member.id, t(member.name), member.dynamicResult)]
    : member.result ? [memberFromResult(member.id, member.name, t('Сотрудник'), member.result, questions)] : [])
  const mixedMethods = members.some((member) => member.dynamicResult?.evaluation) && members.some((member) => !member.dynamicResult?.evaluation && member.result)
  const teamAvatars = Object.fromEntries(members.flatMap((member): [string, AvatarChoice][] => member.avatar ? [[member.id, { kind: 'custom', params: member.avatar }]] : []))
  return <>
    <Card className={styles.sheet}>
      <div className={styles.sheetHead}>
        <div><h2>{team.name}</h2>
          <p className={styles.muted}>{t('Тест прошли: {done} из {total}', { done: members.filter((member) => member.result || member.dynamicResult).length, total: members.length })}</p></div>
        {onRefresh && <Button tone="secondary" disabled={busy} onClick={onRefresh}>{t('Обновить результаты')}</Button>}
      </div>
      {error && <p role="alert" className={styles.error}>{t(error)}</p>}
      <div className={styles.sheetBody}>
        {/* Код приглашения оформлен как отрывной пропуск: при копировании верхний отрывается по перфорации и улетает,
            а под ним уже лежит следующий. Оторванный — декоративная копия поверх настоящего, кнопка и фокус остаются на месте. */}
        <div className={styles.passStack}>
          <div ref={passRef} className={styles.pass}>
            <p className={styles.passTitle}>{t('Пропуск в команду')}</p>
            <code className={styles.code} aria-label={t('Код приглашения')}>{team.inviteCode}</code>
            {onCopy && <Button tone="secondary" className={styles.copy} onClick={copyPass}>{t('Скопировать код')}</Button>}
            {copyNotice && <p role="status" className={styles.copied}>{t('Код скопирован')}</p>}
            <p className={styles.passHint}>{passHint}</p>
          </div>
          {torn.map((id) => <div key={id} className={`${styles.pass} ${styles.passTorn}`} aria-hidden="true" inert
            onAnimationEnd={(event) => { if (event.target === event.currentTarget) setTorn((list) => list.filter((item) => item !== id)) }}>
            <p className={styles.passTitle}>{t('Пропуск в команду')}</p>
            <code className={styles.code}>{team.inviteCode}</code>
            <Button tone="secondary" className={styles.copy} tabIndex={-1}>{t('Скопировать код')}</Button>
            {copyNotice && <p className={styles.copied}>{t('Код скопирован')}</p>}
            <p className={styles.passHint}>{passHint}</p>
          </div>)}
        </div>
        <div className={styles.members}>
          <h3>{t('Участники: {count}', { count: members.length })}</h3>
          {members.some((member) => !member.consented) && <p className={styles.muted}>{t('Результаты видны только после согласия сотрудника. Он подтверждает его в своём кабинете.')}</p>}
          {members.length === 0 ? <p className={styles.empty}>{t('Пока никто не присоединился. Пригласите первого сотрудника по коду команды.')}</p>
            : <ul className={styles.list}>{members.map((member) => <li key={member.id} data-selected={selected?.id === member.id || undefined}>
              {member.avatar ? <span className={`${styles.badge} ${styles.badgeAvatar}`} aria-hidden="true"><AvatarFigure params={member.avatar} size={130} /></span>
                : <span className={styles.badge} aria-hidden="true">{initials(t(member.name))}</span>}
              <div className={styles.person}><strong>{t(member.name)}</strong><small>{member.email}</small></div>
              <span className={styles.state} data-state={stateOf(member)}>{t(STATE_TEXT[stateOf(member)])}</span>
              <div className={styles.actions}>
                {(member.result || member.dynamicResult) && <Button tone={selected?.id === member.id ? 'primary' : 'secondary'} aria-pressed={selected?.id === member.id}
                  aria-label={t('Результат {name}', { name: t(member.name) })} onClick={() => onSelect(member)}>{t('Результат')}</Button>}
                {onRemove && <Button tone="quiet" disabled={busy} aria-label={t('Убрать {name}', { name: t(member.name) })} onClick={() => onRemove(member)}>{t('Убрать')}</Button>}
              </div>
            </li>)}</ul>}
        </div>
      </div>
    </Card>
    {(selected?.result || selected?.dynamicResult) && <section ref={resultRef} className={styles.result} aria-label={t('Результат сотрудника')}>
      <div className={styles.resultHead}>
        <h2>{t('Результат: {name}', { name: selected.name })}</h2>
        <Button tone="secondary" onClick={() => onSelect(null)}>{t('Закрыть результат')}</Button>
      </div>
      {!card ? <p role="status" className={styles.muted}>{t('Загружаем карточку…')}</p>
        : card.error ? <p role="alert" className={styles.error}>{t(card.error)}</p>
        : card.value && (card.value.dynamic || card.value.legacy) && <>
          <ManagerEmployeeCard card={card.value} onAddComment={onAddComment} onDeleteComment={onDeleteComment} translationEndpoint={translationEndpoint} />
          {card.value.legacy && <details className={styles.legacy}>
            <summary>{t('Полный профиль прежней методики')}</summary>
            <div className={styles.embedded}><ResultsPage result={card.value.legacy.latest} questions={questions} personal={false}
              plan={assessmentModule.buildRecommendations?.(card.value.legacy.latest) ?? null} /></div>
          </details>}
        </>}
    </section>}
    {reportMembers.length > 0 && <div className={styles.embedded}><TeamPage actualMembers={reportMembers} teamName={team.name} ownResult={null} avatars={teamAvatars} meetings={meetings} demo={demo}
      note={mixedMethods ? t('Результаты новой и прежней методики объединены: проценты разных методик напрямую не сопоставимы.') : undefined} /></div>}
  </>
}

interface TestAccountsReset {
  readonly password: string
  readonly team: { readonly name: string; readonly inviteCode: string }
  readonly accounts: readonly { readonly name: string; readonly email: string; readonly role: 'manager' | 'employee' }[]
  /** Кнопку нажал тестовый руководитель: его команда пересоздана, страницу нужно загрузить заново. */
  readonly self: boolean
}

/** Сброс тестовых аккаунтов для проверки: доступен любому руководителю, чужие данные не затрагивает. */
function TestAccountsCard() {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<TestAccountsReset | null>(null)
  async function reset() {
    if (!window.confirm(t('Пересоздать тестовые аккаунты? Все их данные, включая пройденные тесты, отметки и беседы, вернутся к исходным.'))) return
    setBusy(true); setError(null)
    try {
      const value = await api<TestAccountsReset>('/test-accounts/reset', post({}))
      if (value.self) { window.location.reload(); return }
      setDone(value)
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <Card className={styles.testAccounts}>
    <div className={styles.testHead}>
      <div>
        <h2>{t('Тестовые аккаунты')}</h2>
        <p className={styles.muted}>{t('Руководитель, шесть сотрудников его команды с результатами и новичок без данных. Кнопка возвращает их в исходное состояние, остальные пользователи не затрагиваются.')}</p>
      </div>
      <Button tone="secondary" disabled={busy} onClick={() => { void reset() }}>{t(busy ? 'Пересоздаём…' : 'Сбросить тестовые аккаунты')}</Button>
    </div>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    {done && <div role="status" className={styles.testResult}>
      <p>{t('Готово. Пароль у всех: {password}. Код команды «{team}»: {code}', { password: done.password, team: done.team.name, code: done.team.inviteCode })}</p>
      <ul>{done.accounts.map((item) => <li key={item.email}><code>{item.email}</code> — {item.name}{item.role === 'manager' ? `, ${t('руководитель')}` : ''}</li>)}</ul>
    </div>}
  </Card>
}

export function ManagerTeamsPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    api<{ teams: TeamInfo[] }>('/teams').then(({ teams: next }) => {
      if (live) { setTeams(next); setSelectedId((id) => id || next[0]?.id || ''); setError(null) }
    }).catch((reason: Error) => { if (live) setError(reason.message) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [revision])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const validation = validateTeamName(new FormData(form).get('name'))
    if (!validation.ok) { setError(Object.values(validation.errors)[0] ?? null); showFieldErrors(form, validation.errors, t); return }
    const name = validation.value
    setBusy(true); setError(null)
    try {
      const { team } = await api<{ team: TeamInfo }>('/teams', post({ name }))
      setTeams((items) => [...items, team]); setSelectedId(team.id); form.reset()
    } catch (reason) {
      setError((reason as Error).message)
      if (reason instanceof ApiError) {
        flushSync(() => setBusy(false))
        showFieldErrors(form, reason.fields, t)
      }
    }
    finally { setBusy(false) }
  }
  const memberTotal = teams.reduce((sum, team) => sum + team.memberCount, 0)
  return <Page className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.intro}>
        <p className={styles.kicker}>{t('Кабинет руководителя')}</p>
        <h1>{t('Мои команды')}</h1>
        <p className={styles.lead}>{t('Здравствуйте, {name}. Создайте команду и пригласите сотрудников.', { name: user?.name ?? '' })}</p>
        {teams.length > 0 && <dl className={styles.totals}>
          <div><dt>{t('Команды')}</dt><dd>{teams.length}</dd></div>
          <div><dt>{t('Сотрудники')}</dt><dd>{memberTotal}</dd></div>
        </dl>}
      </div>
      <form noValidate className={styles.createForm} onInput={(event) => { clearFieldError(event); setError(null) }} onSubmit={(event) => { void create(event) }}>
        <h2>{t('Создать команду')}</h2>
        <label>{t('Название команды')}<input name="name" minLength={2} maxLength={80} required disabled={busy} placeholder={t('Например, Участок № 3')} /></label>
        <Button type="submit" className={styles.create} disabled={busy}>{t(busy ? 'Создаём…' : 'Создать команду')}</Button>
      </form>
    </header>

    {error && <p role="alert" className={styles.error}>{t(error)}</p>}

    <div className={styles.toolbar}>
      {loading ? <p role="status" className={styles.muted}>{t('Загружаем команды…')}</p>
        : teams.length > 0 && <nav className={styles.tabs} aria-label={t('Выберите команду')}>
          {teams.map((team) => <button key={team.id} type="button" className={styles.tab} aria-pressed={team.id === selectedId} onClick={() => setSelectedId(team.id)}>
            <span>{team.name}</span><b>{team.memberCount}</b>
          </button>)}
        </nav>}
      {!loading && error && <Button tone="secondary" onClick={() => setRevision((value) => value + 1)}>{t('Попробовать снова')}</Button>}
      <Link className={styles.demoLink} to="/team/demo">{t('Посмотреть пример команды')}</Link>
    </div>

    {selectedId ? <TeamDetails key={selectedId} id={selectedId} onChanged={() => setRevision((value) => value + 1)} />
      : !loading && <Card className={styles.sheet}><div className={styles.firstTeam}>
        <h2>{t('Ваша первая команда')}</h2>
        <p className={styles.muted}>{t('После создания здесь появятся код приглашения, участники и их результаты.')}</p>
      </div></Card>}
    <TestAccountsCard />
  </Page>
}
