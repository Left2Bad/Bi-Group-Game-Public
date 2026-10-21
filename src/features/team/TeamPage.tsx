import { Fragment, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { questions, scoring } from '../../content/questions'
import { TEAM, TEAM_NAME } from '../../content/team'
import { buildTeamExport, TEAM_CSV_HEADER, teamCsvRows, teamFileName, toCsv, toJson } from '../../domain/export'
import { buildTeamMembers, buildTeamReport, memberFromResult } from '../../domain/team'
import type { TeamMember } from '../../domain/team'
import { DATA_VERSIONS, TRAIT_IDS } from '../../domain/types'
import type { AssessmentResult, TraitId } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { msg } from '../../i18n/translate'
import { ExportActions } from '../../ui/ExportActions'
import type { ExportFile, ExportFormat } from '../../ui/ExportActions'
import { Page } from '../../ui/primitives'
import { ProfileTabs } from '../results/ProfileTabs'
import { useMaxWidth } from '../../meetings/useMaxWidth'
import { MeetingCell, MeetingForm, MeetingList } from '../../meetings/MeetingPlanner'
import type { MeetingsControl } from '../../meetings/MeetingPlanner'
import { RadarChart } from '../../ui/RadarChart'
import { traitColors } from '../../ui/trait-labels'
import { displayLevel } from '../../dynamic/presentation'
import insights from '../../dynamic/ProfileInsights.module.css'
import { useTraitLabels } from '../../ui/use-labels'
import { ProfileAvatar } from '../../ui/ProfileAvatar'
import { useAvatarChoice } from '../../ui/use-avatar'
import { TEST_AVATAR } from '../../storage/avatar'
import type { AvatarChoice } from '../../storage/avatar'
import { consistencyLabels } from '../results/consistency-labels'
import styles from './TeamPage.module.css'

/** Последовательная шкала одного оттенка: светлее — ниже процент. Текст в ячейке всегда цифрой. */
const BANDS = [
  { min: 0, label: msg('до 40%') }, { min: 40, label: msg('40–54%') }, { min: 55, label: msg('55–66%') },
  { min: 67, label: msg('67–74%') }, { min: 75, label: msg('от 75%') },
] as const
const bandOf = (percent: number) => BANDS.reduce((found, band, index) => percent >= band.min ? index : found, 0)

const consistencyIcons = { consistent: '✓', check: '!', low: '!!' } as const

const DEMO_COMPLETED_AT = '2026-10-10T08:00:00.000Z'

export function TeamPage({ ownResult, actualMembers, teamName = TEAM_NAME, avatars, note, meetings, viewerId, headerAction, leaderName, demo = false }: {
  readonly ownResult: AssessmentResult | null; readonly actualMembers?: readonly TeamMember[]; readonly teamName?: string
  /** Аватары участников по id; без аватара показывается персонаж по результату теста. */
  readonly avatars?: Readonly<Record<string, AvatarChoice>>
  /** Пояснение под заголовком, например про объединение результатов разных методик. */
  readonly note?: string | undefined
  /** Беседы руководителя: назначение и список. Без этого параметра (пример команды) разделов бесед нет. */
  readonly meetings?: MeetingsControl | undefined
  /** Экран сотрудника: его id среди участников. Включает сравнение «со мной / без меня» и скрывает выгрузку. */
  readonly viewerId?: string | undefined
  /** Кнопка справа от заголовка, например «Выйти из команды» у сотрудника. */
  readonly headerAction?: ReactNode
  /** Руководитель команды: показывается отдельно, в состав и расчёты бригады не входит. */
  readonly leaderName?: string | undefined
  /** Участники переданы, но вымышленные (пример по действующей методике): так это и подписывается, и отмечается в выгрузке. */
  readonly demo?: boolean
}) {
  const { t, code: showCode } = useI18n()
  const labels = useTraitLabels()
  const [includeOwn, setIncludeOwn] = useState(true)
  const [ownAvatar] = useAvatarChoice()
  const base = useMemo(() => buildTeamMembers(TEAM, { questions, scoring, versions: DATA_VERSIONS, completedAt: DEMO_COMPLETED_AT })
    .map((member) => ({ ...member, name: t(member.name) })), [t])
  const ownCompatible = ownResult !== null && ownResult.versions.scoring === DATA_VERSIONS.scoring
  const members = actualMembers?.map((member) => ({ ...member, name: t(member.name) })) ?? (ownCompatible && includeOwn
    ? [...base, memberFromResult('own', t('Вы'), t('Ваш последний результат'), ownResult, questions)] : base)
  const report = buildTeamReport(members)

  const avatarOf = (id: string) => id === 'own' ? ownAvatar : avatars?.[id] ?? TEST_AVATAR
  const [section, setSection] = useState<'overview' | 'employees' | 'impact'>('overview')
  // Раздел «Влияние»: выбранный сотрудник накладывается на средний профиль бригады.
  const [focusId, setFocusId] = useState<string | null>(null)
  const focused = members.find((member) => member.id === focusId) ?? null
  const focusValues = focused ? Object.fromEntries(TRAIT_IDS.map((id) => [id, focused.result.traits[id].percent])) as Record<TraitId, number> : null
  const focusOthers = focused ? members.filter((member) => member.id !== focused.id) : []
  const withoutFocus = focused && focusOthers.length > 0 ? buildTeamReport(focusOthers).average : null
  // На телефоне колонка «Беседа» уходит за край таблицы, поэтому действие показывается под именем сотрудника.
  const compact = useMaxWidth(720)
  const [planning, setPlanning] = useState<string | null>(null)
  const belowNorm = (member: TeamMember) => TRAIT_IDS.filter((id) => member.result.traits[id].level === 'priority')
    .map((id) => `${labels.traitNames[id]} ${member.result.traits[id].percent}%`)
  const hasConsistency = members.some((member) => member.consistency !== null)
  const leaders = TRAIT_IDS.map((id) => ({ id, member: members.reduce((best, member) => member.result.traits[id].percent > best.result.traits[id].percent ? member : best) }))
  const [showImpact, setShowImpact] = useState(false)
  const others = members.filter((member) => member.id !== viewerId)
  const withoutMe = viewerId && others.length > 0 && others.length < members.length ? buildTeamReport(others).average : null

  const fictional = actualMembers === undefined || demo
  const buildExport = (format: ExportFormat): ExportFile => {
    const data = buildTeamExport(report, { teamName, demo: fictional, exportedAt: new Date().toISOString() })
    return format === 'json'
      ? { filename: teamFileName(data, 'json'), mime: 'application/json', content: toJson(data) }
      : { filename: teamFileName(data, 'csv'), mime: 'text/csv', content: toCsv(TEAM_CSV_HEADER, teamCsvRows(data)) }
  }

  return <Page className={styles.page}>
    <header className={styles.header}>
      <p className={styles.kicker}>{t(viewerId ? 'Экран сотрудника' : 'Экран руководителя')}</p>
      <div className={styles.titleRow}><h1>{t('Профиль команды')}</h1>{headerAction}</div>
      <p>{demo ? t('Пример: команда «{team}» и её участники вымышленные. В рабочем кабинете здесь последние результаты сотрудников, которые согласились ими поделиться.', { team: teamName })
        : actualMembers ? t('Последние завершённые результаты участников команды «{team}».', { team: teamName })
        : t('{team}. Сотрудники вымышленные, их профили посчитаны той же формулой, что и ваш. В рабочей версии руководитель видит результаты тех, кто согласился ими поделиться.', { team: t(TEAM_NAME) })}</p>
      {note && <p role="note">{note}</p>}
      {actualMembers === undefined && ownCompatible && <label className={styles.toggle}><input type="checkbox" checked={includeOwn} onChange={(event) => setIncludeOwn(event.target.checked)} />
        {t('Добавить мой результат в команду')}</label>}
    </header>
    <ProfileTabs tabs={[{ id: 'overview', label: t('Обзор команды'), hint: t('бригада, радар, выводы') }, { id: 'employees', label: t('Качества сотрудников'), hint: meetings ? t('таблица и беседы') : t('таблица по людям') },
      ...(viewerId ? [] : [{ id: 'impact', label: t('Влияние на команду'), hint: t('сотрудник на фоне бригады') }])]}
      active={section} onChange={(id) => setSection(id as typeof section)} label={t('Разделы профиля команды')}>
    {section === 'overview' && <>

    <section className={styles.brigade} aria-labelledby="brigade-title">
      <h2 id="brigade-title">{t('Бригада: {count} человек', { count: members.length })}</h2>
      {leaderName && <p className={styles.leader}>{t('Руководитель: {name}', { name: leaderName })}</p>}
      <ul>{members.map((member) => <li key={member.id}>
        <ProfileAvatar code={member.archetype.code} choice={avatarOf(member.id)} size={170} />
        <strong>{member.name}</strong><span className={styles.code}>{showCode(member.archetype.code)}</span>
      </li>)}</ul>
    </section>

    <section className={styles.leaders} aria-labelledby="leaders-title">
      <h2 id="leaders-title">{t('Лучшие в бригаде')}</h2>
      <ul>{leaders.map(({ id, member }) => <li key={id} data-own={member.id === viewerId || undefined}>
        <span>{labels.traitNames[id]}</span><strong>{member.name}</strong><b>{member.result.traits[id].percent}%</b>
      </li>)}</ul>
    </section>

    {withoutMe && <section className={styles.impact} aria-label={t('Моё влияние на бригаду')}>
      <button type="button" className={styles.impactToggle} aria-expanded={showImpact} onClick={() => setShowImpact(!showImpact)}>{t('Как я влияю на бригаду')}</button>
      {showImpact && <><p>{t('Средний профиль бригады с вашим результатом и без него.')}</p>
        <ul>{TRAIT_IDS.map((id) => {
          const delta = report.average[id] - withoutMe[id]
          return <li key={id} data-sign={Math.sign(delta)}><span>{labels.traitNames[id]}</span>
            <span>{t('без вас {without}% → с вами {with}%', { without: withoutMe[id], with: report.average[id] })}</span>
            <b>{delta > 0 ? `+${delta}` : delta}</b></li>
        })}</ul></>}
    </section>}

    <section className={styles.overview} aria-label={t('Сводка команды')}>
      <div className={styles.radarBox}>
        <div className={styles.radarHead}><h2>{t('Средний профиль: {count} человек', { count: members.length })}</h2>
          <p>{t('Среднее по каждому качеству среди участников бригады.')}</p></div>
        <RadarChart tone="dark" colors={traitColors} values={report.average} labels={labels.traitNames} shortLabels={labels.traitShortNames}
          seriesLabel={t('средний профиль команды')} />
      </div>
      <div className={styles.insights}>
        {([
          { id: report.weakest, title: t('Зона роста команды'), text: t('У {count} из {total} человек это приоритет развития. Проведите командный разбор: «{title}», {minutes} минут на планёрке.',
            { count: report.priorityCount[report.weakest], total: members.length, title: t(report.workshop.title), minutes: report.workshop.minutes }) },
          { id: report.strongest, title: t('Опора команды'), text: t('Используйте это качество при распределении задач: давайте сложные эпизоды тем, у кого оно выражено сильнее.') },
        ] as const).map(({ id, title, text }) => {
          const value = report.average[id]
          const level = displayLevel(value)
          const values = members.map((member) => member.result.traits[id].percent)
          const low = Math.min(...values), high = Math.max(...values)
          return <article key={title} className={`${insights.traitPanel} ${insights.traitFace} ${insights.traitCompact}`} style={{ '--c': traitColors[id], '--p': value } as CSSProperties}>
            <div className={insights.traitTop}>
              <div><p className={insights.traitKicker}>{title}</p><h3 className={styles.statName}>{labels.traitNames[id]}</h3>
                <span className={insights.level} data-level={level}>{labels.levelNames[level]}</span></div>
              <div className={insights.gauge} role="img" aria-label={`${labels.traitNames[id]}: ${value}%`}>
                <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" /><circle cx="50" cy="50" r="42" pathLength="100" /></svg>
                <strong>{value}%</strong></div>
            </div>
            <p className={styles.statText}>{text}</p>
            {members.length > 1 && <div className={styles.range} role="img" aria-label={t('Разброс в бригаде: от {low}% до {high}%', { low, high })}>
              <span style={{ left: `${low}%`, width: `${Math.max(high - low, 1)}%` }} /><i style={{ left: `${value}%` }} />
            </div>}
            <p className={styles.rangeNote}>{members.length > 1 && <span>{t('Разброс {low}–{high}%', { low, high })}</span>}
              <span>{t('Приоритет развития: {count} из {total}', { count: report.priorityCount[id], total: members.length })}</span></p>
          </article>
        })}
      </div>
    </section>

    {hasConsistency && <p className={styles.attention} role="note" data-attention={report.attention.length > 0 || undefined}>
      {report.attention.length > 0
        ? t('Ответы стоит обсудить: {count} из {total}. Это не проверка честности: у них много компромиссных ответов «как надо» или одна и та же позиция. Говорите о ситуациях, а не об оценке человека, и не используйте индикатор для кадровых решений.',
          { count: report.attention.length, total: members.length })
        : t('Ответы всех сотрудников согласованы: признаков ответов «как надо» нет.')}
    </p>}


    {!viewerId && <section className={styles.mix} aria-labelledby="mix-title">
      <h2 id="mix-title">{t('Состав по архетипам')}</h2>
      <ul>{report.archetypeCounts.map((item) => <li key={item.code}><span className={styles.code}>{showCode(item.code)}</span>{t(item.name)}<b>{item.count}</b></li>)}</ul>
      <p>{t('Разнообразие архетипов — сильная сторона: «Аналитики» проверяют решения, «Решительные» доводят их до дела. Если в команде нет ни одного «Командного», назначьте ответственного за связь со смежниками.')}</p>
    </section>}

    {!viewerId && <section className={styles.exportBox} aria-labelledby="team-export-title">
      <h2 id="team-export-title">{t('Данные команды для системы обучения')}</h2>
      <ExportActions build={buildExport}
        note={!fictional ? t('Файл содержит результаты участников вашей команды: проценты, уровни, архетип и индикатор согласованности.')
          : t('Файл содержит проценты, уровни, архетип и индикатор согласованности каждого сотрудника, без ответов на вопросы. Сотрудники здесь вымышленные, в файле это отмечено полем demo.')} />
    </section>}

    {!viewerId && <p className={styles.next}>{t('Что дальше: проведите разбор на планёрке и попросите команду пройти тест повторно через 30 дней.')} {fictional && <Link to="/intro">{t('Пройти тест самому')}</Link>}</p>}
    </>}
    {section === 'employees' && <>
    <section className={styles.heatSection} aria-labelledby="heat-title">
      <div className={styles.sectionHead}>
        <h2 id="heat-title">{t('Качества сотрудников')}</h2>
        <div className={styles.legend} aria-hidden="true">{BANDS.map((band, index) => <span key={band.label}><i data-band={index} />{t(band.label)}</span>)}</div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.heat}>
          <caption className={styles.srOnly}>{t('Проценты четырёх качеств и архетип каждого сотрудника')}</caption>
          <thead><tr><th scope="col">{t('Сотрудник')}</th>{TRAIT_IDS.map((id, index) => <th scope="col" key={id} className={styles.traitHead} title={labels.traitNames[id]}>
            <span className={styles.traitNo} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{labels.traitShortNames[id]}</th>)}<th scope="col">{t('Архетип')}</th>{hasConsistency && <th scope="col">{t('Согласованность')}</th>}{meetings && !compact && <th scope="col">{t('Беседа')}</th>}</tr></thead>
          <tbody>{members.map((member) => <Fragment key={member.id}><tr data-own={member.id === 'own' || member.id === viewerId || undefined}>
            <th scope="row"><span className={styles.person}><span className={styles.avatarCrop} aria-hidden="true"><ProfileAvatar code={member.archetype.code} choice={avatarOf(member.id)} size={124} /></span>
              <span className={styles.personText}><strong>{member.name}</strong><span>{member.id === 'own' ? member.role : t(member.role)}</span>
                {meetings && compact && <span className={styles.compactMeeting}><MeetingCell employeeId={member.id} name={member.name} below={belowNorm(member)} control={meetings}
                  open={planning === member.id} onToggle={() => setPlanning(planning === member.id ? null : member.id)} /></span>}</span></span></th>
            {TRAIT_IDS.map((id) => {
              const score = member.result.traits[id]
              return <td key={id} data-band={bandOf(score.percent)} title={`${member.name}: ${labels.traitNames[id]} ${score.percent}%, ${labels.levelNames[score.level].toLowerCase()}`}>
                <span className={styles.tileValue}>{score.percent}%</span><span className={styles.tileMeter} aria-hidden="true"><i style={{ width: `${score.percent}%` }} /></span></td>
            })}
            <td className={styles.archetypeCell}><span className={styles.archetypeCode}>{showCode(member.archetype.code)}</span><span>{t(member.archetype.archetype.name)}</span></td>
            {hasConsistency && <td className={styles.consistencyCell} data-level={member.consistency?.level}>
              {member.consistency ? <><span aria-hidden="true">{consistencyIcons[member.consistency.level]}</span> {t(consistencyLabels[member.consistency.level])}</> : '—'}
            </td>}
            {meetings && !compact && <td className={styles.meetingCell}><MeetingCell employeeId={member.id} name={member.name} below={belowNorm(member)} control={meetings}
              open={planning === member.id} onToggle={() => setPlanning(planning === member.id ? null : member.id)} /></td>}
          </tr>
          {meetings && planning === member.id && <tr className={styles.planRow}><td colSpan={TRAIT_IDS.length + 2 + (hasConsistency ? 1 : 0) + (compact ? 0 : 1)}>
            <MeetingForm employeeId={member.id} name={member.name} below={belowNorm(member)} control={meetings} onDone={() => setPlanning(null)} /></td></tr>}
          </Fragment>)}</tbody>
        </table>
      </div>
      <div className={styles.tableWrap} data-summary="">
        <table className={styles.summary}>
          <caption className={styles.srOnly}>{t('Итоги по команде')}</caption>
          <thead><tr><th scope="col">{t('Итоги по команде')}</th>{TRAIT_IDS.map((id, index) => <th scope="col" key={id} className={styles.traitHead}><span className={styles.traitNo} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{labels.traitShortNames[id]}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">{t('Среднее, %')}</th>{TRAIT_IDS.map((id) => <td key={id}>{report.average[id]}%</td>)}</tr>
            <tr><th scope="row">{t('Приоритет развития, человек')}</th>{TRAIT_IDS.map((id) => <td key={id}>{report.priorityCount[id]} / {members.length}</td>)}</tr>
          </tbody>
        </table>
      </div>
      {meetings && <MeetingList control={meetings} />}
    </section>
    </>}
    {section === 'impact' && !viewerId && <section className={styles.impactView} aria-labelledby="impact-title">
      <div className={styles.sectionHead}>
        <h2 id="impact-title">{t('Влияние на команду')}</h2>
        <p className={styles.impactHint}>{focused ? t('Нажмите на сотрудника ещё раз, чтобы вернуться к среднему профилю.') : t('Выберите сотрудника: его профиль ляжет поверх среднего профиля бригады.')}</p>
      </div>
      <ul className={styles.picker} aria-label={t('Сотрудники бригады')}>{members.map((member) => <li key={member.id}>
        <button type="button" className={styles.pick} aria-pressed={member.id === focusId} onClick={() => setFocusId(member.id === focusId ? null : member.id)}>
          <span className={styles.pickAvatar} aria-hidden="true"><ProfileAvatar code={member.archetype.code} choice={avatarOf(member.id)} size={150} /></span>
          <span className={styles.pickText}><strong>{member.name}</strong><span>{member.id === 'own' ? member.role : t(member.role)}</span>
            <span className={styles.code}>{showCode(member.archetype.code)}</span></span>
        </button>
      </li>)}</ul>
      <div className={styles.impactGrid}>
        <div className={styles.radarBox}>
          <div className={styles.radarHead}><h2>{focused ? t('{name} на фоне бригады', { name: focused.name }) : t('Средний профиль: {count} человек', { count: members.length })}</h2>
            <p>{focused ? t('Зелёная точка — выше среднего бригады, розовая — ниже.') : t('Среднее по каждому качеству среди участников бригады.')}</p></div>
          <RadarChart tone="dark" colors={traitColors} values={report.average} labels={labels.traitNames} shortLabels={labels.traitShortNames}
            seriesLabel={t('средний профиль команды')} overlay={focusValues} overlayLabel={focused?.name} overlayKey={focused?.id} />
        </div>
        <div className={styles.barsBox}>
          <h2>{t('Основные результаты')}</h2>
          <p className={styles.barsNote}>{focused ? t('Полоса показывает результат сотрудника, отметка — среднее бригады.') : t('Средние результаты бригады по четырём качествам.')}</p>
          <ul className={styles.bars}>{TRAIT_IDS.map((id) => {
            const average = report.average[id]
            const value = focusValues ? focusValues[id] : average
            const delta = value - average
            const contribution = withoutFocus ? average - withoutFocus[id] : null
            return <li key={id} style={{ '--c': traitColors[id] } as CSSProperties} data-sign={focused ? Math.sign(delta) : undefined}>
              <div className={styles.barHead}><span>{labels.traitNames[id]}</span>
                <b>{value}%</b>{focused && <em>{delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta}</em>}</div>
              <div className={styles.barTrack} role="img" aria-label={focused
                ? t('{trait}: {name} {value}%, среднее бригады {average}%', { trait: labels.traitNames[id], name: focused.name, value, average })
                : `${labels.traitNames[id]}: ${average}%`}>
                <span style={{ width: `${value}%` }} />{focused && <i style={{ left: `${average}%` }} />}
              </div>
              {contribution !== null && <p className={styles.barNote}>{t('Вклад в среднее бригады: {value}', { value: contribution > 0 ? `+${contribution}` : contribution === 0 ? '±0' : String(contribution) })}</p>}
            </li>
          })}</ul>
        </div>
      </div>
    </section>}
    </ProfileTabs>
  </Page>
}
