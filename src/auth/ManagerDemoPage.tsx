import { useMemo, useState } from 'react'
import { TEAM_NAME } from '../content/team'
import { buildDemoTeam, demoMeetings } from '../dynamic/demo'
import type { DemoTeam } from '../dynamic/demo'
import { useI18n } from '../i18n/context'
import type { MeetingsControl } from '../meetings/MeetingPlanner'
import type { Meeting } from '../meetings/meetings'
import { ActionLink, Page } from '../ui/primitives'
import type { MemberCard, RouteComment, TeamEmployee } from './api'
import { useAuth } from './context'
import { TeamSheet } from './ManagerTeamsPage'
import styles from './ManagerTeamsPage.module.css'

/**
 * Пример кабинета руководителя по действующей методике: тот же лист команды, карточки развития и профиль команды,
 * что в /team, на вымышленной команде. Комментарии и беседы меняются только в памяти страницы и никому не отправляются.
 */
export function ManagerDemoPage() {
  const { t } = useI18n()
  const teamName = t(TEAM_NAME)
  const demo = useMemo(() => buildDemoTeam(teamName, t), [teamName, t])
  return <ManagerDemo key={teamName} demo={demo} />
}

function ManagerDemo({ demo }: { readonly demo: DemoTeam }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [selected, setSelected] = useState<TeamEmployee | null>(null)
  const [cards, setCards] = useState<Readonly<Record<string, MemberCard>>>(demo.cards)
  const [meetingList, setMeetingList] = useState<readonly Meeting[]>(() => demoMeetings(demo, Date.now(), t))
  const meetings: MeetingsControl = {
    list: meetingList,
    schedule: async (employeeId, at, message) => {
      const member = demo.members.find((item) => item.id === employeeId)!
      setMeetingList((list) => [...list, { id: `demo-meeting-new-${list.length + 1}`, teamId: demo.team.id, teamName: demo.team.name, employeeId,
        employeeName: member.name, managerName: demo.managerName, at, message, status: 'pending', createdAt: new Date().toISOString(), respondedAt: null, unseen: false }])
    },
    cancel: async (meetingId) => setMeetingList((list) => list.map((item) => item.id === meetingId ? { ...item, status: 'cancelled' } : item)),
  }
  const changeComments = (change: (comments: readonly RouteComment[]) => readonly RouteComment[]) => {
    const id = selected?.id
    if (!id) return
    setCards((current) => {
      const card = current[id]
      return card?.dynamic ? { ...current, [id]: { ...card, dynamic: { ...card.dynamic, comments: change(card.dynamic.comments) } } } : current
    })
  }
  const card = selected ? { value: cards[selected.id] ?? null, error: null } : null
  return <Page className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.intro}>
        <p className={styles.kicker}>{t('Пример кабинета руководителя')}</p>
        <h1>{t('Мои команды')}</h1>
        <p className={styles.lead}>{t('Так видит участок руководитель {name}: команда, результаты сотрудников, их маршруты и беседы. Люди и данные вымышленные.', { name: t(demo.managerName) })}</p>
        <dl className={styles.totals}>
          <div><dt>{t('Команды')}</dt><dd>1</dd></div>
          <div><dt>{t('Сотрудники')}</dt><dd>{demo.members.length}</dd></div>
        </dl>
      </div>
      <div className={styles.createForm}>
        <h2>{t('Это пример')}</h2>
        <p className={styles.muted}>{t('Откройте результат сотрудника, оставьте комментарий к неделе маршрута или назначьте беседу. В примере ничего не отправляется и всё исчезнет после перезагрузки.')}</p>
        {!user && <ActionLink className={styles.create} to="/register?role=manager">{t('Создать кабинет руководителя')}</ActionLink>}
        {user?.role === 'manager' && <ActionLink className={styles.create} to="/team">{t('Перейти к своим командам')}</ActionLink>}
      </div>
    </header>

    <div className={styles.toolbar}>
      <nav className={styles.tabs} aria-label={t('Выберите команду')}>
        <button type="button" className={styles.tab} aria-pressed="true"><span>{demo.team.name}</span><b>{demo.members.length}</b></button>
      </nav>
    </div>

    <TeamSheet team={demo.team} members={demo.members} selected={selected} onSelect={setSelected} card={card} meetings={meetings} demo
      onAddComment={async (week, text) => changeComments((comments) => [...comments, { id: `demo-comment-new-${Date.now()}`, week, text: text.trim(),
        managerName: demo.managerName, createdAt: new Date().toISOString(), mine: true }])}
      onDeleteComment={async (commentId) => changeComments((comments) => comments.filter((comment) => comment.id !== commentId))}
      passHint={t('В рабочем кабинете здесь код вашей команды: сотрудники вводят его при регистрации или в своём кабинете.')} />
  </Page>
}
