import { Router } from 'express'
import type { RequestHandler } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { DYNAMIC_METHOD, PROGRESS_PROMPT_VERSION, PROMPT_VERSION, progressAnchors } from '../src/dynamic/domain.ts'
import type { DynamicAttempt, DynamicEvaluation } from '../src/dynamic/domain.ts'
import { aiFailure, analyzeProgress, configuredModel, configuredReasoningEffort, evaluate, generateOpen, selectChoiceIds } from './dynamic-ai.ts'
import { availableQuestions } from './question-bank.ts'
import type { AvatarParams } from '../src/domain/avatar.ts'
import { routeComments } from './route-comments.ts'
import { attemptTexts, isContentLang } from '../src/dynamic/content-i18n.ts'
import { createContentTranslator, deleteOwnerTranslations } from './content-translations.ts'

import { msg } from '../src/i18n/translate.ts'
type Row = { state: string }
const fail = (status: number, error: string) => ({ status, error })
const validId = (id: string) => /^[\w-]{8,128}$/.test(id)
const page = (value: unknown, fallback: number, maximum: number) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? Math.min(number, maximum) : fallback
}

export function invalidatePendingAssessments(db: DatabaseSync, userId: string) {
  db.prepare('INSERT INTO assessment_revisions VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1').run(userId)
  db.prepare('DELETE FROM dynamic_starts WHERE user_id = ?').run(userId)
}

export function dynamicRoutes(db: DatabaseSync, requireEmployee: RequestHandler, rateLimit: RequestHandler,
  translator: ReturnType<typeof createContentTranslator> = createContentTranslator(db)) {
  const router = Router()
  router.use(requireEmployee)
  const revision = (userId: string) => (db.prepare('SELECT revision FROM assessment_revisions WHERE user_id = ?').get(userId) as { revision: number } | undefined)?.revision ?? 0
  type Outcome = { status: number; body: unknown }
  type Job = { id: string; key: string; userId: string; outcome?: Outcome }
  const jobsByKey = new Map<string, Job>()
  const jobsById = new Map<string, Job>()
  const launch = (key: string, userId: string, work: () => Promise<Outcome>): string => {
    const previous = jobsByKey.get(key)
    if (previous && !previous.outcome) return previous.id
    if (previous) jobsById.delete(previous.id)
    const job: Job = { id: randomUUID(), key, userId }
    jobsByKey.set(key, job)
    jobsById.set(job.id, job)
    void Promise.resolve().then(work).then(
      (outcome) => { job.outcome = outcome },
      (error) => { job.outcome = aiFailure(error, 'background') },
    ).finally(() => {
      const timer = setTimeout(() => {
        jobsById.delete(job.id)
        if (jobsByKey.get(key) === job) jobsByKey.delete(key)
      }, 15 * 60_000)
      timer.unref()
    })
    return job.id
  }
  const active = (userId: string) => {
    const row = db.prepare("SELECT state FROM dynamic_attempts WHERE user_id = ? AND json_extract(state, '$.status') != 'completed' ORDER BY saved_at DESC LIMIT 1").get(userId) as Row | undefined
    return row ? JSON.parse(row.state) as DynamicAttempt : null
  }
  const previousQuestions = (userId: string) => (db.prepare('SELECT state FROM dynamic_attempts WHERE user_id = ?').all(userId) as Row[])
    .flatMap((row) => { const a = JSON.parse(row.state) as DynamicAttempt; return [...a.choices, ...a.openQuestions].map((q) => q.text) })
  const own = (userId: string, id: string): DynamicAttempt | null => {
    const row = db.prepare('SELECT state FROM dynamic_attempts WHERE user_id = ? AND id = ?').get(userId, id) as Row | undefined
    return row ? JSON.parse(row.state) as DynamicAttempt : null
  }
  const save = (userId: string, attempt: DynamicAttempt) => {
    db.prepare('UPDATE dynamic_attempts SET state = ?, saved_at = ? WHERE user_id = ? AND id = ?')
      .run(JSON.stringify(attempt), Date.now(), userId, attempt.id)
  }
  const recent = (userId: string) => {
    const rows = db.prepare("SELECT state FROM dynamic_attempts WHERE user_id = ? AND json_extract(state, '$.status') = 'completed' ORDER BY saved_at DESC LIMIT 5").all(userId) as Row[]
    return rows.map((row) => {
      const attempt = JSON.parse(row.state) as DynamicAttempt
      const actions = db.prepare('SELECT week FROM dynamic_actions WHERE user_id = ? AND attempt_id = ?').all(userId, attempt.id) as { week: number }[]
      return { date: attempt.completedAt, role: attempt.jobRole,
        method: attempt.method, rubric: attempt.evaluation?.rubricVersion, scores: attempt.evaluation?.traits,
        questions: attempt.choices.map((q) => ({ text: q.text, answer: q.options.find((o) => o.id === attempt.choiceAnswers[q.id])?.text })),
        open: attempt.openQuestions.map((q) => ({ question: q.text, answer: (attempt.openAnswers[q.id] ?? '').slice(0, 700) })),
        completedActions: actions.map(({ week }) => attempt.evaluation?.roadmap?.find((item) => item.week === week) ?? { week, practices: attempt.evaluation?.traits }) }
    })
  }
  router.get('/current', (_req, res) => {
    const userId = res.locals.user.id as string
    res.json({ attempt: active(userId), pendingJobId: jobsByKey.get(`start:${userId}:${revision(userId)}`)?.id ?? null })
  })
  router.get('/jobs/:id', (req, res) => {
    const job = jobsById.get(String(req.params.id))
    if (!job || job.userId !== res.locals.user.id) return res.status(404).json(fail(404, msg('Задача не найдена. Повторите действие.')))
    if (!job.outcome) return res.status(202).json({ pending: true })
    return res.status(job.outcome.status).json(job.outcome.body)
  })
  router.post('/start', rateLimit, async (req, res) => {
    const userId = res.locals.user.id as string
    const id = typeof req.body?.id === 'string' ? req.body.id : ''
    const jobRole = typeof req.body?.jobRole === 'string' ? req.body.jobRole.trim() : ''
    if (!validId(id) || jobRole.length < 2 || jobRole.length > 80) return res.status(400).json(fail(400, msg('Укажите рабочую роль (2–80 символов).')))
    const avatarRow = db.prepare('SELECT params FROM avatars WHERE user_id = ?').get(userId) as { params: string } | undefined
    if (!avatarRow) return res.status(409).json(fail(409, msg('Сначала создайте аватара по семи вопросам.')))
    const avatar = JSON.parse(avatarRow.params) as AvatarParams
    const existing = own(userId, id)
    if (existing) return res.json({ attempt: existing })
    const current = active(userId)
    if (current) return res.json({ attempt: current })
    const expectedRevision = revision(userId)
    const jobId = launch(`start:${userId}:${expectedRevision}`, userId, async (): Promise<Outcome> => {
    try {
      const model = configuredModel()
      const reasoningEffort = configuredReasoningEffort()
      type Draft = { id: string; model: string; reasoningEffort: typeof reasoningEffort; jobRole: string; promptVersion: string; ids: string[] }
      const row = db.prepare('SELECT state FROM dynamic_starts WHERE user_id = ?').get(userId) as Row | undefined
      let draft = row ? JSON.parse(row.state) as Draft : null
      if (draft && (draft.jobRole !== jobRole || draft.model !== model || draft.reasoningEffort !== reasoningEffort || draft.promptVersion !== PROMPT_VERSION)) draft = null
      const bank = availableQuestions(db)
      // A saved selection without an attempt snapshot must not resurrect removed questions.
      if (draft && (draft.ids.length !== 10 || new Set(draft.ids).size !== 10
        || draft.ids.some((questionId) => !bank.some((item) => item.id === questionId)))) draft = null
      if (!draft) {
        const usedIds = (db.prepare('SELECT state FROM dynamic_attempts WHERE user_id = ?').all(userId) as Row[])
          .flatMap((item) => (JSON.parse(item.state) as DynamicAttempt).choices.map((question) => question.id))
        const ids = await selectChoiceIds(bank, jobRole, avatar, usedIds, model, reasoningEffort)
        if (revision(userId) !== expectedRevision) return { status: 409, body: fail(409, msg('Создание отменено после удаления истории. Начните заново.')) }
        draft = { id, model, reasoningEffort, jobRole, promptVersion: PROMPT_VERSION, ids }
        db.prepare('INSERT INTO dynamic_starts VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET state = excluded.state').run(userId, JSON.stringify(draft))
      }
      const choices = draft.ids.map((questionId) => bank.find((item) => item.id === questionId)?.question)
      if (choices.length !== 10 || choices.some((question) => !question))
        return { status: 409, body: fail(409, msg('Банк вопросов изменился. Начните новую попытку.')) }
      const attempt: DynamicAttempt = { id: draft.id, method: DYNAMIC_METHOD, promptVersion: PROMPT_VERSION,
        bankVersion: [...new Set(draft.ids.map((questionId) => bank.find((item) => item.id === questionId)!.version))].sort().join('+'),
        model, reasoningEffort, jobRole, createdAt: new Date().toISOString(), completedAt: null,
        status: 'choices', choices: choices as DynamicAttempt['choices'], choiceAnswers: {}, openQuestions: [], openAnswers: {}, evaluation: null }
      db.exec('BEGIN IMMEDIATE')
      try {
        if (revision(userId) !== expectedRevision) {
          db.exec('ROLLBACK')
          return { status: 409, body: fail(409, msg('Создание отменено после удаления истории. Начните заново.')) }
        }
        const found = own(userId, id) ?? active(userId)
        if (found) { db.exec('COMMIT'); return { status: 200, body: { attempt: found } } }
        db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(userId, draft.id, JSON.stringify(attempt), Date.now())
        db.prepare('DELETE FROM dynamic_starts WHERE user_id = ?').run(userId)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      return { status: 201, body: { attempt } }
    } catch (error) { return aiFailure(error, 'start') }
    })
    return res.status(202).json({ jobId })
  })
  router.get('/attempts', (req, res) => {
    const userId = res.locals.user.id as string
    const limit = Math.max(1, page(req.query.limit, 10, 50))
    const offset = page(req.query.offset, 0, 1_000_000)
    const filter = req.query.status === 'completed' ? " AND json_extract(state, '$.status') = 'completed'" : ''
    const total = (db.prepare(`SELECT COUNT(*) AS count FROM dynamic_attempts WHERE user_id = ?${filter}`).get(userId) as { count: number }).count
    const rows = db.prepare(`SELECT state FROM dynamic_attempts WHERE user_id = ?${filter} ORDER BY saved_at DESC, rowid DESC LIMIT ? OFFSET ?`)
      .all(userId, limit, offset) as Row[]
    res.json({ attempts: rows.map((row) => JSON.parse(row.state)), total })
  })
  router.get('/attempts/:id', (req, res) => {
    const attempt = own(res.locals.user.id, String(req.params.id))
    if (!attempt) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    return res.json({ attempt })
  })
  const completedHistory = (userId: string) => (db.prepare("SELECT state FROM dynamic_attempts WHERE user_id = ? AND json_extract(state, '$.status') = 'completed' ORDER BY json_extract(state, '$.createdAt') ASC, rowid ASC")
    .all(userId) as Row[]).map((row) => JSON.parse(row.state) as DynamicAttempt)
  /** Анализ «до и после» к первой и серединной попытке. Без повторного прохождения анализ не нужен. */
  const progressFor = async (userId: string, attempt: DynamicAttempt, evaluation: DynamicEvaluation) => {
    const { first, middle } = progressAnchors({ ...attempt, status: 'completed', evaluation }, completedHistory(userId))
    return first ? analyzeProgress(attempt, evaluation, first, middle) : undefined
  }
  router.get('/attempts/:id/comparison', (req, res) => {
    const userId = res.locals.user.id as string
    const attempt = own(userId, String(req.params.id))
    if (!attempt) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    const completed = completedHistory(userId)
    const index = completed.findIndex((item) => item.id === attempt.id)
    // Первое прохождение закреплено как точка отсчёта, серединное — для попыток с третьей.
    const anchors = attempt.evaluation ? progressAnchors(attempt, completed) : { first: null, middle: null, count: 0 }
    return res.json({ baseline: anchors.first ?? completed[0] ?? null, middle: anchors.middle, previous: index > 0 ? completed[index - 1] : null,
      count: completed.length, progressCount: anchors.count })
  })
  router.put('/attempts/:id/answer', (req, res) => {
    const userId = res.locals.user.id as string
    const attempt = own(userId, String(req.params.id))
    if (!attempt) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    if (typeof req.body?.questionId === 'string' && typeof req.body?.answer === 'string'
      && attempt.openAnswers[req.body.questionId] === req.body.answer.trim()) return res.json({ attempt })
    if (typeof req.body?.questionId === 'string' && typeof req.body?.optionId === 'string'
      && attempt.choiceAnswers[req.body.questionId] === req.body.optionId) return res.json({ attempt })
    if (attempt.status === 'choices') {
      const question = attempt.choices.find((q) => q.id === req.body?.questionId)
      const option = question?.options.find((o) => o.id === req.body?.optionId)
      if (!question || !option) return res.status(400).json(fail(400, msg('Выберите один из вариантов текущего вопроса.')))
      const next = { ...attempt, choiceAnswers: { ...attempt.choiceAnswers, [question.id]: option.id } }
      save(userId, next)
      return res.json({ attempt: next })
    }
    if (attempt.status === 'open') {
      const question = attempt.openQuestions.at(-1)
      const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : ''
      if (!question || question.id !== req.body?.questionId || answer.length < 20 || answer.length > 3000)
        return res.status(400).json(fail(400, msg('Ответ должен содержать от 20 до 3000 символов.')))
      const old = attempt.openAnswers[question.id]
      if (old && old !== answer) return res.status(409).json(fail(409, msg('Этот ответ уже сохранён.')))
      const answers = { ...attempt.openAnswers, [question.id]: answer }
      const next: DynamicAttempt = { ...attempt, openAnswers: answers,
        status: Object.keys(answers).length === 5 ? 'ready' : 'open' }
      save(userId, next)
      return res.json({ attempt: next })
    }
    return res.status(409).json(fail(409, msg('Эта попытка уже завершена.')))
  })
  router.post('/attempts/:id/next', rateLimit, async (req, res) => {
    const userId = res.locals.user.id as string
    const attempt = own(userId, String(req.params.id))
    if (!attempt) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    if (attempt.status === 'choices' && Object.keys(attempt.choiceAnswers).length !== 10)
      return res.status(409).json(fail(409, msg('Ответьте на десять вопросов с вариантами.')))
    if (attempt.status === 'ready' || attempt.status === 'completed') return res.json({ attempt })
    if (attempt.openQuestions.length > Object.keys(attempt.openAnswers).length) return res.json({ attempt })
    if (attempt.openQuestions.length >= 5) return res.status(409).json(fail(409, msg('Все открытые ответы уже получены.')))
    const expectedRevision = revision(userId)
    const jobId = launch(`next:${userId}:${attempt.id}:${attempt.openQuestions.length}:${expectedRevision}`, userId, async (): Promise<Outcome> => {
    try {
      const question = await generateOpen(attempt, recent(userId), previousQuestions(userId))
      if (revision(userId) !== expectedRevision) return { status: 409, body: fail(409, msg('История удалена. Обновите страницу.')) }
      const latest = own(userId, attempt.id)
      if (!latest) return { status: 404, body: fail(404, msg('Попытка не найдена.')) }
      if (latest.openQuestions.length > attempt.openQuestions.length) return { status: 200, body: { attempt: latest } }
      if (JSON.stringify(latest.choiceAnswers) !== JSON.stringify(attempt.choiceAnswers))
        return { status: 409, body: fail(409, msg('Ответы изменились в другой вкладке. Повторите создание вопроса.')) }
      const next: DynamicAttempt = { ...latest, status: 'open', openQuestions: [...latest.openQuestions, question] }
      save(userId, next)
      return { status: 200, body: { attempt: next } }
    } catch (error) { return aiFailure(error, 'next') }
    })
    return res.status(202).json({ jobId })
  })
  router.post('/attempts/:id/evaluate', rateLimit, async (req, res) => {
    const userId = res.locals.user.id as string
    const attempt = own(userId, String(req.params.id))
    if (!attempt) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    if (attempt.status === 'completed') return res.json({ attempt })
    if (attempt.status !== 'ready' || attempt.openQuestions.length !== 5 || Object.keys(attempt.openAnswers).length !== 5)
      return res.status(409).json(fail(409, msg('Сначала ответьте на все 15 вопросов.')))
    const expectedRevision = revision(userId)
    const jobId = launch(`evaluate:${userId}:${attempt.id}:${expectedRevision}`, userId, async (): Promise<Outcome> => {
    try {
      // В оценку идут только выполненные практики прошлых маршрутов (для roadmap): старые ответы и баллы не должны влиять на текущую оценку.
      const history = recent(userId).map(({ date, completedActions }) => ({ date, completedActions }))
      const scored: DynamicEvaluation = await evaluate(attempt, history)
      // Анализ «до и после» дополняет оценку; его сбой не отменяет результат — анализ можно запросить повторно во вкладке «Прогресс».
      const progress = await progressFor(userId, attempt, scored).catch((error: unknown) => { aiFailure(error, 'progress'); return undefined })
      const evaluation: DynamicEvaluation = progress ? { ...scored, progress } : scored
      if (revision(userId) !== expectedRevision) return { status: 409, body: fail(409, msg('История удалена. Обновите страницу.')) }
      const latest = own(userId, attempt.id)
      if (!latest) return { status: 404, body: fail(404, msg('Попытка не найдена.')) }
      if (latest.status === 'completed') return { status: 200, body: { attempt: latest } }
      const next: DynamicAttempt = { ...latest, status: 'completed', completedAt: new Date().toISOString(), evaluation }
      save(userId, next)
      return { status: 200, body: { attempt: next } }
    } catch (error) { return aiFailure(error, 'evaluate') }
    })
    return res.status(202).json({ jobId })
  })
  /** Повторный анализ прогресса: если при оценке он не удался или попытка оценена до появления вкладки «Прогресс». */
  router.post('/attempts/:id/progress', rateLimit, async (req, res) => {
    const userId = res.locals.user.id as string
    const attempt = own(userId, String(req.params.id))
    if (!attempt) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    if (attempt.status !== 'completed' || !attempt.evaluation) return res.status(409).json(fail(409, msg('Анализ прогресса доступен после завершения оценки.')))
    const { first, middle } = progressAnchors(attempt, completedHistory(userId))
    if (!first) return res.status(409).json(fail(409, msg('Для анализа прогресса нужно повторное прохождение теста.')))
    const saved = attempt.evaluation.progress
    if (saved && saved.firstId === first.id && saved.middleId === (middle?.id ?? null) && saved.promptVersion === PROGRESS_PROMPT_VERSION) return res.json({ attempt })
    const expectedRevision = revision(userId)
    const jobId = launch(`progress:${userId}:${attempt.id}:${expectedRevision}`, userId, async (): Promise<Outcome> => {
    try {
      const progress = await analyzeProgress(attempt, attempt.evaluation!, first, middle)
      if (revision(userId) !== expectedRevision) return { status: 409, body: fail(409, msg('История удалена. Обновите страницу.')) }
      const latest = own(userId, attempt.id)
      if (!latest?.evaluation) return { status: 404, body: fail(404, msg('Попытка не найдена.')) }
      const next: DynamicAttempt = { ...latest, evaluation: { ...latest.evaluation, progress } }
      // saved_at не меняется: дополненная старая попытка не должна стать «последней» в истории.
      db.prepare('UPDATE dynamic_attempts SET state = ? WHERE user_id = ? AND id = ?').run(JSON.stringify(next), userId, attempt.id)
      return { status: 200, body: { attempt: next } }
    } catch (error) { return aiFailure(error, 'progress') }
    })
    return res.status(202).json({ jobId })
  })
  /**
   * Перевод попытки на казахский или английский. Первый запрос после выбора языка запускает фоновый перевод недостающих
   * строк, следующие — показывают прогресс. Готовые переводы хранятся в базе и при следующем переключении отдаются сразу.
   */
  router.post('/attempts/:id/translation', (req, res) => {
    const userId = res.locals.user.id as string
    const attempt = own(userId, String(req.params.id))
    if (!attempt) return res.status(404).json(fail(404, 'Попытка не найдена.'))
    if (!isContentLang(req.body?.lang)) return res.status(400).json(fail(400, 'Неизвестный язык перевода.'))
    return res.json(translator.status(userId, `attempt:${attempt.id}`, req.body.lang, attemptTexts(attempt), { retry: req.body?.retry === true }))
  })
  router.get('/attempts/:id/actions', (req, res) => {
    const userId = res.locals.user.id as string
    if (!own(userId, String(req.params.id))) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    const rows = db.prepare('SELECT week FROM dynamic_actions WHERE user_id = ? AND attempt_id = ?')
      .all(userId, String(req.params.id)) as { week: number }[]
    return res.json({ completedWeeks: rows.map((row) => row.week) })
  })
  // Комментарии руководителя к маршруту: сотрудник читает их под соответствующей неделей.
  router.get('/attempts/:id/comments', (req, res) => {
    const userId = res.locals.user.id as string
    if (!own(userId, String(req.params.id))) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    return res.json({ comments: routeComments(db, userId, String(req.params.id)) })
  })
  router.put('/attempts/:id/actions/:week', (req, res) => {
    const userId = res.locals.user.id as string
    const id = String(req.params.id)
    const week = Number(req.params.week)
    const attempt = own(userId, id)
    if (!attempt) return res.status(404).json(fail(404, msg('Попытка не найдена.')))
    if (attempt.status !== 'completed') return res.status(409).json(fail(409, msg('Практики доступны после завершения оценки.')))
    if (![1, 2, 3, 4].includes(week) || typeof req.body?.completed !== 'boolean')
      return res.status(400).json(fail(400, msg('Некорректная отметка.')))
    if (req.body.completed) db.prepare('INSERT OR IGNORE INTO dynamic_actions VALUES (?, ?, ?, ?)').run(userId, id, week, Date.now())
    else db.prepare('DELETE FROM dynamic_actions WHERE user_id = ? AND attempt_id = ? AND week = ?').run(userId, id, week)
    return res.json({ ok: true })
  })
  router.delete('/attempts', (_req, res) => {
    const userId = res.locals.user.id as string
    db.exec('BEGIN IMMEDIATE')
    try {
      invalidatePendingAssessments(db, userId)
      db.prepare('DELETE FROM dynamic_actions WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM route_comments WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM dynamic_attempts WHERE user_id = ?').run(userId)
      deleteOwnerTranslations(db, userId)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    res.json({ ok: true })
  })
  return router
}
