import type { ConsistencyLevel, ConsistencyReport, ConsistencySignal } from '../../domain/consistency'
import { useI18n } from '../../i18n/context'
import { msg } from '../../i18n/translate'
import { Card } from '../../ui/primitives'
import styles from './ConsistencyCard.module.css'
import { consistencyLabels } from './consistency-labels'

const verdicts: Readonly<Record<ConsistencyLevel, string>> = {
  consistent: msg('Выбор в ситуациях не похож ни на ответы «как надо», ни на случайный набор. Профиль можно читать как есть.'),
  check: msg('Часть ответов похожа на осторожный выбор «как надо» или на ответ не по тексту. Перечитайте ситуации и спросите себя: так ли вы поступаете на самом деле?'),
  low: msg('Ответы похожи на выбор «как надо» или на случайный набор. Профиль может не показывать, как вы действуете. Пройдите тест ещё раз и выбирайте то, что сделали бы сами.'),
}

const icons: Readonly<Record<ConsistencyLevel, string>> = { consistent: '✓', check: '!', low: '!!' }

const signalTitles = {
  balanced: msg('Компромиссных ответов: {value} из {outOf}'),
  position: msg('Одна и та же позиция: {value} из {outOf}'),
} as const

const signalHints = {
  balanced: msg('Компромисс звучит безопаснее всего, поэтому «как надо» чаще всего выглядит именно так. Если он почти везде, вы могли угадывать ожидания, а не выбирать своё.'),
  position: msg('Порядок вариантов в каталоге перемешан. Если почти все ответы стоят на одной букве, текст ситуаций, скорее всего, не читали.'),
} as const

const severityNames = { none: msg('в норме'), watch: msg('внимание'), flag: msg('сигнал') } as const

function SignalRow({ signal }: { readonly signal: ConsistencySignal }) {
  const { t } = useI18n()
  return <li className={styles.signal} data-severity={signal.severity}>
    <p className={styles.signalTitle}>
      <strong>{t(signalTitles[signal.id], { value: signal.value, outOf: signal.outOf })}</strong>
      <span className={styles.severity}>{t(severityNames[signal.severity])}</span>
    </p>
    <p>{t(signalHints[signal.id])}</p>
    <p className={styles.limits}>{t('Внимание — от {watch}, сигнал — от {flag}.', { watch: signal.watchAt, flag: signal.flagAt })}</p>
  </li>
}

/** Подсказка, стоит ли перечитать ответы. Не меняет проценты и не оценивает честность. */
export function ConsistencyCard({ report }: { readonly report: ConsistencyReport }) {
  const { t } = useI18n()
  return <Card className={styles.card} data-level={report.level} aria-labelledby="consistency-title">
    <div className={styles.head}>
      <span className={styles.icon} aria-hidden="true">{icons[report.level]}</span>
      <div>
        <h2 id="consistency-title">{t('Согласованность ответов')}</h2>
        <p className={styles.level}>{t(consistencyLabels[report.level])}</p>
      </div>
    </div>
    <p>{t(verdicts[report.level])}</p>
    <details className={styles.details}>
      <summary>{t('Как это считается')}</summary>
      <ul className={styles.signals}>{report.signals.map((signal) => <SignalRow key={signal.id} signal={signal} />)}</ul>
      <p className={styles.limits}>{t('Вариантов с нулём баллов обоим качествам: {count}. Справочно, на уровень не влияет.', { count: report.avoidCount })}</p>
    </details>
    <p className={styles.note}>{t('Индикатор не меняет проценты профиля и не оценивает честность. Это подсказка, стоит ли перечитать ответы.')}</p>
  </Card>
}
