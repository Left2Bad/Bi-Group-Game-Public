import { useState } from 'react'
import type { TraitId } from '../domain/types'
import { TRAIT_IDS } from '../domain/types'
import { changeSentence, changeWords } from './change-text'
import type { DynamicAttempt } from './domain'
import { DYNAMICS_GAP_TEXT, attemptsForComparison, skillCard } from './manager-card'
import type { SkillRow } from './manager-card'
import { displayLevel } from './presentation'
import { ProfileIcon } from './ProfileIcons'
import styles from './ProfileInsights.module.css'
import { useI18n } from '../i18n/context'
import { longDate } from '../i18n/format'
import { msg } from '../i18n/translate'

const STRONG = 75
const WEAK = 55
const trend = (delta: number) => delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

interface FocusItem { readonly key: string; readonly name: string; readonly kind: 'качество' | 'навык'; readonly percent: number; readonly text: string; readonly change: string | null }

/**
 * Сильные стороны и зоны роста: и качества, и профессиональные навыки, крупно и с понятным действием.
 * Порог сильной стороны — 75%, зоны роста — ниже 75%; в каждой колонке не больше 4 пунктов. Навыки без данных не попадают никуда.
 */
export function StrengthsAndGrowth({ attempt, baseline, traitNames, onDetails, planLink }: {
  readonly attempt: DynamicAttempt; readonly baseline: DynamicAttempt | null
  readonly traitNames: Readonly<Record<TraitId, string>>; readonly onDetails: () => void; readonly planLink: React.ReactNode
}) {
  const { t } = useI18n()
  const evaluation = attempt.evaluation!
  const skills = skillCard(attempt, attemptsForComparison(attempt, baseline))
  const traitItem = (id: TraitId, text: string): FocusItem => {
    const score = evaluation.traits[id]
    const before = baseline?.evaluation?.traits[id]?.finalPercent
    return { key: `trait-${id}`, name: traitNames[id], kind: msg('качество'), percent: score.finalPercent, text,
      change: before === undefined ? null : changeWords(score.finalPercent - before, t) }
  }
  const skillItem = (row: SkillRow, text: string): FocusItem => ({ key: `skill-${row.key}`, name: row.name, kind: msg('навык'), percent: row.skill!.percent, text,
    change: row.change ? changeWords(row.change.delta, t) : null })
  const ranked = [...TRAIT_IDS].sort((a, b) => evaluation.traits[b].finalPercent - evaluation.traits[a].finalPercent)
  const assessed = skills.rows.filter((row) => row.skill)
  const strongTraits = ranked.filter((id) => evaluation.traits[id].finalPercent >= STRONG)
  const strength: FocusItem[] = [
    ...(strongTraits.length ? strongTraits : ranked.slice(0, 1)).map((id) => traitItem(id, evaluation.traits[id].strength)),
    ...assessed.filter((row) => row.skill!.percent >= STRONG).map((row) => skillItem(row, row.skill!.explanation)),
  ].sort((a, b) => b.percent - a.percent).slice(0, 4)
  const growth: FocusItem[] = [
    ...[...ranked].reverse().filter((id) => evaluation.traits[id].finalPercent < STRONG).slice(0, 2).map((id) => traitItem(id, evaluation.traits[id].nextStep)),
    ...assessed.filter((row) => row.skill!.percent < WEAK).map((row) => skillItem(row, row.skill!.nextStep)),
  ].sort((a, b) => a.percent - b.percent).slice(0, 4)
  const noStrong = strongTraits.length === 0
  const renderItems = (items: FocusItem[], tone: 'strength' | 'growth') => <ul className={styles.items}>{items.map((item) => <li key={item.key}>
    <span className={styles.pct} data-level={displayLevel(item.percent)}>{item.percent}%</span>
    <div><p className={styles.itemName}><strong>{t(item.name)}</strong><span className={styles.kind}>{t(item.kind)}</span></p>
      <p className={styles.itemText}>{t(item.text)}</p>
      {item.change && <p className={styles.itemChange} data-tone={tone}>{t('С входной оценки {change}', { change: item.change })}</p>}</div>
  </li>)}</ul>
  return <div className={styles.focus}>
    <section className={styles.panel} data-tone="strength" aria-labelledby="focus-strengths"><h2 id="focus-strengths"><span className={styles.icon}><ProfileIcon name="strength" /></span>{t('Сильные стороны')}</h2>
      {noStrong && <p className={styles.lead}>{t('Пока ни одно качество не достигло 75%. Вот самое сильное.')}</p>}
      {renderItems(strength, 'strength')}</section>
    <section className={styles.panel} data-tone="growth" aria-labelledby="focus-growth"><h2 id="focus-growth"><span className={styles.icon}><ProfileIcon name="growth" /></span>{t('Зоны роста')}</h2>
      {growth.length === 0 ? <p className={styles.lead}>{t('Явных слабых мест нет: все качества от 75%, навыки не ниже 55%. Закрепляйте результат практикой.')}</p> : renderItems(growth, 'growth')}
      <p className={styles.panelActions}>{planLink}<button type="button" className={styles.linkButton} onClick={onDetails}>{t('Посмотреть обоснования')}</button></p></section>
  </div>
}

/** Динамика навыков: входная и последняя сопоставимая оценки, изменение словами, основание и рекомендация раскрываются. */
export function SkillDynamics({ attempt, baseline, progressHint }: {
  readonly attempt: DynamicAttempt; readonly baseline: DynamicAttempt | null
  /** Ссылка на вкладку «Прогресс»: при повторных прохождениях изменения показаны там, а не здесь. */
  readonly progressHint?: React.ReactNode
}) {
  const { t, lang } = useI18n()
  const [now] = useState(() => Date.now())
  const card = skillCard(attempt, attemptsForComparison(attempt, baseline))
  const date = (value: string) => longDate(lang, value)
  if (card.rows.length === 0) return null
  // Сводка сверху: средний уровень, сколько в среднем до цели 75% и когда повторный тест (или средний сдвиг, если сравнение уже есть).
  const rated = card.rows.flatMap((row) => row.skill ? [row.skill.percent] : [])
  const average = rated.length > 0 ? Math.round(rated.reduce((sum, value) => sum + value, 0) / rated.length) : null
  const toGoal = rated.length > 0 ? Math.round(rated.reduce((sum, value) => sum + Math.max(0, STRONG - value), 0) / rated.length) : null
  const deltas = card.rows.flatMap((row) => row.change ? [row.change.delta] : [])
  const shift = deltas.length > 0 ? Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length) : null
  const daysLeft = Math.max(0, Math.ceil((new Date(attempt.completedAt ?? attempt.createdAt).getTime() + 30 * 86_400_000 - now) / 86_400_000))
  return <section className={styles.skills} aria-labelledby="skill-dynamics"><div className={styles.skillsHead}>
    <h2 id="skill-dynamics"><span className={styles.icon}><ProfileIcon name="chart" /></span>{t('Динамика навыков')}</h2>
    {card.baseline && <p className={styles.legend}><span data-kind="before" />{t('входная оценка')}<span data-kind="now" />{t('сейчас')}</p>}
  </div>
  <p className={styles.caveat}>{t('Предварительная оценка по вашим ответам, а не подтверждение квалификации. Не смешивается с четырьмя качествами.')}</p>
  <dl className={styles.skillSummary}>
    <div><dt>{t('Средний уровень')}</dt><dd>{average === null ? '—' : `${average}%`}</dd></div>
    <div><dt>{t('До цели {goal}%', { goal: STRONG })}</dt><dd data-done={toGoal === 0 ? '' : undefined}>{toGoal === null ? '—' : toGoal === 0 ? t('Достигнута') : `+${toGoal}%`}</dd></div>
    {shift !== null ? <div><dt>{t('Изменение к входной')}</dt><dd data-trend={trend(shift)}>{shift > 0 ? '+' : ''}{shift}%</dd></div>
      : <div><dt>{t('Повторный тест')}</dt><dd>{daysLeft === 0 ? t('Уже можно') : t('через {daysLeft} дн.', { daysLeft })}</dd></div>}
  </dl>
  <ul className={styles.skillList}>{card.rows.map((row) => <li key={row.key} data-state={row.state}>
    <div className={styles.skillTop}><strong>{t(row.name)}</strong>
      {row.skill ? <span className={styles.skillGoal}><b className={styles.skillPct} data-level={displayLevel(row.skill.percent)}>{row.skill.percent}%</b>
        <small>{row.skill.percent >= STRONG ? t('цель достигнута') : t('→ цель {goal}%', { goal: STRONG })}</small></span> : <span className={styles.chip}>{t('Недостаточно данных')}</span>}</div>
    {row.skill && <>
      <span className={styles.bar} role="img" aria-label={row.change ? t('{name}: входная оценка {baseline}%, сейчас {percent}%', { name: t(row.name), baseline: row.change.baseline, percent: row.skill.percent }) : `${t(row.name)}: ${row.skill.percent}%`}>
        {row.change && <i data-kind="before" style={{ width: `${row.change.baseline}%` }} />}
        <i data-kind="now" data-level={displayLevel(row.skill.percent)} style={{ width: `${row.skill.percent}%` }} />
        <span className={styles.goal} style={{ left: `${STRONG}%` }} />
      </span>
      {row.change ? <p className={styles.change} data-trend={trend(row.change.delta)}>{changeSentence(row.change.baseline, row.change.current, false, t)}</p>
        : card.baseline && row.changeGap === 'not-in-baseline' ? <p className={styles.muted}>{t('Во входной оценке этого навыка не было — сравнить не с чем.')}</p> : null}
      <p className={styles.skillText}>{t(row.skill.explanation)}</p>
      {row.skill.percent < STRONG && <p className={styles.nextStep}><ProfileIcon name="target" /><span><b>{t('Следующий шаг')}</b>{t(row.skill.nextStep)}</span></p>}
      <details className={styles.more}><summary>{t('Основание и что делать')}</summary>
        <div className={styles.moreBody}>
          <figure className={styles.evidence}><figcaption>{t('Основание из ваших ответов')}</figcaption><blockquote>{row.skill.evidence}</blockquote>{lang !== 'ru' && <small>{t('Цитата из вашего ответа приводится без перевода.')}</small>}</figure>
          {row.skill.percent >= STRONG && <div className={styles.moreItem}><span>{t('Что делать дальше')}</span><p>{t(row.skill.nextStep)}</p></div>}
          <div className={styles.moreItem}><span>{t('Тема для изучения')}</span>
            <p className={styles.topic}><b>{row.skill.learningVenue}</b>{t(row.skill.learningTopic)}</p>
            <small>{t('Это направление, а не назначенный или пройденный курс.')}</small></div>
        </div>
      </details></>}
    {!row.skill && <p className={styles.muted}>{t('Навык ожидается для вашей должности, но в ответах нет свидетельства для оценки.')}</p>}
    {row.definition?.notChecked && <p className={styles.notChecked}>{t(row.definition.notChecked)}</p>}
  </li>)}</ul>
  {!card.baseline && progressHint ? <p className={styles.note}>{progressHint}</p> : <p className={styles.note}>{card.baseline
    ? t('Сравнение с входной оценкой от {date} по тому же навыку. Изменение показывает, как изменились ваши ответы в тесте, а не доказанный рост на рабочем месте.', { date: date(card.baseline.completedAt!) })
    : t(DYNAMICS_GAP_TEXT[card.gap!])}</p>}
  </section>
}
