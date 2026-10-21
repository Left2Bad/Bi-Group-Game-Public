import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api, post } from '../auth/api'
import type { TraitId } from '../domain/types'
import { traitColors } from '../ui/trait-labels'
import { Button, Card, Eyebrow } from '../ui/primitives'
import { comparableDynamic, PROGRESS_PROMPT_VERSION } from './domain'
import type { DynamicAttempt } from './domain'
import { nextRetest, PROGRESS_VERDICT, progressRows, progressTrend, signedPercent } from './progress'
import type { ProgressRow } from './progress'
import { changeWords } from './change-text'
import { ProfileIcon } from './ProfileIcons'
import styles from './ProgressPanel.module.css'
import { useI18n } from '../i18n/context'
import { dateLocale, msg } from '../i18n/translate'
import type { Lang } from '../i18n/translate'

const dayFormat = (lang: Lang) => new Intl.DateTimeFormat(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Qyzylorda' })
const dayOf = (lang: Lang) => (value: string | Date) => dayFormat(lang).format(typeof value === 'string' ? new Date(value) : value)
const when = (attempt: DynamicAttempt) => attempt.completedAt ?? attempt.createdAt

/** Бейдж «+5%» зелёным или «−3%» красным; для скринридера — словами. */
export function DeltaBadge({ before, now, label, size = 'normal' }: { readonly before: number; readonly now: number; readonly label: string; readonly size?: 'normal' | 'large' }) {
  const { t } = useI18n()
  const delta = now - before
  const words = `${label}: ${changeWords(delta, t)}`
  return <span className={styles.delta} data-trend={progressTrend(delta)} data-size={size} title={t('было {before}% → стало {now}%', { before, now })}>
    <span aria-hidden="true">{signedPercent(delta)}</span><span className={styles.srOnly}>{words}</span></span>
}

type JobReply = { jobId?: string; pending?: boolean; attempt?: DynamicAttempt }
async function requestAnalysis(id: string): Promise<DynamicAttempt> {
  const started = await api<JobReply>(`/dynamic/attempts/${encodeURIComponent(id)}/progress`, post({}))
  if (started.attempt) return started.attempt
  if (!started.jobId) throw new Error(msg('Сервер не вернул номер задачи. Повторите действие.'))
  const deadline = Date.now() + 390_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const result = await api<JobReply>(`/dynamic/jobs/${encodeURIComponent(started.jobId)}`)
    if (result.attempt) return result.attempt
    if (!result.pending) throw new Error(msg('Сервер не смог определить состояние анализа. Повторите действие.'))
  }
  throw new Error(msg('Анализ занимает слишком много времени. Обновите страницу позже.'))
}

function RowList({ rows, hasMiddle, label }: { readonly rows: readonly ProgressRow[]; readonly hasMiddle: boolean; readonly label: string }) {
  const { t } = useI18n()
  return <ul className={styles.rows} aria-label={label}>{rows.map((row, index) => <li key={row.key} style={{ '--i': index } as CSSProperties}>
    <div className={styles.rowHead}><strong>{t(row.name)}</strong>
      <span className={styles.rowDeltas}>
        {row.first === null ? <span className={styles.chip}>{t('новое')}</span> : <DeltaBadge before={row.first} now={row.now} label={t('{name} к первому прохождению', { name: t(row.name) })} />}
        {hasMiddle && row.middle !== null && <small>{t('к серединному')}{' '}<DeltaBadge before={row.middle} now={row.now} label={t('{name} к серединному прохождению', { name: t(row.name) })} /></small>}
      </span></div>
    <span className={styles.bar} aria-hidden="true">
      {row.first !== null && <i data-kind="first" style={{ width: `${row.first}%` }} />}
      <i data-kind="now" data-trend={row.first === null ? 'flat' : progressTrend(row.now - row.first)} style={{ width: `${row.now}%` }} />
    </span>
    <p className={styles.rowValues}>{row.first === null ? t('Сейчас {now}%. В первом прохождении не оценивалось.', { now: row.now })
      : t('Было {first}%{v} → стало {now}%', { first: row.first, v: hasMiddle && row.middle !== null ? t(' → в середине {middle}%', { middle: row.middle }) : '', now: row.now })}</p>
  </li>)}</ul>
}

/**
 * Вкладка «Прогресс»: первое прохождение закреплено как точка отсчёта, последнее сравнивается с ним и с серединным
 * (при 7 попытках — с 1-й и 4-й). Проценты — из сохранённых оценок, текст анализа — от модели при оценке повторной попытки.
 */
export function ProgressPanel({ attempt, first, middle, count, traitNames, canAnalyze, onAttempt }: {
  readonly attempt: DynamicAttempt; readonly first: DynamicAttempt | null; readonly middle: DynamicAttempt | null
  readonly count: number; readonly traitNames: Readonly<Record<TraitId, string>>
  /** Сотрудник может запросить анализ сам; в примере и чужом профиле — нет. */
  readonly canAnalyze: boolean; readonly onAttempt?: ((attempt: DynamicAttempt) => void) | undefined
}) {
  const { t, lang } = useI18n()
  const day = dayOf(lang)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retest = nextRetest(attempt)
  const [today] = useState(() => Date.now())
  const daysLeft = Math.ceil((retest.getTime() - today) / 86_400_000)
  if (!first || !attempt.evaluation) return <Card className={styles.empty} aria-labelledby="progress-empty">
    <span className={styles.emptyIcon} aria-hidden="true"><ProfileIcon name="chart" /></span>
    <Eyebrow>{t('Цикл «до и после»')}</Eyebrow>
    <h2 id="progress-empty">{t('Первое прохождение закреплено как точка отсчёта')}</h2>
    <p>{t('Результат от {day} — основа для всех будущих сравнений. Пройдите тест повторно через 30 дней, {day2}: здесь появится, на сколько процентов изменилось каждое качество, критерий и навык, и разбор того, насколько профессиональнее стали ваши ответы.', { day: day(when(attempt)), day2: day(retest) })}</p>
    {canAnalyze && <Link className={styles.cta} to="/assessment"><ProfileIcon name="repeat" />{daysLeft <= 0 ? t('Пройти повторный тест') : t('Пройти тест раньше срока')}</Link>}
  </Card>
  const rows = progressRows(attempt, first, middle, traitNames)
  const analysis = attempt.evaluation.progress
  const otherSet = analysis && (analysis.firstId !== first.id || analysis.middleId !== (middle?.id ?? null))
  // Анализ прежней версии промпта (например, с английскими «first» и «current» в тексте) можно пересоздать.
  const stale = otherSet || (analysis && analysis.promptVersion !== PROGRESS_PROMPT_VERSION)
  const exact = comparableDynamic(first, attempt) && (!middle || comparableDynamic(middle, attempt))
  const days = Math.round((Date.parse(when(attempt)) - Date.parse(when(first))) / 86_400_000)
  const middleNumber = Math.floor((count - 1) / 2) + 1
  const analyze = () => {
    setBusy(true); setError(null)
    requestAnalysis(attempt.id).then((next) => onAttempt?.(next)).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false))
  }
  const points = [
    { key: 'first', title: t('Первое'), note: t('точка отсчёта'), at: when(first) },
    ...(middle ? [{ key: 'middle', title: t('Серединное · {n}-е', { n: middleNumber }), note: t('промежуточная точка'), at: when(middle) }] : []),
    { key: 'now', title: t('Последнее · {n}-е', { n: count }), note: t('текущий результат'), at: when(attempt) },
  ]
  return <div className={styles.progress}>
    <Card className={styles.hero} aria-labelledby="progress-title">
      <div className={styles.heroText}>
        <Eyebrow className={styles.heroEyebrow}>{t('Цикл «до и после»')}</Eyebrow>
        <h2 id="progress-title">{t('Ваш прогресс за {days}', { days })}{' '}{days % 10 === 1 && days % 100 !== 11 ? t('день') : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? t('дня') : t('дней')}</h2>
        <p>{t('Последнее прохождение сравнивается с первым')}{middle ? t(' и с серединным') : ''}{t('. Зелёным — рост, красным — снижение.')}</p>
      </div>
      <ol className={styles.timeline} aria-label={t('Сравниваемые прохождения')}>{points.map((point) => <li key={point.key} data-point={point.key}>
        <span className={styles.dot} aria-hidden="true" /><strong>{point.title}</strong><span>{day(point.at)}</span><small>{point.note}</small></li>)}</ol>
      <ul className={styles.headline} aria-label={t('Изменение качеств к первому прохождению')}>{rows.traits.map((row, index) => <li key={row.key}
        style={{ '--c': traitColors[row.trait], '--i': index } as CSSProperties}>
        <span className={styles.headName}>{t(row.name)}</span>
        {row.first !== null && <DeltaBadge before={row.first} now={row.now} label={t(row.name)} size="large" />}
        <span className={styles.headValues}>{row.first}% → {row.now}%</span>
        {middle && row.middle !== null && <span className={styles.headMiddle}>{t('к серединному')}{' '}<DeltaBadge before={row.middle} now={row.now} label={t('{name} к серединному прохождению', { name: t(row.name) })} /></span>}
      </li>)}</ul>
      <p className={styles.retest}><ProfileIcon name="repeat" />{daysLeft <= 0 ? t('Следующий повторный тест можно пройти уже сейчас.') : t('Следующий повторный тест — {day}', { day: day(retest) })}
        {canAnalyze && daysLeft <= 0 && <> <Link to="/assessment">{t('Пройти тест')}</Link></>}</p>
    </Card>

    <Card className={styles.analysis} aria-labelledby="progress-analysis">
      <h2 id="progress-analysis"><span className={styles.icon}><ProfileIcon name="answers" /></span>{t('Что улучшилось в ответах')}</h2>
      {analysis ? <>
        <p className={styles.verdict} data-verdict={analysis.professionalism.verdict}>{t(PROGRESS_VERDICT[analysis.professionalism.verdict])}</p>
        <p className={styles.summary}>{t(analysis.summary)}</p>
        <p className={styles.text}>{t(analysis.professionalism.explanation)}</p>
        {(analysis.professionalism.before || analysis.professionalism.now) && <div className={styles.quotes}>
          {analysis.professionalism.before && <figure data-kind="before"><figcaption>{t('Было')}</figcaption><blockquote>«{analysis.professionalism.before}»</blockquote></figure>}
          {analysis.professionalism.now && <figure data-kind="now"><figcaption>{t('Стало')}</figcaption><blockquote>«{analysis.professionalism.now}»</blockquote></figure>}
        </div>}
        {analysis.trajectory && <p className={styles.text}><strong>{t('Через серединное прохождение:')}</strong> {t(analysis.trajectory)}</p>}
        {analysis.improvements.length > 0 && <section className={styles.group} aria-labelledby="progress-better"><h3 id="progress-better">{t('Что стало лучше')}</h3>
          <ul className={styles.points}>{analysis.improvements.map((item) => <li key={item.area} data-tone="up"><strong>{t(item.area)}</strong><p>{t(item.explanation)}</p>
            {(item.before || item.now) && <p className={styles.pair}>{item.before && <span>{t('Было: «{before}»', { before: item.before })}</span>}{item.now && <span>{t('Стало: «{now}»', { now: item.now })}</span>}</p>}</li>)}</ul></section>}
        {analysis.attention.length > 0 && <section className={styles.group} aria-labelledby="progress-attention"><h3 id="progress-attention">{t('На что обратить внимание')}</h3>
          <ul className={styles.points}>{analysis.attention.map((item) => <li key={item.area} data-tone="down"><strong>{t(item.area)}</strong><p>{t(item.explanation)}</p></li>)}</ul></section>}
        <p className={styles.focus}><ProfileIcon name="target" /><span><b>{t('Фокус до следующего теста')}</b>{t(analysis.nextFocus)}</span></p>
        {stale && <p className={styles.muted}>{otherSet ? t('Анализ составлен по другому набору прохождений.') : t('Анализ составлен прежней версией разбора.')}{canAnalyze ? t(' Его можно обновить.') : ''}</p>}
      </> : <p className={styles.text}>{canAnalyze ? t('Разбор ответов ещё не составлен: модель сравнит ваши ответы с первым прохождением и опишет, что стало профессиональнее.')
        : t('Разбор ответов для этого прохождения не составлен.')}</p>}
      {canAnalyze && (!analysis || stale) && <Button onClick={analyze} disabled={busy}>{busy ? t('Анализируем ответы…') : analysis ? t('Обновить анализ') : t('Проанализировать прогресс')}</Button>}
      {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    </Card>

    {rows.criteria.length > 0 && <Card className={styles.block} aria-labelledby="progress-criteria">
      <h2 id="progress-criteria"><span className={styles.icon}><ProfileIcon name="target" /></span>{t('Профессиональные критерии')}</h2>
      <p className={styles.muted}>{t('Шесть критериев рубрики. Уровень 0–4 показан в процентах: шаг — 25%.')}</p>
      <RowList rows={rows.criteria} hasMiddle={Boolean(middle)} label={t('Изменения по критериям')} />
    </Card>}
    {rows.skills.length > 0 && <Card className={styles.block} aria-labelledby="progress-skills">
      <h2 id="progress-skills"><span className={styles.icon}><ProfileIcon name="chart" /></span>{t('Профессиональные навыки')}</h2>
      <p className={styles.muted}>{t('Навыки, проявленные в последних ответах. «Новое» — навык не оценивался в первом прохождении.')}</p>
      <RowList rows={rows.skills} hasMiddle={Boolean(middle)} label={t('Изменения по навыкам')} />
    </Card>}
    <p className={styles.footnote}>{exact ? '' : t('Между прохождениями обновлялись модель или банк вопросов, поэтому сравнение ориентировочное. ')}{t('Разница процентов показывает, как изменились ответы в тесте, а не подтверждённый рост квалификации на рабочем месте.')}</p>
  </div>
}
