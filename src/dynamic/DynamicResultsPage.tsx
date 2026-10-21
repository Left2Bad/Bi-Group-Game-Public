import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../auth/api'
import { TRAIT_IDS } from '../domain/types'
import { useTraitLabels } from '../ui/use-labels'
import { Button, Card, Eyebrow, Page } from '../ui/primitives'
import { comparableDynamic, CRITERIA, progressComparable } from './domain'
import { ProgressPanel } from './ProgressPanel'
import { CRITERION_NAMES, componentGap, weakCriteria } from './profile-insights'
import { SkillDynamics, StrengthsAndGrowth } from './ProfileInsights'
import { AcademyRoute } from './AcademyRoute'
import type { DynamicAttempt } from './domain'
import { useLocalizedAttempt } from './use-localized-attempt'
import { getArchetype } from '../domain/archetype'
import { POLES } from '../content/archetypes'
import { ProfileAvatar } from '../ui/ProfileAvatar'
import { RadarChart } from '../ui/RadarChart'
import { traitColors } from '../ui/trait-labels'
import { useAvatarChoice } from '../ui/use-avatar'
import type { AvatarChoice } from '../storage/avatar'
import { ProfileTabs } from '../features/results/ProfileTabs'
import { displayLevel, preferenceProfile } from './presentation'
import { TechText } from '../ui/TechText'
import styles from '../features/results/ResultsPage.module.css'
import historyStyles from '../app/AttemptHistory.module.css'
import insights from './ProfileInsights.module.css'
import view from './DynamicProfile.module.css'
import { FocusBuilding, ProfileIcon } from './ProfileIcons'
import { FlipCard } from '../ui/FlipCard'
import { LockedProfile, ProfileTitle } from './LockedProfile'
import { useI18n } from '../i18n/context'
import { dateLocale } from '../i18n/translate'
import type { Lang } from '../i18n/translate'

type Comparison = { baseline: DynamicAttempt | null; middle?: DynamicAttempt | null; previous: DynamicAttempt | null; count: number; progressCount?: number }
const dateOf = (lang: Lang) => (value: string) => new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qyzylorda' }).format(new Date(value))

export function DynamicProfile({ attempt, baseline, middle = null, progressCount, previous, personal = true, employeeAvatar, extra, demo, onAttempt }: {
  readonly attempt: DynamicAttempt; readonly baseline?: DynamicAttempt | null | undefined; readonly previous?: DynamicAttempt | null | undefined
  /** Серединное прохождение для вкладки «Прогресс» (при 7 попытках — 4-е) и число сопоставимых прохождений до текущего. */
  readonly middle?: DynamicAttempt | null | undefined; readonly progressCount?: number | undefined
  /** Попытка обновилась (например, дополнена анализом прогресса). */
  readonly onAttempt?: ((attempt: DynamicAttempt) => void) | undefined
  readonly personal?: boolean; readonly employeeAvatar?: AvatarChoice
  /** Дополнительный блок раздела «Управление результатами» (например, история прохождений). */
  readonly extra?: ReactNode
  /** Пример с вымышленными данными: вид как у самого сотрудника, но без смены аватара, истории и выгрузки; план открывается в примере. */
  readonly demo?: { readonly avatar: AvatarChoice; readonly planUrl: string } | undefined
}) {
  const { t, lang, code: showCode } = useI18n()
  const date = dateOf(lang)
  const { traitNames, traitShortNames, levelNames } = useTraitLabels()
  const [localAvatar] = useAvatarChoice()
  const [params, setParams] = useSearchParams()
  const evaluation = attempt.evaluation
  const avatar = demo ? demo.avatar : personal ? localAvatar : employeeAvatar ?? { kind: 'test' }
  const dualRubric = Boolean(evaluation?.skills)
  if (!evaluation) return <Card><h2>{t('Попытка ещё не завершена')}</h2><Link to="/assessment">{t('Продолжить')}</Link></Card>
  // Первое прохождение закреплено как точка отсчёта; все изменения к нему собраны во вкладке «Прогресс».
  const first = baseline && baseline.id !== attempt.id && progressComparable(baseline, attempt) ? baseline : null
  const comparablePrevious = previous && comparableDynamic(previous, attempt)
  const profile = getArchetype(preferenceProfile(attempt))
  const tabs = [
    { id: 'overview', label: t('Обзор'), hint: t('главное о вас') },
    { id: 'details', label: t('Подробно'), hint: t('результаты и ответы') },
    { id: 'progress', label: t('Прогресс'), hint: t('до и после') },
    ...(personal && !demo ? [{ id: 'share', label: t('Управление результатами'), short: t('История'), hint: t('история, файл и печать') }] : []),
  ]
  const active = tabs.find((tab) => tab.id === params.get('tab'))?.id ?? 'overview'
  const developmentUrl = demo?.planUrl ?? `${import.meta.env.MODE === 'playwright-legacy' ? '/development/new' : '/development'}?attempt=${encodeURIComponent(attempt.id)}`
  const selectTab = (tab: string) => setParams((previousParams) => {
    const next = new URLSearchParams(previousParams)
    if (tab === 'overview') next.delete('tab'); else next.set('tab', tab)
    return next
  }, { replace: true })
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(attempt, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `bi-academy-${attempt.id}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const developmentLink = personal ? <Link to={developmentUrl}>{t('План развития на 30 дней')}{' '}<span aria-hidden="true">→</span></Link> : null
  const ranked = [...TRAIT_IDS].sort((a, b) => evaluation.traits[b].finalPercent - evaluation.traits[a].finalPercent)
  const best = ranked[0]!
  const worst = ranked.at(-1)!
  const progressHint = first ? <button type="button" className={insights.linkButton} onClick={() => selectTab('progress')}>{t('Что изменилось с первого прохождения — во вкладке «Прогресс»')}</button> : null
  const weak = weakCriteria(evaluation)
  const weakSkills = (evaluation.skills ?? []).filter((skill) => skill.percent < 55)
  return <>
    <header className={styles.header}><Eyebrow>{t('Результат теста')}</Eyebrow><ProfileTitle resettable={personal && !demo}>{personal ? t('Ваш профиль') : t('Профиль сотрудника')}</ProfileTitle>
      <p>{t('Четыре качества, профессиональные навыки и план развития по ответам на 15 рабочих вопросов.')}</p>
    </header>
    <ProfileTabs tabs={tabs} active={active} onChange={selectTab} label={t('Разделы профиля')}>
    {active === 'overview' && <>
      <Card className={view.hero} aria-label={t('Рабочий архетип')} id="archetype-hero">
        <div className={view.figure}>
          <div className={view.figureStage}><ProfileAvatar code={profile.code} choice={avatar} size={400} label={t('Персонаж: {name}', { name: t(profile.archetype.name) })} /></div>
          <p className={styles.code} aria-label={t('Код архетипа {code}', { code: showCode(profile.code) })}><TechText text={showCode(profile.code)} className={styles.codeText} /></p>
          {personal && !demo && <Link className={view.heroLink} to={`/avatar?attempt=${encodeURIComponent(attempt.id)}`}>{t('Сменить аватар')}</Link>}
        </div>
        <div className={view.archetype}><Eyebrow className={view.heroEyebrow}>{t('Ваш рабочий архетип')}</Eyebrow><h2 className={view.archetypeName}>{t(profile.archetype.name)}</h2>
          <p className={view.tagline}>{t(profile.archetype.tagline)}</p><p className={view.description}>{t(profile.archetype.description)}</p>
          <ul className={view.codeParts} aria-label={t('Из чего складывается код {code}', { code: showCode(profile.code) })}>{TRAIT_IDS.map((id, position) => {
            const pole = POLES[id].high.letter === profile.code[position] ? POLES[id].high : POLES[id].low
            return <li key={id} style={{ '--i': position } as CSSProperties}><b aria-hidden="true">{showCode(pole.letter)}</b><span>{t(pole.name)}<small>{traitNames[id]}</small></span></li>
          })}</ul>
          <details className={view.typeMore}><summary>{t('Описание типа')}</summary>
            <div className={view.typeCards}>
              <section className={view.typeCard} data-tone="best"><h3><span className={view.typeIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg></span>{t('Где раскрывается')}</h3>
                <p>{t(profile.archetype.bestAt)}</p></section>
              <section className={view.typeCard} data-tone="good"><h3><span className={view.typeIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg></span>{t('Сильные стороны типа')}</h3>
                <ul>{profile.archetype.strengths.map((item) => <li key={item}>{t(item)}</li>)}</ul></section>
              <section className={view.typeCard} data-tone="risk"><h3><span className={view.typeIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></svg></span>{t('На что обратить внимание')}</h3>
                <ul>{profile.archetype.risks.map((item) => <li key={item}>{t(item)}</li>)}</ul></section>
            </div>
          </details>
        </div>
        <div className={view.radar}><RadarChart values={Object.fromEntries(TRAIT_IDS.map((id) => [id, evaluation.traits[id].finalPercent])) as Record<typeof TRAIT_IDS[number], number>}
          labels={traitNames} shortLabels={traitShortNames} tone="dark" colors={traitColors} seriesLabel={t('Итоговый профиль')} showBalanced={false} /></div>
      </Card>
      <div className={view.overviewGrid}>
        <Card className={view.qualities}><h2>{t('Ваши ключевые качества')}</h2>
          <ul className={view.scales} aria-label={t('Показатели профиля')}>{TRAIT_IDS.map((id) => { const score = evaluation.traits[id]; return <li key={id} style={{ '--c': traitColors[id] } as CSSProperties}>
            <div className={view.scaleHead}><span className={view.scaleName}><i aria-hidden="true" />{traitNames[id]}</span>
              <span className={view.scaleValue}>{score.finalPercent}%</span></div>
            <div className={view.scaleRow}><span className={view.scaleTrack} aria-hidden="true"><s style={{ width: `${score.finalPercent}%` }} /></span>
              <span className={view.scaleLevel} data-level={displayLevel(score.finalPercent)}>{levelNames[displayLevel(score.finalPercent)]}</span></div>
            <span className={view.scalePoints}>{t('Выбор в ситуациях: {preferencePercent}% ·', { preferencePercent: score.preferencePercent })}{' '}{dualRubric ? t('поведение в ответах') : t('открытые ответы')}: {score.behaviorPercent ?? score.professionalPercent}%</span>
          </li> })}</ul>
          <p className={view.scalesNote}>{t('Аватар отражает ваши ответы на отдельную анкету. Четыре процента рассчитываются по рабочему тесту; профессиональные навыки показаны отдельно.')}</p>
        </Card>
        <section className={view.focusCard} aria-labelledby="focus-plan">
          <p className={view.focusEyebrow} id="focus-plan">{t('Фокус развития')}</p>
          <FocusBuilding className={view.focusArt} />
          <h3>{t('Рекомендация по результатам теста')}</h3>
          <p>{t('Персональный план развития строится на ваших сильных сторонах и зонах роста. Начать стоит с качества «{trait}»: сейчас {percent}%.', { trait: traitNames[worst], percent: evaluation.traits[worst].finalPercent })}</p>
          {personal && <Link className={view.focusAction} to={developmentUrl}>{t('Открыть план')}{' '}<ProfileIcon name="arrow" /></Link>}
        </section>
      </div>
      <StrengthsAndGrowth attempt={attempt} baseline={null} traitNames={traitNames} onDetails={() => selectTab('details')} planLink={developmentLink} />
      {comparablePrevious && <p className={insights.muted}><strong>{t('Устойчивые сильные стороны:')}</strong> {ranked.filter((id) =>
        evaluation.traits[id].finalPercent >= 75 && previous.evaluation!.traits[id].finalPercent >= 75)
        .map((id) => traitNames[id]).join(', ') || t('Пока недостаточно повторных подтверждений.')}</p>}
      {evaluation.skills && <SkillDynamics attempt={attempt} baseline={null} progressHint={progressHint} />}
    </>}
    {active === 'details' && <>
    <Card className={insights.summary}><h2>{t('Главное')}</h2>
      <ul className={insights.keyPoints}>
        <li data-tone="strength"><span aria-hidden="true">▲</span><p>{t('Самое сильное качество —')}{' '}<strong>{traitNames[best]}</strong>: {evaluation.traits[best].finalPercent}%.</p></li>
        <li data-tone="growth"><span aria-hidden="true">▼</span><p>{t('Больше всего нужно подтянуть —')}{' '}<strong>{traitNames[worst]}</strong>: {evaluation.traits[worst].finalPercent}%.</p></li>
        <li data-tone="info"><span aria-hidden="true">≈</span><p>{first ? progressHint : baseline && baseline.id !== attempt.id
          ? t('Сравнение с первым прохождением невозможно: оно проведено по другой методике оценки.') : t('Динамика появится после повторной диагностики.')}</p></li>
        {evaluation.unsafe && <li data-tone="growth"><span aria-hidden="true">!</span><p><strong>{t('В ответах выявлено опасное решение:')}</strong>{' '}{t('профессиональные оценки ограничены 25%. {safetyExplanation}', { safetyExplanation: t(evaluation.safetyExplanation ?? '') })}</p></li>}
      </ul>
      <p className={insights.muted}>{t('Прохождение {date}. Проценты помогают планировать развитие и не подтверждают квалификацию. Аватар на баллы не влияет.', { date: date(attempt.completedAt ?? attempt.createdAt) })}</p>
    </Card>
    <p className={insights.flipHint}><ProfileIcon name="repeat" />{t('Карточки переворачиваются: нажмите на карточку или потяните её в сторону, чтобы увидеть, как вырасти.')}</p>
    <div className={insights.traitGrid}>
      {ranked.map((id, index) => { const score = evaluation.traits[id]
        const level = displayLevel(score.finalPercent)
        const gap = componentGap(score, t)
        return <FlipCard key={id} label={traitNames[id]} className={insights.traitFlip} toBackLabel={t('Что подтянуть')} toFrontLabel={t('К результату')}
          hintDelay={index === 0 ? 350 : undefined} style={{ '--c': traitColors[id], '--p': score.finalPercent } as CSSProperties}
          front={<article className={insights.traitFace} aria-label={traitNames[id]}>
            <span className={insights.traitIndex} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div className={insights.traitTop}>
              <div><p className={insights.traitKicker}>{t('Качество {n} из 4', { n: index + 1 })}</p><h3>{traitNames[id]}</h3>
                <span className={insights.level} data-level={level}>{levelNames[level]}</span></div>
              <div className={insights.gauge} role="img" aria-label={`${traitNames[id]}: ${score.finalPercent}%`}>
                <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" /><circle cx="50" cy="50" r="42" pathLength="100" /></svg>
                <strong data-level={level}>{score.finalPercent}%</strong></div>
            </div>
            <dl className={insights.facts}><div data-tone="good"><dt><strong>{t('Что получается:')}</strong></dt><dd>{score.strength}</dd></div></dl>
            {gap && <p className={insights.gapNote}>{gap}</p>}
          </article>}
          back={<div className={insights.traitFace} data-side="back">
            <p className={insights.traitKicker}>{traitNames[id]} · {score.finalPercent}%</p><h3>{t('Как вырасти')}</h3>
            <dl className={insights.facts}>
              <div data-tone="fix"><dt><strong>{t('Что подтянуть:')}</strong></dt><dd>{score.nextStep}</dd></div>
              <div data-tone="criterion"><dt><strong>{t('Как понять, что получилось:')}</strong></dt><dd>{score.successCriterion}</dd></div>
            </dl>
            <details className={insights.more}><summary>{t('Основание из ответов')}</summary>
              <p><strong>{t('Выбор в ситуациях:')}</strong> {score.preferencePercent}% · <strong>{dualRubric ? t('поведение в ответах') : t('открытые ответы')}:</strong> {score.behaviorPercent ?? score.professionalPercent}%</p>
              <blockquote className={insights.quote}><ProfileIcon name="quote" /><p><strong>{t('Основание')}{score.questionId ? ` (${score.questionId})` : ''}:</strong> «{score.evidence}»</p></blockquote>
              {comparablePrevious && <><p><strong>{t('Раньше:')}</strong> «{previous.evaluation!.traits[id].evidence}»</p>
                <p>{t('Это изменение содержания ответов, а не доказательство роста навыка.')}</p></>}
            </details>
          </div>} /> })}
    </div>
    {(weak.length > 0 || weakSkills.length > 0 || evaluation.unsafe) && <Card className={insights.improve} aria-label={t('Что подтянуть')}>
      <h2><span className={insights.icon}><ProfileIcon name="target" /></span>{t('Недостатки и что с ними делать')}</h2>
      {evaluation.unsafe && <p className={insights.danger}>{t('Опасное решение в ответах: {safetyExplanation}', { safetyExplanation: t(evaluation.safetyExplanation ?? '') })}</p>}
      {weak.length > 0 && <section className={insights.gapGroup}><h3>{t('Где ответам не хватило полноты')}<small>{t('ниже 3 из 4 · {count}', { count: weak.length })}</small></h3>
        <ul>{weak.map((item) => <li key={item.id}>
          <div className={insights.gapHead}><strong>{t(item.name)}</strong><span className={insights.gapScore}>{t('{level} из 4', { level: item.level })}</span></div>
          <span className={insights.gapMeter} aria-hidden="true"><i style={{ width: `${item.level / 4 * 100}%` }} /></span>
          <p><b>{t('Что делать')}</b>{t(item.explanation)}</p></li>)}</ul></section>}
      {weakSkills.length > 0 && <section className={insights.gapGroup}><h3>{t('Профессиональные навыки')}<small>{t('ниже 55% · {count}', { count: weakSkills.length })}</small></h3>
        <ul>{weakSkills.map((skill) => <li key={skill.name}>
          <div className={insights.gapHead}><strong>{t(skill.name)}</strong><span className={insights.gapScore}>{skill.percent}%</span></div>
          <span className={insights.gapMeter} aria-hidden="true"><i style={{ width: `${skill.percent}%` }} /></span>
          <p><b>{t('Что делать')}</b>{skill.nextStep}</p></li>)}</ul></section>}
    </Card>}
    <details className={insights.fold}><summary><span className={insights.icon}><ProfileIcon name="chart" /></span>
      <span className={insights.foldTitle}><strong>{t('Как сложился результат')}</strong><small>{t('Формула итога, рубрика и модель оценки')}</small></span></summary>
      <div className={insights.formula}><span>{t('Формула итога')}</span>
        {dualRubric ? <p><b>⅔</b>{' '}{t('оценки 10 ситуаций с вариантами')}{' '}<i>+</i> <b>⅓</b>{' '}{t('оценки поведения по всем 15 ответам')}</p>
          : <p><b>20%</b>{' '}{t('профиля предпочтений')}{' '}<i>+</i> <b>80%</b>{' '}{t('оценки открытых ответов')}</p>}
        <small>{dualRubric ? t('Итог считается по каждому качеству. Профессиональные навыки оцениваются отдельно.') : t('Итог считается по каждому качеству и округляется до целого процента.')}</small></div>
      <p className={insights.note}>{t('Даже при одинаковой методике сложность')}{' '}{dualRubric ? t('подобранных') : t('сгенерированных')}{' '}{t('ситуаций может различаться. Изменение процентов само по себе не доказывает развитие навыка.')}</p>
      <dl className={insights.meta}>
        <div><dt>{t('Оценка')}</dt><dd>{dualRubric ? t('обе рубрики одним запросом') : t('открытые ответы')}</dd></div>
        <div><dt>{t('Модель')}</dt><dd>{evaluation.model}</dd></div>
        <div><dt>{t('Рубрика')}</dt><dd>{evaluation.rubricVersion}</dd></div>
        {evaluation.reasoningEffort && <div><dt>{t('Уровень размышлений')}</dt><dd>{evaluation.reasoningEffort}</dd></div>}
      </dl>
      {evaluation.criteria && <><h4>{t('Профессиональная рубрика: основания оценки')}</h4>
        <ul className={insights.levels} aria-label={t('Уровни рубрики')}>{[t('признак отсутствует или решение ошибочно'), t('только намерение'), t('применимое действие с пробелами'), t('обоснованное решение'), t('полный подход с проверкой')]
          .map((text, level) => <li key={level}><b>{level}</b>{text}</li>)}</ul>
        <ol>{CRITERIA.map((id) => { const criterion = evaluation.criteria![id]; return <li key={id}>
          <strong>{t('{name}: {level} из 4', { name: t(CRITERION_NAMES[id]), level: criterion.level })}</strong><p>«{criterion.evidence}» — {t(criterion.explanation)}</p>
        </li> })}</ol></>}
      {previous && !comparablePrevious && <p role="note">{t('Предыдущая попытка использует другую методику или настройки AI, включая модель и уровень размышлений.')}</p>}
    </details>
    <details className={insights.fold}><summary><span className={insights.icon}><ProfileIcon name="answers" /></span>
      <span className={insights.foldTitle}><strong>{t('Ваши ответы')}</strong><small>{t('10 вопросов с вариантами и 5 открытых ответов')}</small></span></summary>
      <h4>{t('10 вопросов с вариантами')}</h4><ol>{attempt.choices.map((question) =>
        <li key={question.id}><p>{question.context} {question.text}</p>
          <ul>{question.options.map((option) => { const chosen = attempt.choiceAnswers[question.id] === option.id
            return <li key={option.id} data-chosen={chosen ? t('ваш выбор') : undefined}>
              {chosen ? <strong>{option.text}<span className={insights.srOnly}>{' '}{t('— ваш выбор')}</span></strong> : option.text}
            </li> })}</ul></li>)}</ol>
      <h4>{t('5 открытых вопросов')}</h4><ol>{attempt.openQuestions.map((question) =>
        <li key={question.id}><strong>{question.text}</strong><p className={insights.answer}>{attempt.openAnswers[question.id]}</p></li>)}</ol>
    </details>
    {personal && <p className={view.planCta}>{developmentLink}</p>}
    <AcademyRoute completedAt={attempt.completedAt ?? attempt.createdAt} evaluation={evaluation} />
    </>}
    {active === 'progress' && <ProgressPanel attempt={attempt} first={first} middle={first ? middle : null}
      count={progressCount ?? (first ? (middle ? 3 : 2) : 1)} traitNames={traitNames} canAnalyze={personal && !demo} onAttempt={onAttempt} />}
    {active === 'share' && personal && !demo && <>{extra}
      <Card className={view.toolCard}><div className={view.toolHead}><span className={view.toolIcon}><ProfileIcon name="share" /></span>
        <div><h2>{t('Поделиться результатом')}</h2><p>{t('Файл содержит вопросы, ваши ответы и оценку. Передавайте его тем, кому хотите показать результат.')}</p></div></div>
        <div className={view.shareActions}>
          <Button className={view.wide} onClick={download}><ProfileIcon name="download" />{t('Скачать результат JSON')}</Button>
          <Button className={view.wide} tone="secondary" onClick={() => { flushSync(() => selectTab('overview')); window.print() }}><ProfileIcon name="print" />{t('Печать / сохранить PDF')}</Button>
        </div>
      </Card>
      <Card className={view.toolCard}><div className={view.toolHead}><span className={view.toolIcon}><ProfileIcon name="settings" /></span><div><h2>{t('Дополнительные действия')}</h2></div></div>
        <ul className={view.actionList}>
          <li><Link to="/assessment"><span className={view.toolIcon}><ProfileIcon name="repeat" /></span>
            <span><strong>{t('Пройти ещё раз')}</strong><small>{t('Повторите тест, чтобы посмотреть, как изменились ваши результаты.')}</small></span><ProfileIcon name="chevron" className={view.chevron} /></Link></li>
          <li><Link to={developmentUrl}><span className={view.toolIcon}><ProfileIcon name="book" /></span>
            <span><strong>{t('План развития на 30 дней')}</strong><small>{t('Персональный план на основе ваших результатов.')}</small></span><ProfileIcon name="chevron" className={view.chevron} /></Link></li>
        </ul>
      </Card></>}
    </ProfileTabs>
    <p className={styles.footnote}>{t('Проценты помогают планировать развитие. Разница результатов сама по себе не доказывает рост навыка.')}</p>
  </>
}


export function DynamicResultsPage() {
  const { t, lang } = useI18n()
  const date = dateOf(lang)
  const [params, setParams] = useSearchParams()
  const [attempt, setAttempt] = useState<DynamicAttempt | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [items, setItems] = useState<DynamicAttempt[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const requestedId = params.get('attempt')
  const shown = useLocalizedAttempt(attempt, attempt ? `/dynamic/attempts/${encodeURIComponent(attempt.id)}/translation` : null)
  useEffect(() => {
    let live = true
    api<{ attempts: DynamicAttempt[]; total: number }>(`/dynamic/attempts?limit=10&offset=${offset}`)
      .then((data) => { if (live) { setItems(data.attempts); setTotal(data.total); setError(null); setLoaded(true) } })
      .catch((reason: Error) => { if (live) { setError(reason.message); setLoaded(true) } })
    return () => { live = false }
  }, [offset])
  useEffect(() => {
    let live = true
    const id = requestedId ?? items.find((item) => item.status === 'completed')?.id
    if (!id) return
    Promise.all([
      api<{ attempt: DynamicAttempt }>(`/dynamic/attempts/${encodeURIComponent(id)}`),
      api<Comparison>(`/dynamic/attempts/${encodeURIComponent(id)}/comparison`),
    ]).then(([a, c]) => { if (live) { setAttempt(a.attempt); setComparison(c); setError(null) } })
      .catch((reason: Error) => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [requestedId, items])
  const historyCard = <Card className={view.toolCard}><div className={view.toolHead}><span className={view.toolIcon}><ProfileIcon name="history" /></span>
    <div><h2>{t('История прохождений')}</h2>
    <p>{t('Всего попыток: {total}. Вопросы и ответы каждой попытки сохранены в её исходном виде.', { total })}</p></div></div>
    <label className={historyStyles.field}>{t('Открыть сохранённый профиль')}<select value={items.some((item) => item.id === attempt?.id) ? attempt?.id : ''}
      onChange={(event) => setParams({ attempt: event.target.value })}><option value="" disabled>{t('Выберите прохождение')}</option>
      {items.map((item) => <option key={item.id} value={item.id}>{date(item.completedAt ?? item.createdAt)} · {item.status === 'completed' ? t('завершено') : t('черновик')}</option>)}
    </select></label>
    {items.length > 0 && <ul className={view.attempts}>{items.map((item) => <li key={item.id}>
      <button type="button" aria-current={item.id === attempt?.id ? 'true' : undefined} onClick={() => setParams({ attempt: item.id })}>
        <ProfileIcon name="file" /><span>{t('Прохождение · {date}', { date: date(item.completedAt ?? item.createdAt) })}</span>
        <span className={view.status} data-status={item.status}>{item.status === 'completed' ? t('Завершено') : t('Черновик')}</span>
        <ProfileIcon name="chevron" className={view.chevron} /></button></li>)}</ul>}
    <div className={view.pager}>
      <Button tone="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 10))}><ProfileIcon name="arrowBack" />{t('Новее')}</Button>
      <Button tone="secondary" disabled={offset + 10 >= total} onClick={() => setOffset(offset + 10)}>{t('Раньше')}<ProfileIcon name="arrow" /></Button>
    </div>
    <p><Link className={view.arrowLink} to="/results/legacy">{t('Посмотреть результаты прежней методики')}</Link></p>
  </Card>
  return <Page className={view.page}>
    {error && <p role="alert">{t(error)}</p>}
    {shown ? <DynamicProfile attempt={shown} baseline={comparison?.baseline} middle={comparison?.middle} progressCount={comparison?.progressCount}
      previous={comparison?.previous} extra={historyCard} onAttempt={setAttempt} />
      : !loaded || requestedId || items.some((item) => item.status === 'completed') ? <p role="status">{t('Загружаем профиль…')}</p>
      : <>
        <header className={styles.header}><Eyebrow>{t('До первого теста')}</Eyebrow><ProfileTitle resettable>{t('Ваш профиль')}</ProfileTitle>
          <p>{t('Здесь появятся четыре качества, профессиональные навыки и план развития. Пока виден только ваш аватар.')}</p></header>
        <LockedProfile />
      </>}
    {!attempt && loaded && total > 0 && !items.some((item) => item.status === 'completed') && historyCard}
  </Page>
}
