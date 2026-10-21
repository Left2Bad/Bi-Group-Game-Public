import { useState } from 'react'
import { demoAnswers, DEMO_COMPLETED_AT } from '../content/demo'
import type { DemoScenario } from '../content/demo'
import { questions, scoring } from '../content/questions'
import { calculateProfile } from '../domain/score'
import { buildRecommendations } from '../domain/recommend'
import { DATA_VERSIONS, TRAIT_IDS } from '../domain/types'
import { useI18n } from '../i18n/context'
import { ActionLink, Button, Card, Eyebrow, Page, ProgressBar, StatusMessage } from '../ui/primitives'
import { useTraitLabels } from '../ui/use-labels'
import styles from './DemoPage.module.css'

/** Изолированный пример: без контроллера попытки, localStorage и записи в историю. */
export function DemoPage() {
  const { t } = useI18n()
  const { traitNames, levelNames } = useTraitLabels()
  const [scenario, setScenario] = useState<DemoScenario>('A')
  const [marks, setMarks] = useState<Readonly<Record<DemoScenario, readonly string[]>>>({ A: [], B: [] })
  const calculated = calculateProfile(demoAnswers[scenario], {
    questions, scoring, versions: DATA_VERSIONS, attemptId: `demo-${scenario}`, completedAt: DEMO_COMPLETED_AT,
  })
  if (!calculated.ok) return <Page><Card><h1>{t('Пример временно недоступен')}</h1>
    <p>{calculated.error.message}</p><ActionLink to="/intro">{t('Вернуться к своему тесту')}</ActionLink>
  </Card></Page>

  const { result } = calculated
  const plan = buildRecommendations(result)
  const question = questions.find((item) => item.id === 'Q13')!
  const evidence = result.traits.engagement.evidence.find((item) => item.questionId === 'Q13')!
  const selected = question.options.find((item) => item.id === result.answers.Q13)!
  const recommendations = plan.recommendations.filter((item) => plan.priorityTraits.includes(item.trait)).slice(0, 2)

  return <Page className={styles.page}>
    <Card>
      <Eyebrow>{t('Пример с вымышленными ответами')}</Eyebrow><h1>{t('Как один ответ меняет профиль')}</h1>
      <p>{t('Варианты A и B отличаются только ответом в ситуации Q13, остальные 14 ответов одинаковы. Посмотрите, как меняются профиль и маршрут развития.')}</p>
      <p>{t('Ваш тест, история и отметки сохраняются отдельно. Пример не записывается в историю, а его отметки исчезнут после перезагрузки.')}</p>
      <div className={styles.switcher} role="group" aria-label={t('Вариант ответа')}>
        {(['A', 'B'] as const).map((id) => <Button key={id} type="button" aria-pressed={scenario === id}
          tone={scenario === id ? 'primary' : 'secondary'} onClick={() => setScenario(id)}>{t('Вариант {id}', { id })}</Button>)}
      </div>
      <p role="status">{t('Показан вариант {id}. Приоритеты: {list}.', { id: scenario, list: plan.priorityTraits.map((id) => traitNames[id]).join(', ') })}</p>
    </Card>
    <Card aria-label={t('Ситуация, которая отличается')}>
      <h2>{t('Один ответ — другой фокус')}</h2><p>{question.context}</p><p>{question.text}</p>
      <p><strong>{t('Ответ в варианте {id}:', { id: scenario })}</strong> {selected.text}</p>
      <p><strong>{t('Баллы Q13 за вовлечённость:')}</strong> {t('{points} из 3', { points: evidence.points })}</p><p><strong>{t('Обоснование:')}</strong> {evidence.reason}</p>
      <p>{t('Остальные 14 ответов одинаковы: меняется только этот выбор.')}</p>
    </Card>
    <section aria-labelledby="demo-profile-title">
      <h2 id="demo-profile-title">{t('Профиль: вариант {id}', { id: scenario })}</h2>
      <div className={styles.grid}>{TRAIT_IDS.map((id) => {
        const score = result.traits[id]
        return <Card key={id}><ProgressBar label={traitNames[id]} value={score.percent} />
          <p>{t('{points} из {max} баллов', { points: score.points, max: score.maxPoints })} · {levelNames[score.level]}</p>
        </Card>
      })}</div>
      <p>{t('Процент = баллы / максимум × 100, округление до целого. Четыре шкалы независимы. Уровень и приоритет определяются до округления.')}</p>
    </section>
    <section aria-labelledby="demo-plan-title">
      <h2 id="demo-plan-title">{t('Маршрут: вариант {id}', { id: scenario })}</h2>
      <p>{t('Выполнено действий: {count} из {total}. Отметки не меняют баллы.', { count: recommendations.filter((item) => marks[scenario].includes(item.id)).length, total: recommendations.length })}</p>
      <div className={styles.grid}>{recommendations.map((item) => <Card key={item.id} aria-label={t('Практика в примере: {name}', { name: traitNames[item.trait] })}>
        <h3>{traitNames[item.trait]}</h3><p><strong>{item.action}</strong></p><p>{item.reason}</p>
        <p><strong>{t('Практика:')}</strong> {item.practice}</p><p><strong>{t('Срок:')}</strong> {t('{days} дней', { days: item.durationDays })}</p>
        <p><strong>{t('Критерий выполнения:')}</strong> {item.successCriterion}</p><p>{t('Связанные ситуации: {list}', { list: item.questionIds.join(', ') })}</p>
        <label className={styles.check}><input type="checkbox" checked={marks[scenario].includes(item.id)}
          aria-label={t('Отметить в примере: {name}', { name: traitNames[item.trait] })} onChange={(event) => {
            const checked = event.target.checked
            setMarks((previous) => ({ ...previous, [scenario]: checked
              ? [...previous[scenario], item.id] : previous[scenario].filter((id) => id !== item.id) }))
          }} />{t('Отметить выполнение')}</label>
      </Card>)}</div>
    </section>
    <StatusMessage>{t('Пример использует вымышленные ответы и не влияет на ваш профиль.')}</StatusMessage>
    <p><ActionLink to="/intro">{t('Вернуться к своему тесту')}</ActionLink></p>
  </Page>
}
