import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { AssessmentResult, Question } from '../../domain/types'
import type { AssessmentSession } from './session'
import { useI18n } from '../../i18n/context'
import { Button } from '../../ui/primitives'
import { BuildingProgress } from '../../ui/BuildingProgress'
import styles from './AssessmentFlow.module.css'

export interface QuestionViewProps {
  readonly question: Question
  readonly selectedOptionId: string | null
  readonly onSelect: (optionId: string) => void
}

function NativeQuestion({ question, selectedOptionId, onSelect }: QuestionViewProps) {
  return <><p>{question.context}</p><fieldset className={styles.answers}>
    <legend>{question.text}</legend>
    {question.options.map((option) => <label key={option.id}>
      <input type="radio" name={question.id} value={option.id} checked={selectedOptionId === option.id}
        onChange={() => onSelect(option.id)} />
      <span>{option.text}</span>
    </label>)}
  </fieldset></>
}

/** Компонент вопроса B передаётся через renderQuestion; до интеграции доступен native fallback A. */
export function AssessmentFlow({ session, onComplete, renderQuestion = (props) => <NativeQuestion {...props} /> }: {
  readonly session: AssessmentSession
  readonly onComplete: (result: AssessmentResult) => void
  readonly renderQuestion?: (props: QuestionViewProps) => ReactNode
}) {
  const { t } = useI18n()
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const heading = useRef<HTMLHeadingElement>(null)
  const { questions } = session.module
  const question = questions.find((item) => item.id === state.draft.currentQuestionId)
  const index = questions.findIndex((item) => item.id === state.draft.currentQuestionId)
  useEffect(() => { heading.current?.focus() }, [state.phase, state.draft.currentQuestionId, state.recovery])

  const savedNotice = state.storageUnavailable
    ? t('Сохранение в браузере недоступно. Ответы остаются в памяти до закрытия или перезагрузки страницы.')
    : state.lastSavedAt ? t('Черновик сохранён в этом браузере.') : t('Ответы будут сохраняться в этом браузере.')

  if (state.recovery) return <>
    <h1 ref={heading} tabIndex={-1}>{t('Нужно обновить черновик')}</h1>
    <p role="status">{state.recovery === 'incompatible'
      ? t('Сохранённый черновик относится к другой версии теста. Продолжить его по новым правилам нельзя.')
      : t('Не удалось прочитать сохранённый черновик. Он пока не изменён.')}</p>
    <Button type="button" onClick={() => {
      if (window.confirm(t('Удалить старый черновик и начать тест заново?'))) session.startOver()
    }}>{t('Начать заново')}</Button>
  </>
  if (state.phase === 'completed') return <>
    <h1 ref={heading} tabIndex={-1}>{t('Тест завершён')}</h1>
    {state.historyNotice && <p role="status">{state.historyNotice}</p>}
    <Button type="button" onClick={() => { if (state.result) onComplete(state.result) }}>{t('Открыть профиль')}</Button>
  </>
  if (!question) return <p role="alert">{t('Вопрос недоступен. Вернитесь к началу теста.')}</p>

  const answeredIndexes = new Set(questions.flatMap((item, itemIndex) => state.draft.answers[item.id] ? [itemIndex] : []))
  return <div className={styles.layout}>
  <BuildingProgress total={questions.length} answered={answeredIndexes} current={state.phase === 'review' ? null : index} />
  <section className={styles.flow}>
    <header className={styles.head}>
    <h1 ref={heading} tabIndex={-1}>{state.phase === 'review' ? t('Проверьте ответы') : t('Ситуация {n} из {total}', { n: index + 1, total: questions.length })}</h1>
    <div className={styles.meta}>
      <p>{t('Ответов: {count} из {total}', { count: Object.keys(state.draft.answers).length, total: questions.length })}</p>
      <progress max={questions.length} value={Object.keys(state.draft.answers).length} aria-label={t('Ответы на вопросы')} />
      <p role="status" className={styles.saved}>{savedNotice} {state.historyNotice}</p>
    </div>
    </header>
    {state.phase === 'review' ? <>
      <p>{t('Можно исправить любой ответ перед расчётом профиля.')}</p>
      <ol className={styles.review}>{questions.map((item, itemIndex) => <li key={item.id}>
        <p className={styles.reviewContext}>{item.context}</p>
        <p className={styles.reviewAnswer}>{item.options.find((option) => option.id === state.draft.answers[item.id])?.text}</p>
        <Button type="button" tone="secondary" onClick={() => session.editQuestion(item.id)}>{t('Изменить ответ {n}', { n: itemIndex + 1 })}</Button>
      </li>)}</ol>
      <Button type="button" onClick={() => { const result = session.finish(); if (result) onComplete(result) }}>{t('Получить профиль')}</Button>
    </> : <>
      <div key={question.id} className={styles.questionSwap}>
        {renderQuestion({ question, selectedOptionId: state.draft.answers[question.id] ?? null, onSelect: session.selectOption })}
      </div>
      <div className={styles.navigation}>
        <Button type="button" tone="secondary" disabled={index === 0} onClick={session.back}>{t('Назад')}</Button>
        <Button type="button" disabled={!state.draft.answers[question.id]} onClick={session.next}>
          {index === questions.length - 1 ? t('Проверить ответы') : t('Далее')}
        </Button>
      </div>
    </>}
    {state.error && <p role="alert">{t(state.error)}</p>}
  </section>
  </div>
}
