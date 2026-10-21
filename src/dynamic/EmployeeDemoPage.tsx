import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DEMO_EMPLOYEE_ID } from '../content/dynamic-demo'
import { TEAM_NAME } from '../content/team'
import { TeamPage } from '../features/team/TeamPage'
import { useI18n } from '../i18n/context'
import { msg } from '../i18n/translate'
import type { AvatarChoice } from '../storage/avatar'
import { ActionLink, Page } from '../ui/primitives'
import { DevelopmentRoute } from './DynamicDevelopmentPage'
import { DynamicProfile } from './DynamicResultsPage'
import { buildDemoEmployee, buildDemoTeam } from './demo'
import { teamMemberFromDynamic } from './team-member'
import profileStyles from './DynamicProfile.module.css'
import styles from './DemoPages.module.css'

const VIEWS = [
  { id: 'profile', label: msg('Профиль'), path: '/demo' },
  { id: 'route', label: msg('Маршрут на 30 дней'), path: '/demo?view=route' },
  { id: 'team', label: msg('Моя команда'), path: '/demo?view=team' },
] as const
type View = typeof VIEWS[number]['id']

/**
 * Пример кабинета сотрудника по действующей методике: те же профиль, маршрут и экран команды, что видит сотрудник,
 * на вымышленных данных. Сервер, модель и хранилище не используются: отметки живут только в памяти страницы.
 */
export function EmployeeDemoPage() {
  const { t, lang } = useI18n()
  const [params] = useSearchParams()
  const view: View = VIEWS.find((item) => item.id === params.get('view'))?.id ?? 'profile'
  const employee = useMemo(() => buildDemoEmployee(t), [t])
  const [completedWeeks, setCompletedWeeks] = useState<readonly number[]>(employee.completedWeeks)
  const teamName = t(TEAM_NAME)
  const team = useMemo(() => buildDemoTeam(teamName, t), [teamName, t])
  const shown = useRef(view)
  // Ссылка «План развития» стоит внизу профиля: при смене раздела начинаем новый экран сверху, а фокус переводим в содержимое.
  useEffect(() => {
    if (shown.current === view) return
    shown.current = view
    window.scrollTo?.({ top: 0 })
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [view])
  const members = team.members.flatMap((member) => member.dynamicResult?.evaluation ? [teamMemberFromDynamic(member.id, t(member.name), member.dynamicResult)] : [])
  const avatars = Object.fromEntries(team.members.flatMap((member): [string, AvatarChoice][] => member.avatar ? [[member.id, { kind: 'custom', params: member.avatar }]] : []))

  return <div className={styles.demo} data-view={view}>
    <Page className={styles.bannerPage}>
      <div className={styles.banner} role="note" aria-label={t('Пример с вымышленными ответами')}>
        <span className={styles.tag} aria-hidden="true">{t('Пример')}</span>
        <div className={styles.bannerText}>
          <p className={styles.bannerTitle}>{t('Так выглядит кабинет сотрудника после теста')}</p>
          <p>{t('{name} ({role}) — вымышленный сотрудник. Ответы и оценки составлены вручную по рубрике методики, модель не вызывалась. Отметки здесь не сохраняются и не влияют на ваш профиль.',
            { name: t(employee.name), role: t(employee.attempt.jobRole).toLocaleLowerCase(lang) })}</p>
        </div>
        <nav className={styles.views} aria-label={t('Разделы примера')}>
          {VIEWS.map((item) => <Link key={item.id} to={item.path} aria-current={item.id === view ? 'page' : undefined}>{t(item.label)}</Link>)}
        </nav>
        <ActionLink className={styles.cta} to="/intro">{t('Пройти тест самому')}</ActionLink>
      </div>
    </Page>
    {view === 'profile' && <Page className={profileStyles.page}>
      <DynamicProfile attempt={employee.attempt} baseline={employee.baseline} previous={employee.baseline}
        demo={{ avatar: employee.avatar, planUrl: '/demo?view=route' }} />
    </Page>}
    {view === 'route' && <DevelopmentRoute attempt={employee.attempt} avatar={employee.avatar} completedWeeks={completedWeeks} comments={employee.comments}
      onToggle={(week) => setCompletedWeeks((items) => items.includes(week) ? items.filter((item) => item !== week) : [...items, week])}
      marksNote={t('В примере отметка видна только на этой странице и исчезнет после перезагрузки.')}
      retest={<Link to="/intro">{t('Пройти тест самому')}</Link>} profileUrl="/demo" />}
    {view === 'team' && <TeamPage actualMembers={members} teamName={teamName} ownResult={null} avatars={avatars} viewerId={DEMO_EMPLOYEE_ID}
      leaderName={t(team.managerName)} demo note={t('Команда «{team}», руководитель: {name}', { team: teamName, name: t(team.managerName) })} />}
  </div>
}
