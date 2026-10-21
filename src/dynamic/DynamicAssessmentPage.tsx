import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, post } from '../auth/api'
import { useAuth } from '../auth/context'
import { useTraitLabels } from '../ui/use-labels'
import { Button, Card, Page } from '../ui/primitives'
import type { DynamicAttempt } from './domain'
import { useLocalizedAttempt } from './use-localized-attempt'
import { BuildingProgress } from '../ui/BuildingProgress'
import { QuestionCard } from '../ui/QuestionCard'
import { ReportQuestion } from './ReportQuestion'
import { Eyebrow } from '../ui/primitives'
import flow from '../features/assessment/AssessmentFlow.module.css'
import questionStyles from '../ui/QuestionCard.module.css'
import styles from './DynamicAssessmentPage.module.css'
import { useI18n } from '../i18n/context'

import { msg } from '../i18n/translate'
const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) })
type JobReply = { jobId?: string; pending?: boolean; attempt?: DynamicAttempt }

async function waitForJob(jobId: string): Promise<DynamicAttempt> {
  const deadline = Date.now() + 390_000
  while (Date.now() < deadline) {
    const result = await api<JobReply>(`/dynamic/jobs/${encodeURIComponent(jobId)}`)
    if (result.attempt) return result.attempt
    if (!result.pending) throw new Error(msg('Сервер не смог определить состояние генерации. Повторите действие.'))
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error(msg('Генерация занимает слишком много времени. Обновите страницу, чтобы проверить её состояние.'))
}

async function submitJob(path: string, body: unknown): Promise<DynamicAttempt> {
  const result = await api<JobReply>(path, post(body))
  if (result.attempt) return result.attempt
  if (!result.jobId) throw new Error(msg('Сервер не вернул номер задачи. Повторите действие.'))
  return waitForJob(result.jobId)
}

export function DynamicAssessmentPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { traitNames } = useTraitLabels()
  const [attempt, setAttempt] = useState<DynamicAttempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  /** Ждём модель (подбор вопросов, новый открытый вопрос, оценку): на стройку едет грузовик. */
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobRole, setJobRole] = useState('')
  const [index, setIndex] = useState(0)
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string>>({})
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  /** Вопросы, которые сотрудник уже отметил как некорректные: кнопка у них сменяется на «принято к сведению». */
  const [reported, setReported] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    let live = true
    api<{ questionIds: string[] }>('/question-reports').then(({ questionIds }) => { if (live) setReported(new Set(questionIds)) })
      .catch(() => { /* Без списка кнопка просто доступна; повторная отметка на сервере не создаёт второе сообщение. */ })
    return () => { live = false }
  }, [])
  const report = (questionId: string) => attempt && <ReportQuestion key={questionId} attemptId={attempt.id} questionId={questionId}
    reported={reported.has(questionId)} onReported={(ids) => setReported(new Set(ids))} />

  useEffect(() => {
    let live = true
    api<{ attempt: DynamicAttempt | null; pendingJobId?: string | null }>('/dynamic/current').then(async ({ attempt: current, pendingJobId }) => {
      if (!live) return
      setAttempt(current)
      if (current) setIndex(Math.min(9, Object.keys(current.choiceAnswers).length))
      if (!current && pendingJobId) {
        setBusy(true); setGenerating(true)
        try { const created = await waitForJob(pendingJobId); if (live) { setAttempt(created); setIndex(0) } }
        catch (reason) { if (live) setError((reason as Error).message) }
        finally { if (live) { setBusy(false); setGenerating(false) } }
      }
    }).catch((reason: Error) => { if (live) setError(reason.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  // Тексты вопросов — на выбранном языке; ответы и логика работают с исходной попыткой (id совпадают).
  const shown = useLocalizedAttempt(attempt, attempt ? `/dynamic/attempts/${encodeURIComponent(attempt.id)}/translation` : null)
  const currentChoice = shown?.status === 'choices' ? shown.choices[index] : undefined
  const currentOpen = shown?.status === 'open' ? shown.openQuestions.at(-1) : undefined
  const textKey = currentOpen && user ? `bi-academy:dynamic-text:${user.id}:${attempt?.id}:${currentOpen.id}` : ''
  const selected = currentChoice ? selectedByQuestion[currentChoice.id] ?? attempt?.choiceAnswers[currentChoice.id] ?? '' : ''
  const storedAnswer = () => { try { return localStorage.getItem(textKey) ?? '' } catch { return '' } }
  const answer = currentOpen ? draftAnswers[currentOpen.id] ?? storedAnswer() : ''

  async function run(action: () => Promise<DynamicAttempt>, generation = false) {
    setBusy(true); setGenerating(generation); setError(null)
    try { setAttempt(await action()) }
    catch (reason) {
      setError((reason as Error).message)
    }
    finally { setBusy(false); setGenerating(false) }
  }
  async function start() {
    await run(async () => {
      const id = crypto.randomUUID()
      const created = await submitJob('/dynamic/start', { id, jobRole })
      setIndex(0)
      return created
    }, true)
  }
  /** Сохраняет ответ и сразу запускает следующий шаг; если шаг не удался, показывает уже сохранённое. */
  async function saveThen(saved: DynamicAttempt, then: (saved: DynamicAttempt) => Promise<DynamicAttempt>) {
    try { return await then(saved) }
    catch (reason) { setAttempt(saved); throw reason }
  }
  async function saveChoice() {
    if (!attempt || !currentChoice || !selected) return
    const last = index === 9
    await run(async () => {
      const { attempt: saved } = await api<{ attempt: DynamicAttempt }>(`/dynamic/attempts/${attempt.id}/answer`,
        put({ questionId: currentChoice.id, optionId: selected }))
      if (!last) { setIndex(index + 1); return saved }
      if (Object.keys(saved.choiceAnswers).length < 10) return saved
      setGenerating(true)
      return saveThen(saved, () => submitJob(`/dynamic/attempts/${attempt.id}/next`, {}))
    })
  }
  async function nextOpen() {
    if (!attempt) return
    await run(async () => {
      const next = await submitJob(`/dynamic/attempts/${attempt.id}/next`, {})
      return next
    }, true)
  }
  async function saveOpen() {
    if (!attempt || !currentOpen) return
    await run(async () => {
      const { attempt: saved } = await api<{ attempt: DynamicAttempt }>(`/dynamic/attempts/${attempt.id}/answer`,
        put({ questionId: currentOpen.id, answer }))
      try { localStorage.removeItem(textKey) } catch { /* Сервер уже сохранил ответ. */ }
      setGenerating(true)
      return saveThen(saved, saved.status === 'ready' ? evaluateAttempt : () => submitJob(`/dynamic/attempts/${attempt.id}/next`, {}))
    })
  }
  async function evaluateAttempt(target: DynamicAttempt) {
    const completed = await submitJob(`/dynamic/attempts/${target.id}/evaluate`, {})
    navigate(`${import.meta.env.MODE === 'playwright-legacy' ? '/results/new' : '/results'}?attempt=${encodeURIComponent(completed.id)}`)
    return completed
  }
  async function evaluate() {
    if (!attempt) return
    await run(() => evaluateAttempt(attempt), true)
  }

  const answered = new Set([
    ...(attempt?.choices.flatMap((question, i) => attempt.choiceAnswers[question.id] ? [i] : []) ?? []),
    ...(attempt?.openQuestions.flatMap((question, i) => attempt.openAnswers[question.id] ? [10 + i] : []) ?? []),
  ])
  const current = currentChoice ? index : currentOpen ? 9 + (attempt?.openQuestions.length ?? 1) : null
  // Новый вопрос: если кнопка «Следующий вопрос» была внизу длинной страницы (телефон), возвращаем к началу вопроса.
  const headRef = useRef<HTMLElement>(null)
  const questionKey = currentChoice?.id ?? currentOpen?.id ?? attempt?.status ?? ''
  const shownKey = useRef(questionKey)
  useEffect(() => {
    if (shownKey.current === questionKey) return
    shownKey.current = questionKey
    const head = headRef.current
    if (!head || head.getBoundingClientRect().top >= 0) return
    head.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }, [questionKey])
  return <Page className={flow.page}><div className={flow.layout}>
    <BuildingProgress total={15} answered={answered} current={current} delivering={generating} />
    <section className={flow.flow} aria-busy={busy || loading}>
    <header ref={headRef} className={flow.head}><div><Eyebrow>{t('Оценка BI Academy')}</Eyebrow>
    <h1>{currentChoice ? t('Вопрос {v} из 15', { v: index + 1 }) : currentOpen && !attempt?.openAnswers[currentOpen.id]
      ? t('Вопрос {v} из 15', { v: 10 + attempt!.openQuestions.length }) : attempt?.status === 'ready' ? t('Все ответы сохранены') : t('Ваши рабочие подходы')}</h1></div>
    <div className={flow.meta}><p>{t('Ответов: {size} из 15', { size: answered.size })}</p><progress max={15} value={answered.size} aria-label={t('Ответы на вопросы')} />
      <p role="status" className={flow.saved}>{attempt ? t('Сохранённые ответы находятся в вашем аккаунте.') : t('10 ситуаций с вариантами и 5 открытых вопросов.')}</p></div></header>
    {loading && <p role="status">{t('Загружаем черновик…')}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {!loading && !attempt && <Card className={questionStyles.card}><form onSubmit={(event) => { event.preventDefault(); void start() }}>
      <p className={questionStyles.context}>{t('Ситуации подстраиваются под вашу работу')}</p>
      <p>{t('AI подберёт десять готовых вопросов из проверенного банка по вашей роли и аватару. Последние пять вопросов будут созданы по вашим предыдущим ответам.')}</p>
      <ol className={styles.plan} aria-label={t('Как пройдёт тест')}>{[t('10 ситуаций с вариантами'), t('5 открытых вопросов'), t('Профиль и план на 30 дней')].map((item, step) =>
        <li key={item}><b aria-hidden="true">{step + 1}</b>{item}</li>)}</ol>
      <label className={styles.field}>{t('Ваша должность или рабочая роль')}<input disabled={busy} value={jobRole} onChange={(event) => setJobRole(event.target.value)}
        minLength={2} maxLength={80} required placeholder={t('Например, инженер ПТО')} /></label>
      <p><Button type="submit" disabled={busy}>{busy ? t('Подбираем вопросы…') : t('Начать новое прохождение')}</Button></p>
    </form></Card>}
    {currentChoice && <section key={currentChoice.id}>
      <div className={flow.questionSwap}><QuestionCard
        question={{ ...currentChoice, trait: currentChoice.primaryTrait,
          options: [currentChoice.options[0]!, currentChoice.options[1]!, currentChoice.options[2]!, currentChoice.options[3]!] }}
        selectedOptionId={selected || null} onSelect={(optionId) => { if (!busy) setSelectedByQuestion((previous) => ({ ...previous, [currentChoice.id]: optionId })) }} />
        {report(currentChoice.id)}</div>
      <p className={flow.navigation}>
        <Button tone="secondary" disabled={busy || index === 0} onClick={() => setIndex(index - 1)}>{t('Назад')}</Button>
        <Button disabled={busy || !selected} onClick={() => { void saveChoice() }}>{busy && index === 9 ? t('Создаём вопрос…') : t('Следующий вопрос')}</Button>
      </p>
    </section>}
    {attempt?.status === 'open' && currentOpen && attempt.openAnswers[currentOpen.id] === undefined && <section>
      <Card className={`${questionStyles.card} ${styles.open}`}><p className={questionStyles.context}>{t('{traitNames} · ответ своими словами', { traitNames: traitNames[currentOpen.trait] })}</p>
      <h2>{currentOpen.text}</h2>
      {report(currentOpen.id)}
      <label className={styles.field}>{t('Ваш ответ')}<textarea disabled={busy} value={answer} onChange={(event) => {
        const value = event.target.value; setDraftAnswers((previous) => ({ ...previous, [currentOpen.id]: value }))
        try { localStorage.setItem(textKey, value) } catch { /* Ответ остаётся в памяти. */ }
      }} minLength={20} maxLength={3000} rows={8} aria-describedby={`${currentOpen.id}-count`} /></label>
      <div className={styles.answerMeta}>
        <ul className={styles.include} aria-label={t('Что включить в ответ')}>{[t('Действия по порядку'), t('Причины решения'), t('Проверка результата')].map((item) =>
          <li key={item}>{item}</li>)}</ul>
        <p id={`${currentOpen.id}-count`} className={styles.count} data-ready={answer.trim().length >= 20 || undefined}>
          {answer.trim().length < 20 ? t('Ещё {v} симв. до минимума', { v: 20 - answer.trim().length }) : t('{length} из 3000 символов', { length: answer.length })}</p>
      </div>
      <div className={flow.navigation}><p className={styles.saveHint}>{t('Опишите, что сделаете и почему. Ответ сохраняется после нажатия кнопки.')}</p>
      <Button disabled={busy || answer.trim().length < 20} onClick={() => { void saveOpen() }}>
        {attempt.openQuestions.length === 5 ? (busy ? t('Оцениваем…') : t('Получить результат')) : (busy ? t('Создаём вопрос…') : t('Следующий вопрос'))}</Button></div>
      </Card></section>}
    {attempt?.status === 'open' && attempt.openQuestions.length === Object.keys(attempt.openAnswers).length &&
      <p><Button disabled={busy} onClick={() => { void nextOpen() }}>{busy ? t('Создаём вопрос…') : t('Следующий вопрос')}</Button></p>}
    {attempt?.status === 'ready' && <Card className={`${questionStyles.card} ${styles.ready}`}>
      <div className={styles.readyHead}><span className={styles.readyBadge} aria-hidden="true">✓</span>
        <ul className={styles.readyList}><li><b>{Object.keys(attempt.choiceAnswers).length}</b>{' '}{t('ситуаций с вариантами')}</li>
          <li><b>{Object.keys(attempt.openAnswers).length}</b>{' '}{t('открытых ответов')}</li></ul></div>
      <p>{t('Теперь OpenAI оценит открытые ответы. Если сервис недоступен, вы сможете повторить запрос без потери ответов.')}</p>
      <Button disabled={busy} onClick={() => { void evaluate() }}>{busy ? t('Оцениваем…') : t('Получить результат')}</Button>
    </Card>}
    </section></div></Page>
}
