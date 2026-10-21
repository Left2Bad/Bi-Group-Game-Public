import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ARCHETYPES, POLES } from '../../content/archetypes'
import { POLE_THRESHOLD } from '../../domain/archetype'
import type { AssessmentResult, DevelopmentPlan, Question, TraitId } from '../../domain/types'
import { getArchetype } from '../../domain/archetype'
import { assessConsistency } from '../../domain/consistency'
import { TRAIT_IDS } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { msg } from '../../i18n/translate'
import { Card, Eyebrow, Page } from '../../ui/primitives'
import { RadarChart } from '../../ui/RadarChart'
import { ArchetypeCharacter } from '../../ui/ArchetypeCharacter'
import { ProfileAvatar } from '../../ui/ProfileAvatar'
import { traitColors } from '../../ui/trait-labels'
import { useAvatarChoice } from '../../ui/use-avatar'
import { useTraitLabels } from '../../ui/use-labels'
import { ConsistencyCard } from './ConsistencyCard'
import { ProfileTabs } from './ProfileTabs'
import { TeamGlance } from './TeamGlance'
import { TechText } from '../../ui/TechText'
import styles from './ResultsPage.module.css'

const traitDescriptions: Readonly<Record<TraitId, string>> = {
  criticalThinking: msg('Анализ ситуации и выбор обоснованного решения.'),
  confidence: msg('Готовность принимать решения и выражать позицию.'),
  discipline: msg('Последовательность в договорённостях и выполнении задач.'),
  engagement: msg('Участие в совместной работе и общем результате.'),
}

/** Renders a calculated result passed by the integration layer. No demo scores are generated here. */
export function ResultsPage({ result, questions = [], plan = null, personal = true, shareSlot = null, historySlot = null }: {
  readonly result: AssessmentResult | null
  readonly questions?: readonly Question[]
  readonly plan?: DevelopmentPlan | null
  readonly personal?: boolean
  /** Содержимое раздела «Поделиться»; без него раздела нет. */
  readonly shareSlot?: ReactNode
  /** История попыток и сравнение: показывается в разделе «Подробно». */
  readonly historySlot?: ReactNode
}) {
  const { t, code: showCode } = useI18n()
  const labels = useTraitLabels()
  const [avatar] = useAvatarChoice()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [revealOpen, setRevealOpen] = useState(() => (location.state as { justCompleted?: boolean } | null)?.justCompleted === true)
  const traits = TRAIT_IDS.map((id) => ({ id, name: labels.traitNames[id], description: t(traitDescriptions[id]) }))
  if (!result) return <Page className={styles.page}>
    <Card><Eyebrow>{t('Ваш профиль')}</Eyebrow><h1>{t('Сначала пройдите тест')}</h1><p>{t('Профиль появится после ответов на все вопросы.')}</p></Card>
  </Page>

  const strengths = traits.filter((trait) => result.traits[trait.id].level === 'strength')
  const ordered = [...traits].sort((a, b) => {
    const left = result.traits[a.id], right = result.traits[b.id]
    return right.points / right.maxPoints - left.points / left.maxPoints
  })
  const ratiosEqual = new Set(traits.map((trait) => result.traits[trait.id].points / result.traits[trait.id].maxPoints)).size === 1
  const top = ordered[0]
  const topRatio = top ? result.traits[top.id].points / result.traits[top.id].maxPoints : 0
  const relativeSupports = ordered.filter((trait) => result.traits[trait.id].points / result.traits[trait.id].maxPoints === topRatio)
  const priorities = plan?.priorityTraits ?? []
  const profile = getArchetype(result)
  const consistency = assessConsistency(result, questions)
  const threshold = Math.round(POLE_THRESHOLD * 100)
  // Соседние типы: код, в котором изменилась ровно одна буква.
  const neighbours = TRAIT_IDS.map((id, index) => {
    const pole = profile.poles[id]
    const other = pole.high ? POLES[id].low : POLES[id].high
    const code = [...profile.code].map((letter, position) => position === index ? other.letter : letter).join('')
    return { id, code, name: ARCHETYPES[code] ? t(ARCHETYPES[code].name) : code, high: !pole.high }
  })
  const avatarLabel = t('Персонаж: {name}', { name: t(profile.archetype.name) })
  const tabs = [
    { id: 'overview', label: t('Обзор'), hint: t('главное о вас') },
    { id: 'details', label: t('Подробно'), hint: t('результаты и команда') },
    ...(shareSlot ? [{ id: 'share', label: t('Поделиться'), hint: t('карточка и файл') }] : []),
  ]
  const requested = params.get('tab')
  const active = tabs.find((tab) => tab.id === requested)?.id ?? 'overview'
  const selectTab = (id: string) => setParams((previous) => {
    const next = new URLSearchParams(previous)
    if (id === 'overview') next.delete('tab'); else next.set('tab', id)
    return next
  }, { replace: true })
  return <Page className={styles.page}>
    {revealOpen && <section className={styles.reveal} aria-labelledby="reveal-title">
      <div className={styles.revealText}>
        <p className={styles.revealFloors} aria-hidden="true">{Array.from({ length: 15 }, (_, index) => <span key={index} />)}</p>
        <p className={styles.revealKicker}>{t('Этаж 15 из 15 сдан')}</p>
        <h2 id="reveal-title">{t('Знакомьтесь: это вы на площадке')}</h2>
        <p className={styles.revealName}>{t(profile.archetype.name)} · <span>{showCode(profile.code)}</span></p>
        <div className={styles.revealActions}>
          <a href="#archetype-hero" onClick={() => { setRevealOpen(false); if (active !== 'overview') selectTab('overview') }}>{t('К профилю')}</a>
          <button type="button" onClick={() => setRevealOpen(false)}>{t('Скрыть')}</button>
        </div>
      </div>
      <div className={styles.revealFigure}><ProfileAvatar code={profile.code} choice={avatar} size={360} /></div>
    </section>}
    <div className={styles.header}><div><Eyebrow>{t('Результат теста')}</Eyebrow><h1>{t('Ваш профиль')}</h1><p>{t('Рабочий архетип, четыре качества и план развития по вашим решениям в 15 ситуациях.')}</p></div></div>
    <ProfileTabs tabs={tabs} active={active} onChange={selectTab} label={t('Разделы профиля')}>
      {active === 'overview' && <>
        <Card className={styles.hero} aria-label={t('Рабочий архетип')} id="archetype-hero">
          <div className={styles.figure}>
            <div className={styles.figureStage}><ProfileAvatar code={profile.code} choice={avatar} size={400} label={avatarLabel} /></div>
            <p className={styles.code} aria-label={t('Код архетипа {code}', { code: showCode(profile.code) })}><TechText text={showCode(profile.code)} className={styles.codeText} /></p>
            {personal && <Link className={styles.avatarLink} to="/avatar">{t('Сменить аватар')}</Link>}
          </div>
          <div className={styles.archetype}>
            <Eyebrow>{t('Ваш рабочий архетип')}</Eyebrow>
            <h2 className={styles.archetypeName}>{t(profile.archetype.name)}</h2>
            <p className={styles.tagline}>{t(profile.archetype.tagline)}</p>
            <p>{t(profile.archetype.description)}</p>
            <p className={styles.bestAt}><strong>{t('Где раскрывается:')}</strong> {t(profile.archetype.bestAt)}</p>
          </div>
          <div className={styles.insight}>
            <div className={styles.radar}>
              <RadarChart tone="dark" colors={traitColors} seriesLabel={t('Вы')}
                values={Object.fromEntries(TRAIT_IDS.map((id) => [id, result.traits[id].percent])) as Record<TraitId, number>}
                labels={labels.traitNames} shortLabels={labels.traitShortNames} />
            </div>
            <div>
              <h3 className={styles.scalesTitle}>{t('Почему такой код')}</h3>
              <ul className={styles.scales} aria-label={t('Полюса архетипа')}>{TRAIT_IDS.map((id) => {
                const score = result.traits[id]
                const value = Math.max(0, Math.min(100, Math.round(score.percent)))
                const high = profile.poles[id].high
                return <li key={id} title={t(profile.poles[id].description)} style={{ '--c': traitColors[id] } as CSSProperties}>
                  <div className={styles.scaleHead}>
                    <span className={styles.scaleName}><i aria-hidden="true" />{labels.traitNames[id]}</span>
                    <span className={styles.scaleLevel} data-level={score.level}>{labels.levelNames[score.level]}</span>
                    <span className={styles.scaleValue}>{value}%</span>
                  </div>
                  <span className={styles.scaleTrack} aria-hidden="true"><s style={{ width: `${value}%` }} /><i style={{ left: `${threshold}%` }} /><b style={{ left: `${value}%` }} /></span>
                  <div className={styles.scalePoles}>
                    <span className={high ? styles.poleMuted : styles.poleActive}>{showCode(POLES[id].low.letter)} · {t(POLES[id].low.name)}</span>
                    <span className={styles.scalePoints}>{t('{points} из {max} баллов', { points: score.points, max: score.maxPoints })}</span>
                    <span className={high ? styles.poleActive : styles.poleMuted}>{showCode(POLES[id].high.letter)} · {t(POLES[id].high.name)}</span>
                  </div>
                </li>
              })}</ul>
              <p className={styles.scalesNote}>{t('Отметка — порог {value}%. Правее неё — буква сильного полюса, левее — второго.', { value: threshold })} {t('Каждая ситуация затрагивает два качества, поэтому 100% по всем четырём сразу получить нельзя: ровный профиль — 67%. Проценты показывают, на что вы опираетесь в первую очередь.')}</p>
            </div>
          </div>
          <div className={styles.traitsSplit}>
            <div><h3>{t('Сильные стороны типа')}</h3><ul>{profile.archetype.strengths.map((item) => <li key={item}>{t(item)}</li>)}</ul></div>
            <div><h3>{t('На что обратить внимание')}</h3><ul>{profile.archetype.risks.map((item) => <li key={item}>{t(item)}</li>)}</ul></div>
          </div>
        </Card>
        <div className={styles.summaryGrid}>
          <Card><h2>{t('Сильные стороны')}</h2>
            {strengths.length > 0 ? <>
              <p>{t('Сильные стороны по выбранным ответам:')}</p><ul>{strengths.map((trait) => <li key={trait.id}>{trait.name}</li>)}</ul>
              <p>{t('Попробуйте применить эти подходы в следующей рабочей ситуации.')}</p>
            </> : ratiosEqual ? <p>{t('Показатели равны: выраженной относительной опоры по этим ответам нет. Начните с одного небольшого действия из маршрута.')}</p> : <>
              <p>{t('Относительные опоры — направления с наибольшими показателями внутри этого профиля:')}</p>
              <ul>{relativeSupports.map((trait) => <li key={trait.id}>{trait.name}</li>)}</ul>
              <p>{t('Это сравнение внутри профиля; показатели пока не находятся в зоне сильных сторон.')}</p>
            </>}
          </Card>
          <Card><h2>{t('Зоны роста')}</h2>
            {priorities.length > 0 ? <><p>{t('Начните с этих направлений:')}</p><ul className={styles.priorities}>{priorities.map((trait) => {
              const recommendation = plan?.recommendations.find((item) => item.trait === trait)
              return <li key={trait}><strong>{labels.traitNames[trait]}</strong>{recommendation && <p>{recommendation.action}</p>}</li>
            })}</ul></> : <p>{strengths.length === traits.length
              ? t('По ответам нет выраженного приоритета развития. В маршруте есть практики для поддержания сильных сторон.')
              : t('Конкретные действия и их приоритеты доступны в вашем маршруте развития.')}</p>}
            {personal && <Link className={styles.routeLink} to="/development">{t('Мой маршрут развития')} <span aria-hidden="true">→</span></Link>}
          </Card>
        </div>
      </>}
      {active === 'details' && <>
        <div className={styles.grid}>{traits.map((trait) => {
          const score = result.traits[trait.id]
          const value = Math.max(0, Math.min(100, Math.round(score.percent)))
          return <Card className={styles.metric} key={trait.id} style={{ '--c': traitColors[trait.id] } as CSSProperties}>
            <div className={styles.labelRow}><h2>{trait.name}</h2><strong>{value}%</strong></div>
            <p>{trait.description}</p>
            <div className={styles.track} role="img" aria-label={`${trait.name}: ${value}%`}><span style={{ width: `${value}%` }} /></div>
            <p className={styles.points}>{t('{points} из {max} баллов', { points: score.points, max: score.maxPoints })}</p>
            <p className={styles.level} data-level={score.level}>{labels.levelNames[score.level]}</p>
            <details className={styles.evidence}>
              <summary aria-label={t('Почему такой результат: {name}', { name: trait.name })}>{t('Почему такой результат')}</summary>
              <p>{t('Расчёт: {points} / {max} × 100, округление до целого. Уровень определяется до округления.', { points: score.points, max: score.maxPoints })}</p>
              <ol>{score.evidence.map((item) => {
                const index = questions.findIndex((question) => question.id === item.questionId)
                const question = questions[index]
                const option = question?.options.find((answer) => answer.id === result.answers[item.questionId])
                return <li key={item.questionId}>
                  <p className={styles.questionId}>{t('Ситуация {n} · {points} из 3 баллов', { n: index >= 0 ? index + 1 : item.questionId, points: item.points })}</p>
                  {question && <><p className={styles.context}>{question.context}</p><p>{question.text}</p></>}
                  {option && <p><strong>{t('Ваш ответ:')}</strong> {option.text}</p>}
                  <p><strong>{t('Обоснование:')}</strong> {item.reason}</p>
                </li>
              })}</ol>
            </details>
          </Card>
        })}</div>
        {personal && <TeamGlance result={result} />}
        <section className={styles.neighbours} aria-labelledby="neighbours-title">
          <div className={styles.neighboursHead}>
            <div><h2 id="neighbours-title">{t('Соседние типы')}</h2><p>{t('Куда сдвинется ваш персонаж, если изменится одно качество.')}</p></div>
            <Link to="/types">{t('Все 16 типов')} <span aria-hidden="true">→</span></Link>
          </div>
          <ul>{neighbours.map((item) => <li key={item.code}>
            <ArchetypeCharacter code={item.code} size={140} />
            <div><strong className={styles.neighbourCode}>{showCode(item.code)}</strong><h3>{item.name}</h3>
              <p>{item.high ? t('{trait}: выше порога', { trait: labels.traitNames[item.id] }) : t('{trait}: ниже порога', { trait: labels.traitNames[item.id] })}</p></div>
          </li>)}</ul>
        </section>
        {consistency && <ConsistencyCard report={consistency} />}
        {historySlot}
      </>}
      {active === 'share' && shareSlot}
    </ProfileTabs>
    <p className={styles.footnote}>{t('Профиль строится по решениям, выбранным в рабочих ситуациях, и предназначен для планирования развития сотрудника.')}</p>
  </Page>
}
