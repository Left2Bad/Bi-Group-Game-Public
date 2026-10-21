import { Link } from 'react-router-dom'
import type { DevelopmentPlan } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { localizeReason } from '../../domain/recommend'
import { Card, Eyebrow, Page, SectionHeading, StatusMessage } from '../../ui/primitives'
import { useTraitLabels } from '../../ui/use-labels'
import { ProfileAvatar } from '../../ui/ProfileAvatar'
import { STICKER_COLORS } from '../../ui/figure-geometry'
import { useAvatarChoice } from '../../ui/use-avatar'
import styles from './DevelopmentPage.module.css'

export interface DevelopmentPageProps {
  readonly plan: DevelopmentPlan | null
  readonly completedIds: readonly string[]
  readonly onCompletedChange: (id: string, completed: boolean) => void
  readonly notice?: string | null
  readonly warning?: boolean
  /** Код теста: персонаж собирает наклейки за выполненные практики. */
  readonly archetypeCode?: string | undefined
}

/** B представляет план C; отметки и их сохранение предоставляет интеграционный слой A. */
export function DevelopmentPage({ plan, completedIds, onCompletedChange, notice, warning = false, archetypeCode }: DevelopmentPageProps) {
  const { t } = useI18n()
  const [avatar] = useAvatarChoice()
  const { traitNames } = useTraitLabels()
  const recommendations = plan?.recommendations.filter((item) => plan.priorityTraits.length
    ? plan.priorityTraits.includes(item.trait) : item.kind === 'maintenance').slice(0, 2) ?? []
  const completedCount = recommendations.filter((item) => completedIds.includes(item.id)).length
  const maintenance = recommendations.length > 0 && recommendations.every((item) => item.kind === 'maintenance')
  return <Page className={styles.page}>
    <header className={styles.header}>
      <Eyebrow>{t('От результата к практике')}</Eyebrow><h1>{t('Маршрут развития')}</h1>
      <p>{t('Начните с одного действия. Примените его в рабочей ситуации и проверьте результат по понятному критерию.')}</p>
    </header>
    {recommendations.length === 0 ? <Card>
      <h2>{t('Маршрут пока недоступен')}</h2><p>{t('Профиль сохранён в текущей сессии. Вернитесь к нему и попробуйте открыть маршрут ещё раз.')}</p>
    </Card> : <>
      {archetypeCode && <section className={styles.stickers} aria-labelledby="stickers-title">
        <ProfileAvatar code={archetypeCode} choice={avatar} size={260} stickers={completedCount} />
        <div>
          <p className={styles.stickerCount}>{t('Наклеек: {count} из {total}', { count: completedCount, total: recommendations.length })}</p>
          <h2 id="stickers-title">{t('Наклейки на каске')}</h2>
          <ul className={styles.stickerSlots} aria-hidden="true">{recommendations.map((item, index) => <li key={item.id}
            style={completedIds.includes(item.id) ? { background: STICKER_COLORS[index % STICKER_COLORS.length], borderColor: 'transparent' } : undefined}>{index + 1}</li>)}</ul>
          <p>{t('Отмеченная практика — наклейка на каске. После повторного теста персонаж может смениться, если сдвинется буква.')}</p>
        </div>
      </section>}
      <Card className={styles.overview}>
        <SectionHeading title={maintenance ? t('Поддержите сильные стороны') : t('Ваш фокус на ближайшие дни')}
          description={maintenance ? t('По ответам нет выраженного приоритета развития. Эти практики помогут применить сильные стороны.') : t('До двух направлений из вашего профиля. Выполнять всё одновременно не обязательно.')} />
        <p className={styles.counter}>{t('Выполнено действий:')} <strong>{t('{count} из {total}', { count: completedCount, total: recommendations.length })}</strong></p>
        <p>{t('Отметки не меняют проценты теста: изменение покажет повторное прохождение в конце месяца.')}</p>
      </Card>
      {notice && <StatusMessage warning={warning}>{t(notice)}</StatusMessage>}
      <div className={styles.cards}>{recommendations.map((item, index) => {
        const completed = completedIds.includes(item.id)
        return <Card key={item.id} className={`${styles.actionCard} ${completed ? styles.completed : ''}`} aria-label={t('Практика: {name}', { name: traitNames[item.trait] })}>
          <div className={styles.cardHeader}><span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
            <div><Eyebrow>{item.kind === 'maintenance' ? t('Поддерживающая практика') : t('Направление развития')}</Eyebrow><h2>{traitNames[item.trait]}</h2></div>
            <span className={styles.duration}>{t('{days} дней', { days: item.durationDays })}</span>
          </div>
          <p className={styles.action}>{t(item.action)}</p>
          <dl className={styles.details}>
            <div><dt>{t('На какой ответ опираемся')}</dt><dd>{localizeReason(item.reason, t)}</dd></div>
            <div><dt>{t('Как применить')}</dt><dd>{t(item.practice)}</dd></div>
            <div><dt>{t('Критерий выполнения')}</dt><dd>{t(item.successCriterion)}</dd></div>
          </dl>
          <p className={styles.source}>{t('Связанные ситуации: {list}', { list: item.questionIds.join(', ') })}</p>
          <label className={styles.check}>
            <input type="checkbox" checked={completed} aria-label={t('Выполнено: {name}', { name: traitNames[item.trait] })}
              onChange={(event) => onCompletedChange(item.id, event.target.checked)} />
            <span>{completed ? t('Действие выполнено') : t('Отметить выполнение')}</span>
          </label>
        </Card>
      })}</div>
      {plan?.roadmap && plan.roadmap.length > 0 && <section className={styles.roadmap} aria-label={t('План на 30 дней')}>
        <SectionHeading title={t('План на 30 дней')} description={t('Четыре недели: по одной практике и одному короткому уроку в неделю. В конце — повторный тест, чтобы увидеть изменения.')} />
        <ol className={styles.timeline}>{plan.roadmap.map((week) => <li key={week.week} className={styles.week} aria-label={t('Неделя {n}: {name}', { n: week.week, name: traitNames[week.trait] })}>
          <div className={styles.weekMarker}><span>{week.week}</span></div>
          <div className={styles.weekBody}>
            <p className={styles.weekMeta}><span>{t(week.days)}</span>{traitNames[week.trait]}: {t(week.title).toLowerCase()}</p>
            <p className={styles.weekAction}>{t(week.action)}</p>
            <div className={styles.lesson}><strong>{t('Урок на {minutes} мин:', { minutes: week.lesson.minutes })} {t(week.lesson.title)}</strong><p>{t(week.lesson.idea)}</p></div>
            <p className={styles.weekCriterion}><strong>{t('Результат недели:')}</strong> {t(week.successCriterion)}</p>
            {week.checkpoint && <div className={styles.checkpoint}>
              <strong>{t('Контрольная точка — день 30')}</strong>
              <p>{t('Пройдите тест ещё раз и сравните профиль с нынешним: сравнение попыток покажет, где изменились ваши решения.')}</p>
              <Link to="/intro">{t('Пройти тест повторно')}</Link>
            </div>}
          </div>
        </li>)}</ol>
      </section>}
      <aside className={styles.learning}><h2>{t('Обсудите план с наставником')}</h2>
        <p>{t('Покажите руководителю или наставнику архетип и план на 30 дней: так проще выбрать задачи на объекте, где практики можно применить сразу.')}</p>
      </aside>
    </>}
    <nav className={styles.links} aria-label={t('Действия с маршрутом')}>
      <Link to="/results">{t('Вернуться к профилю')}</Link><Link to="/print">{t('Открыть отчёт для печати')}</Link>
    </nav>
  </Page>
}
