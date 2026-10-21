import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { getArchetype } from '../domain/archetype'
import { avatarName } from '../domain/avatar'
import { TRAIT_IDS } from '../domain/types'
import type { AssessmentResult, TraitId, TraitLevel } from '../domain/types'
import type { DynamicAttempt } from '../dynamic/domain'
import { routeProgress, skillCard, traitDynamics, weekEndDay } from '../dynamic/manager-card'
import { DYNAMICS_GAP_TEXT } from '../dynamic/manager-card'
import type { Delta, SkillRow } from '../dynamic/manager-card'
import { displayLevel, preferenceProfile } from '../dynamic/presentation'
import { AcademyRoute } from '../dynamic/AcademyRoute'
import { progressAnchors } from '../dynamic/domain'
import { DeltaBadge } from '../dynamic/ProgressPanel'
import { nextRetest, PROGRESS_VERDICT, progressRows, progressTrend } from '../dynamic/progress'
import { ProfileAvatar } from '../ui/ProfileAvatar'
import { traitColors } from '../ui/trait-labels'
import { useTraitLabels } from '../ui/use-labels'
import { ROUTE_COMMENT_MAX } from './api'
import type { MemberCard, RouteComment } from './api'
import styles from './ManagerEmployeeCard.module.css'
import { useLocalizedAttempt } from '../dynamic/use-localized-attempt'
import { useI18n } from '../i18n/context'
import { longDate } from '../i18n/format'

const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'
const trend = (value: number) => value > 0 ? 'up' : value < 0 ? 'down' : 'flat'

/** Четыре качества в одном виде для новой и прежней методики. Проценты берутся из сохранённых оценок без пересчёта. */
interface QualityRow { readonly id: TraitId; readonly percent: number; readonly level: TraitLevel; readonly change: Delta | null; readonly strength?: string; readonly nextStep?: string }

function legacyComparable(left: AssessmentResult, right: AssessmentResult) {
  return left.attemptId !== right.attemptId && left.versions.assessment === right.versions.assessment && left.versions.scoring === right.versions.scoring
}

/**
 * Единая карточка развития сотрудника для руководителя. Четыре качества и профессиональные навыки показаны раздельно
 * и не сводятся в общий процент; портрет по анкете аватара — дополнительный ориентир, не влияющий на баллы.
 */
export function ManagerEmployeeCard({ card, onAddComment, onDeleteComment, translationEndpoint }: {
  readonly card: MemberCard
  /** Перевод сгенерированного контента последней попытки на выбранный язык. */
  readonly translationEndpoint?: string | undefined
  /** Без обработчиков (просмотр без права комментировать) форма комментария не показывается. */
  readonly onAddComment?: ((week: number, text: string) => Promise<void>) | undefined
  readonly onDeleteComment?: ((id: string) => Promise<void>) | undefined
}) {
  const { t, lang } = useI18n()
  const date = (value: string) => longDate(lang, value)
  const { traitNames, levelNames } = useTraitLabels()
  const { member, avatar, dynamic, legacy } = card
  const latest = useLocalizedAttempt(dynamic?.latest ?? null, translationEndpoint ?? null)
  const evaluation = latest?.evaluation ?? null
  const traits = latest ? traitDynamics(latest, dynamic!.history) : null
  const legacyBaseline = legacy && legacyComparable(legacy.baseline, legacy.latest) ? legacy.baseline : null
  const qualities: QualityRow[] = TRAIT_IDS.map((id) => {
    if (evaluation) {
      const score = evaluation.traits[id]
      return { id, percent: score.finalPercent, level: displayLevel(score.finalPercent), change: traits!.rows[id], strength: score.strength, nextStep: score.nextStep }
    }
    const score = legacy!.latest.traits[id]
    const before = legacyBaseline?.traits[id].percent
    return { id, percent: score.percent, level: score.level, change: before === undefined ? null : { baseline: before, current: score.percent, delta: score.percent - before } }
  })
  const byPercent = [...qualities].sort((a, b) => b.percent - a.percent || TRAIT_IDS.indexOf(a.id) - TRAIT_IDS.indexOf(b.id))
  const strengths = byPercent.filter((item) => item.level === 'strength')
  const growth = byPercent.filter((item) => item.level === 'priority').reverse()
  const shownStrengths = strengths.length ? strengths : byPercent.slice(0, 1)
  const shownGrowth = growth.length ? growth : byPercent.slice(-1)
  const profile = getArchetype(latest ? preferenceProfile(latest) : legacy!.latest)
  const lastDate = latest?.completedAt ?? legacy!.latest.completedAt
  const route = latest ? routeProgress(latest, dynamic!.marks) : null
  const skills = latest ? skillCard(latest, dynamic!.history) : null
  const comparedFrom = traits?.baseline ?? (evaluation ? null : legacyBaseline)
  const comparedFromDate = comparedFrom?.completedAt ?? ''
  const id = (name: string) => `${name}-${member.id}`

  return <section className={styles.wrap} aria-label={t('Карточка развития сотрудника')}><div className={styles.card}>
    <aside className={styles.person}>
      <div className={styles.figure}>
        <ProfileAvatar code={profile.code} choice={avatar ? { kind: 'custom', params: avatar } : { kind: 'test' }} size={200}
          label={avatar ? t('Аватар: {avatarName}', { avatarName: avatarName(avatar, t) }) : t('Персонаж по тесту: {name}', { name: t(profile.archetype.name) })} />
      </div>
      <h3>{t(member.name)}</h3>
      <p className={styles.role}>{latest ? t(latest.jobRole) : t('Должность не указана')}</p>
      <dl className={styles.facts}>
        <div><dt>{t('Аватар')}</dt><dd>{avatar ? avatarName(avatar, t) : t('Не создан — показан персонаж по тесту')}</dd></div>
        <div><dt>{t('Последняя диагностика')}</dt><dd>{date(lastDate)}{!latest && t(' · прежняя методика')}</dd></div>
        {route && <div><dt>{t('Текущая практика')}</dt><dd>{route.next
          ? t('Неделя {week} · {trait}, до {date}', { week: route.next.week, trait: traitNames[route.next.trait], date: date(route.next.deadline) })
          : t('Все четыре практики отмечены сотрудником')}</dd></div>}
        <div><dt>{t('Следующее действие')}</dt><dd>{route
          ? route.next ? t(route.next.action) : t('Повторная диагностика — до {date}', { date: date(route.retestAt) })
          : t('Пройти диагностику по новой методике: после неё появятся профессиональные навыки и маршрут на 30 дней')}</dd></div>
      </dl>
    </aside>

    <div className={styles.main}>
      {!latest && <p className={styles.notice} role="note">{t('Сотрудник проходил только прежнюю методику (сохранено прохождений: {count}). Профессиональные навыки, маршрут на 30 дней и отметки практик появятся после диагностики по новой методике. Прежние результаты показаны без пересчёта.', { count: legacy!.count })}</p>}

      <section className={styles.panel} aria-labelledby={id('traits')}>
        <div className={styles.panelHead}>
          <h4 id={id('traits')}>{t('Четыре качества')}</h4>
          {comparedFrom && <p className={styles.legend}><span data-kind="before" />{t('входная')}<span data-kind="now" />{t('последняя')}</p>}
        </div>
        <ul className={styles.dynamics}>{qualities.map((item) => <li key={item.id} style={{ '--c': traitColors[item.id] } as CSSProperties}>
          <span className={styles.trait}>{traitNames[item.id]}<small>{levelNames[item.level]}</small></span>
          <span className={styles.bars} role="img" aria-label={item.change
            ? t('{trait}: входная {baseline}%, последняя {percent}%', { trait: traitNames[item.id], baseline: item.change.baseline, percent: item.percent })
            : `${traitNames[item.id]}: ${item.percent}%`}>
            {item.change && <i data-kind="before" style={{ width: `${item.change.baseline}%` }} />}
            <i data-kind="now" style={{ width: `${item.percent}%` }} />
          </span>
          <span className={styles.score}><b>{item.percent}%</b>
            {item.change && <small data-trend={trend(item.change.delta)}>{t('{signed} п.п.', { signed: signed(item.change.delta) })}</small>}</span>
        </li>)}</ul>
        <p className={styles.note}>
          {comparedFrom
            ? t('Входная оценка — {date}, последняя — {date2}. Разница показывает изменение ответов в тесте, а не доказанный рост на рабочем месте.', { date: date(comparedFromDate), date2: date(lastDate) })
            : evaluation ? t(DYNAMICS_GAP_TEXT[traits!.gap!]) : legacy!.count > 1 ? t('Сравнение невозможно: прежние попытки посчитаны по другой версии вопросов или баллов.') : t(DYNAMICS_GAP_TEXT.single)}
          {traits?.skippedEarlier && t(' Более ранние попытки проведены по другой методике или настройкам, поэтому входной считается первая сопоставимая.')}
          {latest && legacy && t(' Результаты прежней методики с новой не сравниваются.')}
        </p>
      </section>

      {latest && <ProgressMini attempt={latest} history={dynamic!.history} />}

      <div className={styles.columns}>
        <section className={styles.panel} data-tone="strength" aria-labelledby={id('strengths')}>
          <h4 id={id('strengths')}>{t('Сильные стороны')}</h4>
          <ul className={styles.points}>{shownStrengths.map((item) => <li key={item.id}><strong>{traitNames[item.id]} — {item.percent}%</strong>{item.strength && <p>{t(item.strength)}</p>}</li>)}</ul>
        </section>
        <section className={styles.panel} data-tone="growth" aria-labelledby={id('growth')}>
          <h4 id={id('growth')}>{t('Зоны роста')}</h4>
          <ul className={styles.points}>{shownGrowth.map((item) => <li key={item.id}><strong>{traitNames[item.id]} — {item.percent}%</strong>{item.nextStep && <p>{t(item.nextStep)}</p>}</li>)}</ul>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby={id('skills')}>
        <h4 id={id('skills')}>{t('Профессиональные навыки')}</h4>
        <p className={styles.caveat}>{t('Предварительная оценка по ответам в тесте, а не подтверждение квалификации. Не смешивается с четырьмя качествами.')}</p>
        {!skills ? <p className={styles.empty}>{t('Профессиональные навыки оцениваются только в новой методике — данных пока нет.')}</p>
          : skills.rows.length === 0 ? <p className={styles.empty}>{t('В этой попытке навыки не оценивались.')}</p>
          : <ul className={styles.skills}>{skills.rows.map((row) => <SkillItem key={row.key} row={row} hasBaseline={Boolean(skills.baseline)} />)}</ul>}
        {skills && <p className={styles.note}>{skills.baseline
          ? t('Изменение — к входной сопоставимой оценке от {date} по тому же навыку и той же версии каталога навыков.', { date: date(skills.baseline.completedAt!) })
          : t(DYNAMICS_GAP_TEXT[skills.gap!])}</p>}
      </section>

      <section className={styles.panel} aria-labelledby={id('route')}>
        <div className={styles.panelHead}>
          <h4 id={id('route')}>{t('Маршрут на 30 дней')}</h4>
          {route && <p className={styles.counter}>{t('Отмечено сотрудником: {marked} из 4', { marked: route.marked })}</p>}
        </div>
        {!route ? <p className={styles.empty}>{t('Маршрут появится после диагностики по новой методике.')}</p> : <>
          <ol className={styles.weeks}>
            {route.weeks.map((item) => <li key={item.week} data-marked={item.markedAt ? 'yes' : 'no'} data-next={route.next?.week === item.week || undefined}>
              <span className={styles.weekNo} aria-hidden="true">{item.markedAt ? '✓' : item.week}</span>
              <div>
                <p className={styles.weekHead}><strong>{t('Неделя {week} · {trait}', { week: item.week, trait: traitNames[item.trait] })}</strong>
                  <span>{t('дни {from}–{to}, до {date}', { from: (item.week - 1) * 7 + 1, to: weekEndDay(item.week), date: date(item.deadline) })}</span></p>
                <p>{t(item.action)}</p>
                <p className={styles.criterion}><strong>{t('Критерий выполнения:')}</strong> {t(item.successCriterion)}</p>
                <p className={styles.mark}>{item.markedAt ? t('Отмечено сотрудником {date}', { date: date(item.markedAt) }) : route.next?.week === item.week ? t('Ближайшее невыполненное действие') : t('Не отмечено')}</p>
                <WeekComments week={item.week} comments={dynamic!.comments.filter((comment) => comment.week === item.week)} onAdd={onAddComment} onDelete={onDeleteComment} />
              </div>
            </li>)}
            <li data-marked="retest"><span className={styles.weekNo} aria-hidden="true">30</span>
              <div><p className={styles.weekHead}><strong>{t('Повторная диагностика')}</strong><span>{t('до {date}', { date: date(route.retestAt) })}</span></p>
                <p>{t('В конце маршрута сотрудник проходит тест повторно; сопоставимая попытка покажет изменение ответов.')}</p></div></li>
          </ol>
          <p className={styles.note}>{t('«Отмечено сотрудником» — самостоятельная отметка в кабинете сотрудника, а не подтверждение руководителя. Отметки не меняют проценты.')}</p>
        </>}
      </section>

      <AcademyRoute completedAt={lastDate} evaluation={evaluation} />

      {latest && <Details attempt={latest} />}
    </div>
  </div></section>
}

/**
 * Мини-модуль прогресса: последнее прохождение против первого (и серединного) — те же опорные точки и проценты,
 * что во вкладке «Прогресс» у сотрудника. Полный разбор ответов остаётся у сотрудника; здесь — итог и вывод анализа.
 */
function ProgressMini({ attempt, history }: { readonly attempt: DynamicAttempt; readonly history: readonly DynamicAttempt[] }) {
  const { t, lang } = useI18n()
  const date = (value: string) => longDate(lang, value)
  const { traitNames, traitShortNames } = useTraitLabels()
  const { first, middle, count } = progressAnchors(attempt, history)
  const at = (item: DynamicAttempt) => item.completedAt ?? item.createdAt
  if (!first) return <section className={styles.panel} data-tone="progress" aria-labelledby={`progress-${attempt.id}`}>
    <h4 id={`progress-${attempt.id}`}>{t('Прогресс сотрудника')}</h4>
    <p className={styles.progressEmpty}>{t('Пока одно прохождение — оно закреплено как точка отсчёта. Повторный тест — до {date}; после него здесь появится, как изменилось каждое качество.', { date: date(nextRetest(attempt).toISOString()) })}</p>
  </section>
  const rows = progressRows(attempt, first, middle, traitNames)
  const days = Math.max(0, Math.round((Date.parse(at(attempt)) - Date.parse(at(first))) / 86_400_000))
  const tally = (list: readonly { readonly first: number | null; readonly now: number }[]) => {
    const compared = list.filter((row) => row.first !== null)
    return { up: compared.filter((row) => row.now > row.first!).length, down: compared.filter((row) => row.now < row.first!).length, total: compared.length }
  }
  const criteria = tally(rows.criteria), skills = tally(rows.skills)
  const analysis = attempt.evaluation?.progress
  const points = [{ key: 'first', title: t('Первое'), at: at(first) }, ...(middle ? [{ key: 'middle', title: t('Серединное'), at: at(middle) }] : []),
    { key: 'now', title: t('Последнее · {n}-е', { n: count }), at: at(attempt) }]
  return <section className={styles.panel} data-tone="progress" aria-labelledby={`progress-${attempt.id}`}>
    <div className={styles.panelHead}>
      <h4 id={`progress-${attempt.id}`}>{t('Прогресс сотрудника')}</h4>
      <p className={styles.progressSpan}>{count} {count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? t('прохождения') : t('прохождений')}{' '}{t('· {days} дн. между первым и последним', { days })}</p>
    </div>
    <ol className={styles.progressLine} aria-label={t('Сравниваемые прохождения')}>{points.map((point) => <li key={point.key} data-point={point.key}>
      <span aria-hidden="true" /><strong>{point.title}</strong><small>{date(point.at)}</small></li>)}</ol>
    <ul className={styles.progressRows} aria-label={t('Изменение качеств к первому прохождению')}>{rows.traits.map((row) => <li key={row.key} style={{ '--c': traitColors[row.trait] } as CSSProperties}>
      <span className={styles.progressName}>{traitShortNames[row.trait]}</span>
      <span className={styles.progressBar} aria-hidden="true">
        {row.first !== null && <i data-kind="first" style={{ width: `${row.first}%` }} />}
        <i data-kind="now" data-trend={row.first === null ? 'flat' : progressTrend(row.now - row.first)} style={{ width: `${row.now}%` }} />
      </span>
      <span className={styles.progressValues}>{row.first}% → <b>{row.now}%</b></span>
      {row.first !== null && <DeltaBadge before={row.first} now={row.now} label={t(row.name)} />}
    </li>)}</ul>
    {(criteria.total > 0 || skills.total > 0) && <ul className={styles.progressTally}>
      {criteria.total > 0 && <li><strong>{t('Критерии рубрики')}</strong><span data-trend="up">↑ {criteria.up}</span><span data-trend="down">↓ {criteria.down}</span><small>{t('из {total}', { total: criteria.total })}</small></li>}
      {skills.total > 0 && <li><strong>{t('Навыки')}</strong><span data-trend="up">↑ {skills.up}</span><span data-trend="down">↓ {skills.down}</span><small>{t('из {total} сопоставимых', { total: skills.total })}</small></li>}
    </ul>}
    {analysis ? <div className={styles.progressAnalysis}>
      <p className={styles.progressVerdict} data-verdict={analysis.professionalism.verdict}>{t(PROGRESS_VERDICT[analysis.professionalism.verdict])}</p>
      <p>{t(analysis.summary)}</p>
      <p className={styles.progressFocus}><strong>{t('Фокус до следующего теста:')}</strong> {t(analysis.nextFocus)}</p>
    </div> : <p className={styles.note}>{t('Разбор ответов «до и после» сотрудник может составить во вкладке «Прогресс» своего профиля.')}</p>}
    <p className={styles.note}>{t('Разница показывает изменение ответов в тесте, а не подтверждённый рост на рабочем месте.')}</p>
  </section>
}

/** Комментарии руководителя под неделей: список, форма добавления и удаление своих комментариев. Сотрудник увидит их в своём маршруте. */
function WeekComments({ week, comments, onAdd, onDelete }: {
  readonly week: number; readonly comments: readonly RouteComment[]
  readonly onAdd: ((week: number, text: string) => Promise<void>) | undefined; readonly onDelete: ((id: string) => Promise<void>) | undefined
}) {
  const { t, lang } = useI18n()
  const date = (value: string) => longDate(lang, value)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onAdd || !text.trim()) { setError(t('Введите текст комментария.')); return }
    setBusy(true); setError(null)
    try { await onAdd(week, text); setText(''); setOpen(false) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (!onDelete) return
    setBusy(true); setError(null)
    try { await onDelete(id) } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <div className={styles.comments}>
    {comments.length > 0 && <ul className={styles.commentList} aria-label={t('Комментарии руководителя к неделе {week}', { week })}>{comments.map((comment) => <li key={comment.id}>
      <p className={styles.commentMeta}><strong>{comment.managerName}</strong> · {date(comment.createdAt)}
        {comment.mine && onDelete && <button type="button" className={styles.linkButton} disabled={busy} onClick={() => { void remove(comment.id) }}
          aria-label={t('Удалить комментарий к неделе {week}', { week })}>{t('Удалить')}</button>}</p>
      <p className={styles.commentText}>{t(comment.text)}</p>
    </li>)}</ul>}
    {onAdd && (open
      ? <form className={styles.commentForm} onSubmit={(event) => { void submit(event) }} noValidate>
        <label>{t('Комментарий к неделе {week}', { week })}<textarea value={text} maxLength={ROUTE_COMMENT_MAX} rows={3} disabled={busy} onChange={(event) => { setText(event.target.value); setError(null) }}
            placeholder={t('Например: обсудим результат на планёрке в пятницу')} /></label>
        <p className={styles.commentHint}>{t('Сотрудник увидит комментарий под этой неделей в своём маршруте. {count} из {max}', { count: text.length, max: ROUTE_COMMENT_MAX })}</p>
        {error && <p role="alert" className={styles.commentError}>{t(error)}</p>}
        <div className={styles.commentActions}>
          <button type="submit" className={styles.commentSubmit} disabled={busy}>{busy ? t('Сохраняем…') : t('Добавить комментарий')}</button>
          <button type="button" className={styles.linkButton} disabled={busy} onClick={() => { setOpen(false); setError(null) }}>{t('Отмена')}</button>
        </div></form>
      : <><button type="button" className={styles.commentOpen} onClick={() => setOpen(true)}>{t('＋ Добавить комментарий')}</button>
        {error && <p role="alert" className={styles.commentError}>{t(error)}</p>}</>)}
  </div>
}

function SkillItem({ row, hasBaseline }: { readonly row: SkillRow; readonly hasBaseline: boolean }) {
  const { t } = useI18n()
  const { skill } = row
  return <li data-state={row.state}>
    <div className={styles.skillHead}>
      <strong>{t(row.name)}</strong>
      {skill ? <span className={styles.skillScore}><b>{skill.percent}%</b>
        {row.change && <small data-trend={trend(row.change.delta)}>{t('{signed} п.п.', { signed: signed(row.change.delta) })}</small>}</span>
        : <span className={styles.insufficient}>{t('Недостаточно данных')}</span>}
    </div>
    {skill ? <>
      <span className={styles.skillBar} aria-hidden="true">{row.change && <i data-kind="before" style={{ width: `${row.change.baseline}%` }} />}<i style={{ width: `${skill.percent}%` }} /></span>
      <p>{t(skill.explanation)}</p>
      {hasBaseline && row.changeGap === 'not-in-baseline' && <p className={styles.small}>{t('Во входной попытке этот навык не оценивался.')}</p>}
      <details className={styles.more}><summary>{t('Основание и рекомендация')}</summary>
        <p><strong>{t('Основание из ответов:')}</strong> «{skill.evidence}»</p>
        <p><strong>{t('Рекомендуемое действие:')}</strong> {t(skill.nextStep)}</p>
        <p><strong>{t('Тема для изучения ({venue}):', { venue: skill.learningVenue })}</strong>{' '}{t('{topic}. Это направление, а не назначенный или пройденный курс.', { topic: t(skill.learningTopic) })}</p>
      </details>
    </> : <p className={styles.small}>{t('Навык ожидается для этой должности, но в ответах нет свидетельства для оценки.')}</p>}
    {row.definition?.notChecked && <p className={styles.small}>{t(row.definition.notChecked)}</p>}
  </li>
}

/** Подробные ответы и обоснования раскрываются отдельно, чтобы не дублировать профиль большими блоками.
 * Внутри три части: почему такие проценты (карточка на качество), выборы в ситуациях и открытые ответы — каждая со своей разметкой. */
function Details({ attempt }: { readonly attempt: DynamicAttempt }) {
  const { t } = useI18n()
  const { traitNames, traitShortNames } = useTraitLabels()
  const evaluation = attempt.evaluation!
  const behaviour = evaluation.skills ? t('Поведение в ответах') : t('Открытые ответы')
  const chip = (trait: TraitId, secondary = false) => <span className={styles.traitChip} data-secondary={secondary || undefined}
    style={{ '--c': traitColors[trait] } as CSSProperties}>{traitShortNames[trait]}</span>
  return <details className={styles.details}>
    <summary><span className={styles.detailsTitle}>{t('Ответы и обоснования оценки')}</span>
      <span className={styles.detailsMeta}>{t('4 качества · {situations} ситуаций · {answers} открытых ответов', { situations: attempt.choices.length, answers: attempt.openQuestions.length })}</span></summary>

    <h5 className={styles.detailsHead}><span aria-hidden="true">1</span>{t('Почему такие проценты')}</h5>
    <ul className={styles.reasons}>{TRAIT_IDS.map((id) => { const score = evaluation.traits[id]; const level = displayLevel(score.finalPercent)
      const second = score.behaviorPercent ?? score.professionalPercent
      return <li key={id} style={{ '--c': traitColors[id] } as CSSProperties}>
        <div className={styles.reasonHead}><strong>{traitNames[id]}</strong><b data-level={level}>{score.finalPercent}%</b></div>
        <dl className={styles.parts}>
          <div><dt>{t('Выбор в ситуациях')}</dt><dd><span className={styles.partBar} aria-hidden="true"><i style={{ width: `${score.preferencePercent}%` }} /></span>{score.preferencePercent}%</dd></div>
          <div><dt>{behaviour}</dt><dd><span className={styles.partBar} aria-hidden="true"><i style={{ width: `${second}%` }} /></span>{second}%</dd></div>
        </dl>
        <blockquote className={styles.evidence}>
          <p className={styles.label}>{t('Основание')}{score.questionId && <span className={styles.qid}>{score.questionId}</span>}</p>
          <p>«{score.evidence}»</p>
        </blockquote>
        <p className={styles.success}><span aria-hidden="true">✓</span><span><strong>{t('Признак успеха:')}</strong> {t(score.successCriterion)}</span></p>
      </li> })}</ul>
    <p className={styles.model}><span>{t('Модель {model}', { model: evaluation.model })}</span><span>{t('Рубрика {rubricVersion}', { rubricVersion: evaluation.rubricVersion })}</span>
      {evaluation.skillRubricVersion && <span>{t('Каталог навыков {skillRubricVersion}', { skillRubricVersion: evaluation.skillRubricVersion })}</span>}</p>

    <h5 className={styles.detailsHead}><span aria-hidden="true">2</span>{t('{count} ситуаций с вариантами', { count: attempt.choices.length })}</h5>
    <ol className={styles.answers}>{attempt.choices.map((question, index) => {
      const answer = question.options.find((option) => option.id === attempt.choiceAnswers[question.id])
      return <li key={question.id}>
        <div className={styles.answerHead}><span className={styles.answerNo}>{t('Ситуация {n}', { n: index + 1 })}</span>{chip(question.primaryTrait)}{question.secondaryTrait !== question.primaryTrait && chip(question.secondaryTrait, true)}</div>
        <p className={styles.context}>{question.context}</p>
        <p className={styles.question}>{question.text}</p>
        <div className={styles.reply} data-empty={answer ? undefined : ''}><p className={styles.label}>{t('Выбор сотрудника')}</p><p>{answer?.text ?? t('Нет ответа')}</p></div>
      </li>
    })}</ol>

    <h5 className={styles.detailsHead}><span aria-hidden="true">3</span>{t('{count} открытых вопросов', { count: attempt.openQuestions.length })}</h5>
    <ol className={styles.answers}>{attempt.openQuestions.map((question, index) => {
      const text = attempt.openAnswers[question.id]?.trim()
      return <li key={question.id}>
        <div className={styles.answerHead}><span className={styles.answerNo}>{t('Вопрос {n}', { n: index + 1 })}</span>{chip(question.trait)}</div>
        <p className={styles.question}>{question.text}</p>
        <div className={styles.reply} data-kind="open" data-empty={text ? undefined : ''}><p className={styles.label}>{t('Ответ сотрудника')}</p><p>{text || t('Нет ответа')}</p></div>
      </li>
    })}</ol>
  </details>
}
