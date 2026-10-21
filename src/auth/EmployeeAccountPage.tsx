import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { CSSProperties, FormEvent } from 'react'
import { useI18n } from '../i18n/context'
import { msg } from '../i18n/translate'
import { ActionLink, Button, Card, Eyebrow, Page } from '../ui/primitives'
import { api, ApiError, post } from './api'
import type { Membership, TeamEmployee } from './api'
import { questions } from '../content/questions'
import { memberFromResult } from '../domain/team'
import { teamMemberFromDynamic } from '../dynamic/team-member'
import type { AvatarChoice } from '../storage/avatar'
import { TeamPage } from '../features/team/TeamPage'

type Colleague = Pick<TeamEmployee, 'id' | 'name' | 'result' | 'dynamicResult' | 'avatar'>
import { useAuth } from './context'
import styles from './AccountPage.module.css'
import { validateConsent, validateInviteCode } from '../domain/account-validation'
import { clearFieldError, showFieldErrors } from './form-validation'
import { ConsentField } from './ConsentField'
import { AvatarFigure } from '../ui/AvatarFigure'
import { useAvatarChoice } from '../ui/use-avatar'

/** Как устроена работа в команде: три шага справа от формы, пока сотрудник не в команде. */
const TEAM_STEPS = [msg('Получите код команды у руководителя'), msg('Введите код и подтвердите согласие'), msg('Руководитель видит результаты и оставляет комментарии к маршруту')] as const

export function EmployeeAccountPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [team, setTeam] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [loadedColleagues, setColleagues] = useState<{ readonly teamId: string; readonly members: Colleague[] } | null>(null)
  const [avatar] = useAvatarChoice()
  useEffect(() => {
    let live = true
    api<{ team: Membership | null }>('/membership').then((data) => { if (live) { setTeam(data.team); setError(null) } })
      .catch((reason: Error) => { if (live) setError(reason.message) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [revision])
  // Бригада видна только после собственного согласия: сервер проверяет это ещё раз.
  useEffect(() => {
    if (!team?.consented) return
    let live = true
    api<{ members: Colleague[] }>('/membership/team').then((data) => { if (live) setColleagues({ teamId: team.id, members: data.members }) })
      .catch((reason: Error) => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [team])
  const colleagues = team?.consented && loadedColleagues?.teamId === team.id ? loadedColleagues.members : []
  const reportMembers = colleagues.flatMap((member) => member.dynamicResult?.evaluation ? [teamMemberFromDynamic(member.id, member.name, member.dynamicResult)]
    : member.result ? [memberFromResult(member.id, member.name, t('Сотрудник'), member.result, questions)] : [])
  const teamAvatars = Object.fromEntries(colleagues.flatMap((member): [string, AvatarChoice][] => member.avatar ? [[member.id, { kind: 'custom', params: member.avatar }]] : []))
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const validation = validateInviteCode(data.get('inviteCode'))
    if (!validation.ok) { setError(Object.values(validation.errors)[0] ?? null); showFieldErrors(form, validation.errors, t); return }
    const consent = validateConsent(data.get('consent') === 'on')
    if (!consent.ok) { setError(Object.values(consent.errors)[0] ?? null); showFieldErrors(form, consent.errors, t); return }
    const inviteCode = validation.value
    setBusy(true); setError(null)
    try { await api('/membership', post({ inviteCode, consent: true })); setRevision((value) => value + 1) }
    catch (reason) {
      setError((reason as Error).message)
      if (reason instanceof ApiError) {
        flushSync(() => setBusy(false))
        showFieldErrors(form, reason.fields, t)
      }
    }
    finally { setBusy(false) }
  }
  async function confirmConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const consent = validateConsent(new FormData(form).get('consent') === 'on')
    if (!consent.ok) { setError(Object.values(consent.errors)[0] ?? null); showFieldErrors(form, consent.errors, t); return }
    setBusy(true); setError(null)
    try { await api('/membership/consent', { method: 'PUT', body: JSON.stringify({ consent: true }) }); setRevision((value) => value + 1) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  async function leave() {
    if (!window.confirm(t('Выйти из команды? Руководитель потеряет доступ к вашим результатам.'))) return
    setBusy(true); setError(null)
    try { await api('/membership', { method: 'DELETE' }); setTeam(null) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  if (team?.consented && reportMembers.length > 0) return <>
    {error && <Page><p role="alert" className={styles.error}>{t(error)}</p></Page>}
    <TeamPage actualMembers={reportMembers} teamName={team.name} ownResult={null} avatars={teamAvatars} viewerId={user?.id} leaderName={team.managerName}
      note={t('Команда «{team}», руководитель: {name}', { team: team.name, name: team.managerName })}
      headerAction={<Button tone="secondary" disabled={busy} onClick={() => { void leave() }}>{t('Выйти из команды')}</Button>} />
  </>
  return <Page className={styles.page}>
    <header className={styles.heading}>
      <div className={styles.identity}>
        {avatar.kind === 'custom' && <span className={styles.hero} aria-hidden="true"><AvatarFigure params={avatar.params} size={236} /></span>}
        <div><Eyebrow>{t('Кабинет сотрудника')}</Eyebrow><h1>{user?.name}</h1><p className={styles.muted}>{user?.email}</p></div>
      </div>
      <ActionLink to="/intro">{t('Перейти к тесту')}</ActionLink></header>
    <div className={team ? undefined : styles.joinLayout}>
    <Card className={styles.teamCard}><h2>{t('Моя команда')}</h2>
      {loading ? <p role="status">{t('Загружаем команду…')}</p> : team ? <>
        <h3>{team.name}</h3><p>{t('Руководитель: {name}', { name: team.managerName })}</p>
        {team.consented
          ? <p className={styles.notice}>{t('Вы дали согласие: руководитель видит ваши завершённые результаты, их динамику и аватар. При выходе из команды доступ прекращается.')}</p>
          : <form noValidate className={styles.form} onInput={(event) => { clearFieldError(event); setError(null) }} onSubmit={(event) => { void confirmConsent(event) }}>
            <p className={styles.notice}>{t('Вы вступили в команду до появления согласия. Пока вы его не подтвердите, руководитель не видит ваши результаты.')}</p>
            <ConsentField className={styles.consent} disabled={busy} />
            <Button type="submit" disabled={busy}>{t('Подтвердить согласие')}</Button>
          </form>}
        <Button tone="secondary" disabled={busy} onClick={() => { void leave() }}>{t('Выйти из команды')}</Button>
      </> : <form noValidate className={styles.form} onInput={(event) => { clearFieldError(event); setError(null) }} onSubmit={(event) => { void join(event) }}>
        <p>{t('Присоединитесь по коду руководителя. Проходить тест можно и без команды.')}</p>
        <label>{t('Код команды')}<input name="inviteCode" required maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} /></label>
        <ConsentField className={styles.consent} disabled={busy} />
        <Button type="submit" disabled={busy}>{t(busy ? 'Подождите…' : 'Присоединиться')}</Button>
      </form>}
      {error && <><p role="alert" className={styles.error}>{t(error)}</p><Button tone="secondary" onClick={() => setRevision((value) => value + 1)}>{t('Обновить')}</Button></>}
    </Card>
    {!loading && !team && <aside className={styles.howTo} aria-labelledby="team-how-title">
      <h2 id="team-how-title">{t('Как работает команда')}</h2>
      <ol>{TEAM_STEPS.map((step, index) => <li key={step} style={{ '--i': index } as CSSProperties}><b aria-hidden="true">{index + 1}</b>{t(step)}</li>)}</ol>
      <p className={styles.muted}>{t('Согласие можно отозвать: выйдите из команды, и руководитель потеряет доступ к результатам.')}</p>
    </aside>}
    </div>
  </Page>
}
