import type { AssessmentResult, DevelopmentPlan } from '../domain/types'
import { getArchetype } from '../domain/archetype'
import { TRAIT_IDS } from '../domain/types'
import { dateLocale } from '../i18n/translate'
import { useI18n } from '../i18n/context'
import { localizeReason } from '../domain/recommend'
import { useTraitLabels } from '../ui/use-labels'
import styles from './PrintableReport.module.css'

/** Представление для печати A; получает те же результат/рекомендации, что и профиль B. */
export function PrintableReport({ result, plan }: {
  readonly result: AssessmentResult
  readonly plan: DevelopmentPlan | null
}) {
  const { t, lang, code: showCode } = useI18n()
  const { traitNames: names, levelNames: levels } = useTraitLabels()
  const date = new Intl.DateTimeFormat(dateLocale(lang), {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Qyzylorda',
  }).format(new Date(result.completedAt))
  const profile = getArchetype(result)
  return <article className={styles.report} data-print-report>
    <h1>{t('Профиль BI Academy')}</h1>
    <p>{t('Дата прохождения: {date} (UTC+5)', { date })}</p>
    <h2>{t('Рабочий архетип: {name} ({code})', { name: t(profile.archetype.name), code: showCode(profile.code) })}</h2>
    <p>{t(profile.archetype.tagline)} {t(profile.archetype.description)}</p>
    <p><strong>{t('Сильные стороны типа:')}</strong> {profile.archetype.strengths.map((item) => t(item)).join('; ')}.</p>
    <p><strong>{t('На что обратить внимание:')}</strong> {profile.archetype.risks.map((item) => t(item)).join('; ')}.</p>
    <table>
      <caption>{t('Четыре независимых показателя')}</caption>
      <thead><tr><th scope="col">{t('Качество')}</th><th scope="col">{t('Результат')}</th><th scope="col">{t('Интерпретация')}</th></tr></thead>
      <tbody>{TRAIT_IDS.map((trait) => <tr key={trait}>
        <th scope="row">{names[trait]}</th>
        <td>{result.traits[trait].percent}%</td>
        <td>{levels[result.traits[trait].level]}</td>
      </tr>)}</tbody>
    </table>
    <h2>{t('Действия для развития')}</h2>
    {plan && plan.recommendations.length > 0 ? plan.recommendations.map((recommendation) => <section key={recommendation.id} className={styles.action}>
      <h3>{names[recommendation.trait]}</h3>
      <p><strong>{t('Основание:')}</strong> {localizeReason(recommendation.reason, t)}</p>
      <p><strong>{t('Действие:')}</strong> {t(recommendation.action)}</p>
      <p><strong>{t('Практика:')}</strong> {t(recommendation.practice)}</p>
      <p><strong>{t('Срок:')}</strong> {t('{days} дней', { days: recommendation.durationDays })}</p>
      <p><strong>{t('Критерий выполнения:')}</strong> {t(recommendation.successCriterion)}</p>
      <p>{t('Связанные ситуации: {list}', { list: recommendation.questionIds.join(', ') })}</p>
    </section>) : <p>{t('План действий пока недоступен. Вернитесь к профилю и повторите попытку позже.')}</p>}
    {plan?.roadmap && plan.roadmap.length > 0 && <>
      <h2>{t('План на 30 дней')}</h2>
      <ol>{plan.roadmap.map((week) => <li key={week.week}>
        <strong>{t(week.days)}, {names[week.trait]}.</strong> {t(week.action)} {t('Урок:')} «{t(week.lesson.title)}». {t('Результат:')} {t(week.successCriterion)}
        {week.checkpoint && ` ${t('День 30: повторный тест и сравнение профиля.')}`}
      </li>)}</ol>
    </>}
    <p>{t('Каждое качество считается отдельно, поэтому сумма процентов не равна 100%.')}</p>
    <p>{t('Версия теста: {version}', { version: result.versions.assessment })}</p>
  </article>
}
