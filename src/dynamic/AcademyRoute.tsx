import { useId } from 'react'
import type { DynamicEvaluation } from './domain'
import { academyTopics } from './profile-insights'
import styles from './AcademyRoute.module.css'
import { useI18n } from '../i18n/context'
import { longDate } from '../i18n/format'

/**
 * Ориентир Bilim → BuildEX → BIU → KPI. Реальный этап приложения — диагностика; остальные этапы — внешние системы,
 * к которым приложение не подключено, поэтому статусов зачисления, курсов и KPI здесь нет.
 * Один и тот же блок видят руководитель и сам сотрудник.
 */
export function AcademyRoute({ completedAt, evaluation }: { readonly completedAt: string; readonly evaluation: DynamicEvaluation | null | undefined }) {
  const { t, lang } = useI18n()
  const titleId = useId()
  return <section className={styles.block} aria-labelledby={titleId}>
    <h4 id={titleId}>{t('Ориентир BI Academy')}</h4>
    <ol className={styles.route}>
      <li data-status="done"><span className={styles.step} aria-hidden="true">1</span><strong>Bilim</strong>
        <small>{t('Диагностика в приложении: пройдена {date}', { date: longDate(lang, completedAt) })}</small></li>
      {(['BuildEX', 'BIU'] as const).map((venue, index) => <li key={venue} data-status="external"><span className={styles.step} aria-hidden="true">{index + 2}</span>
        <strong>{venue}</strong><small>{t('Внешняя система не подключена: зачисление и прохождение курсов не отслеживаются.')}</small>
        {academyTopics(evaluation, venue).length > 0 && <small>{t('Темы для изучения: {join}', { join: academyTopics(evaluation, venue).map((topic) => t(topic)).join('; ') })}</small>}</li>)}
      <li data-status="external"><span className={styles.step} aria-hidden="true">4</span><strong>KPI</strong>
        <small>{t('Не подключено: KPI в приложении не ведутся и не выводятся из числа прохождений теста.')}</small></li>
    </ol>
  </section>
}
