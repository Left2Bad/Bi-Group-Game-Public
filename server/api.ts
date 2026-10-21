import { Router, json } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import type { DatabaseSync } from 'node:sqlite'
import { questions, scoring } from '../src/content/questions.ts'
import { calculateProfile } from '../src/domain/score.ts'
import { DATA_VERSIONS } from '../src/domain/types.ts'
import { CONSENT_VERSION, validateConsent, validateInviteCode, validateLogin, validateRegistration, validateTeamName } from '../src/domain/account-validation.ts'
import { isAvatarParams } from '../src/domain/avatar.ts'
import type { FieldErrors } from '../src/domain/account-validation.ts'
import type { DynamicAttempt, DynamicEvaluation } from '../src/dynamic/domain.ts'
import type { TestAccounts } from '../src/dynamic/test-accounts.ts'
import { allowsWriteOrigin } from './request-origin.ts'
import { dynamicRoutes, invalidatePendingAssessments } from './dynamic-routes.ts'
import { meetingRoutes } from './meetings.ts'
import { deliverQuestionReports, questionReportRoutes } from './question-reports.ts'
import { seedTestAccounts } from './test-accounts.ts'
import { createContentTranslator, deleteOwnerTranslations } from './content-translations.ts'
import { attemptTexts, isContentLang } from '../src/dynamic/content-i18n.ts'
import { ROUTE_COMMENTS_PER_WEEK, ROUTE_COMMENT_MAX, routeComments } from './route-comments.ts'

import { msg } from '../src/i18n/translate.ts'
const deriveKey = promisify(scrypt)
const COOKIE = 'bi_academy_session'
const SESSION_MS = 7 * 24 * 60 * 60 * 1000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
type User = { id: string; name: string; email: string; role: 'employee' | 'manager' }
type Account = User & { password_hash: string }
type Team = { id: string; name: string; manager_id: string; invite_code: string }
const publicUser = ({ id, name, email, role }: User): User => ({ id, name, email, role })
const bodyOf = (req: Request): Record<string, unknown> =>
  req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
const textOf = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const fail = (res: Response, status: number, message: string, fields?: FieldErrors) => res.status(status).json({ error: message, ...(fields ? { fields } : {}) })
/**
 * Попытка для списков команды: только оценки четырёх качеств и сведения о прохождении. Вопросы, ответы, цитаты и разбор
 * сюда не попадают — их руководитель видит лишь в карточке сотрудника по последней попытке, коллеги не видят никогда.
 */
export function scoresOnly(attempt: DynamicAttempt | null): DynamicAttempt | null {
  if (!attempt) return null
  const evaluation = attempt.evaluation && {
    rubricVersion: attempt.evaluation.rubricVersion, model: attempt.evaluation.model,
    traits: Object.fromEntries(Object.entries(attempt.evaluation.traits).map(([trait, item]) => [trait, {
      preferencePercent: item.preferencePercent, professionalPercent: item.professionalPercent,
      ...(item.behaviorPercent === undefined ? {} : { behaviorPercent: item.behaviorPercent }),
      finalPercent: item.finalPercent, evidence: '', strength: '', nextStep: '', successCriterion: '' }])) as DynamicEvaluation['traits'],
  }
  return { ...attempt, choices: [], choiceAnswers: {}, openQuestions: [], openAnswers: {}, evaluation }
}
const invalid = (res: Response, fields: FieldErrors) => fail(res, 400, Object.values(fields)[0] ?? msg('Некорректный запрос.'), fields)

export function createApi(db: DatabaseSync, publicOrigin?: string) {
  const router = Router()
  const translator = createContentTranslator(db)
  const limits = new Map<string, { count: number; until: number }>()
  function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now()
    for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key)
    const key = req.ip ?? 'unknown'
    const entry = limits.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 }
    if (entry.count >= 100) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)))
      return fail(res, 429, msg('Слишком много попыток. Попробуйте через 15 минут.'))
    }
    entry.count++
    limits.set(key, entry)
    next()
  }
  function tokenOf(req: Request) {
    return req.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ''
  }
  function userOf(req: Request): User | undefined {
    return db.prepare(`SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(hash(tokenOf(req)), Date.now()) as User | undefined
  }
  function session(req: Request, res: Response, user: User) {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(tokenOf(req)))
    const token = randomBytes(32).toString('hex')
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), user.id, Date.now() + SESSION_MS)
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' || req.secure,
      path: '/', maxAge: SESSION_MS })
    return res.json({ user: publicUser(user), resetAt: resetAt(user.id) })
  }
  function resetAt(userId: string) {
    return (db.prepare('SELECT reset_at AS resetAt FROM account_resets WHERE user_id = ?').get(userId) as { resetAt: number } | undefined)?.resetAt ?? 0
  }
  /** Стирает прогресс аккаунта: прохождения, аватар, команды и все сессии. Метка сброса чистит данные и в других браузерах. */
  function resetAccount(user: User) {
    db.exec('BEGIN IMMEDIATE')
    try {
      invalidatePendingAssessments(db, user.id)
      db.prepare('DELETE FROM dynamic_actions WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM dynamic_attempts WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM attempts WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM avatars WHERE user_id = ?').run(user.id)
      deleteOwnerTranslations(db, user.id)
      if (user.role === 'employee') db.prepare('DELETE FROM memberships WHERE user_id = ?').run(user.id)
      else db.prepare('DELETE FROM teams WHERE manager_id = ?').run(user.id)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
      db.prepare(`INSERT INTO account_resets (user_id, reset_at) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET reset_at = excluded.reset_at`).run(user.id, Math.max(Date.now(), resetAt(user.id) + 1))
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  function requireRole(role?: User['role']) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = userOf(req)
      if (!user) return fail(res, 401, msg('Войдите в аккаунт.'))
      if (req.get('X-BI-User') && req.get('X-BI-User') !== user.id) return fail(res, 401, msg('Аккаунт изменился. Обновите страницу.'))
      if (role && user.role !== role) return fail(res, 403, msg('Для этой страницы нужна другая роль.'))
      res.locals.user = user
      next()
    }
  }
  function ownedTeam(req: Request, res: Response): Team | null {
    const team = db.prepare('SELECT * FROM teams WHERE id = ? AND manager_id = ?').get(String(req.params.id), res.locals.user.id) as Team | undefined
    if (!team) { fail(res, 404, msg('Команда не найдена.')); return null }
    return team
  }
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (req.get('X-BI-Academy') !== '1') return fail(res, 403, msg('Запрос отклонён. Обновите страницу.'))
      if (!allowsWriteOrigin(req, publicOrigin)) return fail(res, 403, msg('Источник запроса не разрешён.'))
    }
    next()
  })
  router.use(json({ limit: '64kb' }))
  router.get('/auth/me', (req, res) => {
    const user = userOf(req)
    res.json({ user: user ?? null, resetAt: user ? resetAt(user.id) : 0 })
  })
  router.post('/auth/register', rateLimit, async (req, res) => {
    const body = bodyOf(req)
    const validation = validateRegistration(body)
    if (!validation.ok) return invalid(res, validation.errors)
    const { name, email, password, role, inviteCode } = validation.value
    const team = inviteCode ? db.prepare('SELECT * FROM teams WHERE invite_code = ?').get(inviteCode) as Team | undefined : undefined
    if (inviteCode && !team) return fail(res, 400, msg('Проверьте код команды у руководителя.'), { inviteCode: msg('Проверьте код команды у руководителя.') })
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return fail(res, 409, msg('Этот email уже зарегистрирован. Войдите в аккаунт.'), { email: msg('Этот email уже зарегистрирован. Войдите в аккаунт.') })
    const salt = randomBytes(16).toString('hex')
    const key = await deriveKey(password, salt, 64) as Buffer
    const user: User = { id: randomUUID(), name, email, role }
    // После await email мог быть зарегистрирован параллельным запросом.
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return fail(res, 409, msg('Этот email уже зарегистрирован. Войдите в аккаунт.'), { email: msg('Этот email уже зарегистрирован. Войдите в аккаунт.') })
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(user.id, name, email, `${salt}:${key.toString('hex')}`, user.role)
      if (team) db.prepare('INSERT INTO memberships (user_id, team_id, consented_at, consent_version) VALUES (?, ?, ?, ?)').run(user.id, team.id, Date.now(), CONSENT_VERSION)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    res.status(201)
    return session(req, res, user)
  })
  router.post('/auth/login', rateLimit, async (req, res) => {
    const body = bodyOf(req)
    if (body.resetProgress !== undefined && typeof body.resetProgress !== 'boolean')
      return fail(res, 400, msg('Некорректный запрос.'))
    const validation = validateLogin(body)
    if (!validation.ok) return invalid(res, validation.errors)
    const { email, password } = validation.value
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Account | undefined
    const [salt, encoded] = (user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':')
    const key = await deriveKey(password, salt!, 64) as Buffer
    if (!user || !timingSafeEqual(key, Buffer.from(encoded!, 'hex'))) return fail(res, 401, msg('Неверный email или пароль.'))
    if (body.resetProgress === true) resetAccount(user)
    return session(req, res, user)
  })
  router.post('/auth/reset', requireRole(), (_req, res) => {
    const user = res.locals.user as User
    resetAccount(user)
    return session(_req, res, user)
  })
  router.post('/auth/logout', (req, res) => {
    const user = userOf(req)
    if (user && req.get('X-BI-User') && req.get('X-BI-User') !== user.id) return fail(res, 401, msg('Аккаунт изменился. Обновите страницу.'))
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(tokenOf(req)))
    res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' || req.secure })
    res.json({ ok: true })
  })
  router.get('/attempts', requireRole('employee'), (req, res) => {
    const requestedLimit = Number(req.query.limit)
    const requestedOffset = Number(req.query.offset)
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(50, requestedLimit) : 10
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? Math.min(1_000_000, requestedOffset) : 0
    const rows = db.prepare('SELECT result FROM attempts WHERE user_id = ? ORDER BY saved_at DESC, rowid DESC LIMIT ? OFFSET ?')
      .all(res.locals.user.id, limit, offset) as { result: string }[]
    const total = (db.prepare('SELECT COUNT(*) AS count FROM attempts WHERE user_id = ?').get(res.locals.user.id) as { count: number }).count
    res.json({ attempts: rows.map((row) => JSON.parse(row.result)), total })
  })
  router.post('/attempts', requireRole('employee'), (req, res) => {
    const body = bodyOf(req)
    const attemptId = textOf(body.attemptId)
    if (!/^[\w-]{1,128}$/.test(attemptId)) return fail(res, 400, msg('Некорректный номер попытки.'))
    if (!body.versions || typeof body.versions !== 'object'
      || !Object.entries(DATA_VERSIONS).every(([key, value]) => (body.versions as Record<string, unknown>)[key] === value)) return fail(res, 409, msg('Методика обновилась. Обновите страницу перед прохождением.'))
    if (body.completedAt !== undefined && typeof body.completedAt !== 'string') return fail(res, 400, msg('Некорректная дата попытки.'))
    const completedAt = typeof body.completedAt === 'string' ? body.completedAt : new Date().toISOString()
    if (!Number.isFinite(Date.parse(completedAt)) || new Date(completedAt).toISOString() !== completedAt
      || Date.parse(completedAt) > Date.now() + 300_000) return fail(res, 400, msg('Некорректная дата попытки.'))
    const calculated = calculateProfile(body.answers, { questions, scoring, versions: DATA_VERSIONS, attemptId, completedAt })
    if (!calculated.ok) return fail(res, 400, calculated.error.message)
    const existing = db.prepare('SELECT result FROM attempts WHERE user_id = ? AND id = ?').get(res.locals.user.id, attemptId) as { result: string } | undefined
    if (existing) {
      const previous = JSON.parse(existing.result)
      if (!questions.every((question) => previous.answers[question.id] === calculated.result.answers[question.id])) return fail(res, 409, msg('Попытка с таким номером уже содержит другие ответы. Начните новое прохождение.'))
      return res.json({ result: previous })
    }
    db.prepare('INSERT INTO attempts VALUES (?, ?, ?, ?)').run(res.locals.user.id, attemptId, JSON.stringify(calculated.result), Date.now())
    res.status(201).json({ result: calculated.result })
  })
  router.delete('/attempts', requireRole('employee'), (_req, res) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      invalidatePendingAssessments(db, res.locals.user.id)
      db.prepare('DELETE FROM dynamic_actions WHERE user_id = ?').run(res.locals.user.id)
      db.prepare('DELETE FROM route_comments WHERE user_id = ?').run(res.locals.user.id)
      db.prepare('DELETE FROM dynamic_attempts WHERE user_id = ?').run(res.locals.user.id)
      db.prepare('DELETE FROM attempts WHERE user_id = ?').run(res.locals.user.id)
      deleteOwnerTranslations(db, res.locals.user.id)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    res.json({ ok: true })
  })
  router.get('/teams', requireRole('manager'), (_req, res) => {
    const teams = db.prepare(`SELECT t.id, t.name, t.invite_code AS inviteCode, COUNT(m.user_id) AS memberCount
      FROM teams t LEFT JOIN memberships m ON m.team_id = t.id WHERE t.manager_id = ? GROUP BY t.id ORDER BY t.rowid`).all(res.locals.user.id)
    res.json({ teams })
  })
  router.post('/teams', requireRole('manager'), (req, res) => {
    const validation = validateTeamName(bodyOf(req).name)
    if (!validation.ok) return invalid(res, validation.errors)
    const name = validation.value
    const team = { id: randomUUID(), name, inviteCode: randomBytes(8).toString('hex').toUpperCase(), memberCount: 0 }
    db.prepare('INSERT INTO teams VALUES (?, ?, ?, ?)').run(team.id, name, res.locals.user.id, team.inviteCode)
    res.status(201).json({ team })
  })
  router.get('/teams/:id', requireRole('manager'), (req, res) => {
    const team = ownedTeam(req, res)
    if (!team) return
    // Результаты, история и аватар видны руководителю только при согласии сотрудника.
    // Входная попытка — самая ранняя из всех сохранённых.
    const rows = db.prepare(`SELECT u.id, u.name, u.email, m.consented_at AS consentedAt,
      CASE WHEN m.consented_at IS NULL THEN NULL ELSE
        (SELECT result FROM attempts a WHERE a.user_id = u.id ORDER BY saved_at DESC, rowid DESC LIMIT 1) END AS result,
      CASE WHEN m.consented_at IS NULL THEN NULL ELSE
        (SELECT result FROM attempts a WHERE a.user_id = u.id ORDER BY saved_at ASC, rowid ASC LIMIT 1) END AS baseline,
      CASE WHEN m.consented_at IS NULL THEN NULL ELSE
        (SELECT state FROM dynamic_attempts d WHERE d.user_id = u.id AND json_extract(d.state, '$.status') = 'completed' ORDER BY d.saved_at DESC LIMIT 1) END AS dynamicResult,
      CASE WHEN m.consented_at IS NULL THEN NULL ELSE
        (SELECT state FROM dynamic_attempts d WHERE d.user_id = u.id AND json_extract(d.state, '$.status') = 'completed' ORDER BY d.saved_at ASC LIMIT 1) END AS dynamicBaseline,
      CASE WHEN m.consented_at IS NULL THEN 0 ELSE
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) END AS attemptCount,
      CASE WHEN m.consented_at IS NULL THEN NULL ELSE
        (SELECT params FROM avatars v WHERE v.user_id = u.id) END AS avatar
      FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY u.name`).all(team.id) as {
      id: string; name: string; email: string; consentedAt: number | null; result: string | null; baseline: string | null;
      dynamicResult: string | null; dynamicBaseline: string | null; attemptCount: number; avatar: string | null }[]
    const parsed = (value: string | null) => value ? JSON.parse(value) : null
    res.json({ team: { id: team.id, name: team.name, inviteCode: team.invite_code, memberCount: rows.length },
      members: rows.map((row) => ({ id: row.id, name: row.name, email: row.email, consented: row.consentedAt !== null,
        result: parsed(row.result), baseline: parsed(row.baseline), dynamicResult: scoresOnly(parsed(row.dynamicResult)),
        dynamicBaseline: scoresOnly(parsed(row.dynamicBaseline)), attemptCount: Number(row.attemptCount), avatar: parsed(row.avatar) })) })
  })
  // Карточка развития одного сотрудника: последняя попытка, история для сопоставимой динамики, план и отметки практик.
  // Доступ — только к участнику своей команды с действующим согласием; проверки выполняются здесь, а не в интерфейсе.
  router.get('/teams/:id/members/:userId/card', requireRole('manager'), (req, res) => {
    const team = ownedTeam(req, res)
    if (!team) return
    const member = db.prepare(`SELECT u.id, u.name, m.consented_at AS consentedAt FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = ? AND m.user_id = ?`).get(team.id, String(req.params.userId)) as { id: string; name: string; consentedAt: number | null } | undefined
    if (!member) return fail(res, 404, msg('Сотрудник не найден в команде.'))
    if (member.consentedAt === null) return fail(res, 403, msg('Сотрудник ещё не дал согласия на передачу результатов.'))
    const completed = (db.prepare(`SELECT state FROM dynamic_attempts WHERE user_id = ? AND json_extract(state, '$.status') = 'completed'
      ORDER BY json_extract(state, '$.completedAt') ASC, rowid ASC`).all(member.id) as { state: string }[]).map((row) => JSON.parse(row.state) as DynamicAttempt)
    const latest = completed.at(-1) ?? null
    // История нужна только для сравнения оценок: тексты вопросов и ответы прежних попыток не передаются.
    const history = completed.map((item) => item === latest ? item : { ...item, choices: [], choiceAnswers: {}, openQuestions: [], openAnswers: {} })
    const marks = latest ? (db.prepare('SELECT week, completed_at AS completedAt FROM dynamic_actions WHERE user_id = ? AND attempt_id = ? ORDER BY week')
      .all(member.id, latest.id) as { week: number; completedAt: number }[]).map((row) => ({ week: row.week, completedAt: new Date(row.completedAt).toISOString() })) : []
    const comments = latest ? routeComments(db, member.id, latest.id, res.locals.user.id) : []
    const legacyRow = (order: 'ASC' | 'DESC') => db.prepare(`SELECT result FROM attempts WHERE user_id = ? ORDER BY saved_at ${order}, rowid ${order} LIMIT 1`)
      .get(member.id) as { result: string } | undefined
    const legacyCount = (db.prepare('SELECT COUNT(*) AS count FROM attempts WHERE user_id = ?').get(member.id) as { count: number }).count
    const avatar = db.prepare('SELECT params FROM avatars WHERE user_id = ?').get(member.id) as { params: string } | undefined
    res.json({ member: { id: member.id, name: member.name }, avatar: avatar ? JSON.parse(avatar.params) : null,
      dynamic: latest ? { latest, history, marks, comments } : null,
      legacy: legacyCount ? { latest: JSON.parse(legacyRow('DESC')!.result), baseline: JSON.parse(legacyRow('ASC')!.result), count: legacyCount } : null })
  })
  // Перевод последней попытки сотрудника для карточки руководителя. Переводы принадлежат сотруднику и удаляются вместе с его историей.
  router.post('/teams/:id/members/:userId/card/translation', requireRole('manager'), (req, res) => {
    const member = consentedMember(req, res)
    if (!member) return
    const lang = bodyOf(req).lang
    if (!isContentLang(lang)) return fail(res, 400, 'Неизвестный язык перевода.')
    const row = db.prepare(`SELECT state FROM dynamic_attempts WHERE user_id = ? AND json_extract(state, '$.status') = 'completed'
      ORDER BY json_extract(state, '$.completedAt') DESC, rowid DESC LIMIT 1`).get(member.id) as { state: string } | undefined
    if (!row) return fail(res, 404, 'Попытка не найдена.')
    const attempt = JSON.parse(row.state) as DynamicAttempt
    res.json(translator.status(member.id, `attempt:${attempt.id}`, lang, attemptTexts(attempt), { retry: bodyOf(req).retry === true }))
  })
  // Комментарии руководителя к неделям маршрута: добавляет только руководитель команды сотрудника, у которого есть согласие.
  function consentedMember(req: Request, res: Response) {
    const team = ownedTeam(req, res)
    if (!team) return null
    const member = db.prepare('SELECT user_id AS id, consented_at AS consentedAt FROM memberships WHERE team_id = ? AND user_id = ?')
      .get(team.id, String(req.params.userId)) as { id: string; consentedAt: number | null } | undefined
    if (!member) { fail(res, 404, msg('Сотрудник не найден в команде.')); return null }
    if (member.consentedAt === null) { fail(res, 403, msg('Сотрудник ещё не дал согласия на передачу результатов.')); return null }
    return member
  }
  router.post('/teams/:id/members/:userId/route-comments', requireRole('manager'), (req, res) => {
    const member = consentedMember(req, res)
    if (!member) return
    const body = bodyOf(req)
    const attemptId = textOf(body.attemptId)
    const week = body.week
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > 4) return fail(res, 400, msg('Укажите неделю маршрута от 1 до 4.'))
    if (text.length < 1 || text.length > ROUTE_COMMENT_MAX) return fail(res, 400, `Комментарий должен содержать от 1 до ${ROUTE_COMMENT_MAX} символов.`)
    const attempt = db.prepare("SELECT 1 FROM dynamic_attempts WHERE user_id = ? AND id = ? AND json_extract(state, '$.status') = 'completed'").get(member.id, attemptId)
    if (!attempt) return fail(res, 404, msg('Маршрут не найден.'))
    const count = (db.prepare('SELECT COUNT(*) AS count FROM route_comments WHERE user_id = ? AND attempt_id = ? AND week = ?').get(member.id, attemptId, week) as { count: number }).count
    if (count >= ROUTE_COMMENTS_PER_WEEK) return fail(res, 409, msg('К этой неделе уже добавлено максимум комментариев.'))
    db.prepare('INSERT INTO route_comments VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), member.id, attemptId, week, res.locals.user.id, text, Date.now())
    res.status(201).json({ comments: routeComments(db, member.id, attemptId, res.locals.user.id) })
  })
  router.delete('/teams/:id/members/:userId/route-comments/:commentId', requireRole('manager'), (req, res) => {
    const member = consentedMember(req, res)
    if (!member) return
    // Удалить можно только собственный комментарий.
    const removed = db.prepare('DELETE FROM route_comments WHERE id = ? AND user_id = ? AND manager_id = ?').run(String(req.params.commentId), member.id, res.locals.user.id)
    if (!removed.changes) return fail(res, 404, msg('Комментарий не найден.'))
    res.json({ ok: true })
  })
  router.delete('/teams/:id/members/:userId', requireRole('manager'), (req, res) => {
    const team = ownedTeam(req, res)
    if (!team) return
    db.prepare('DELETE FROM memberships WHERE team_id = ? AND user_id = ?').run(team.id, String(req.params.userId))
    res.json({ ok: true })
  })
  router.get('/membership', requireRole('employee'), (_req, res) => {
    const team = db.prepare(`SELECT t.id, t.name, u.name AS managerName, m.consented_at IS NOT NULL AS consented FROM memberships m
      JOIN teams t ON t.id = m.team_id JOIN users u ON u.id = t.manager_id WHERE m.user_id = ?`).get(res.locals.user.id) as Record<string, unknown> | undefined
    res.json({ team: team ? { ...team, consented: Boolean(team.consented) } : null })
  })
  // Бригада глазами сотрудника: только участники с согласием, без почты; сам сотрудник видит её, лишь если тоже дал согласие.
  router.get('/membership/team', requireRole('employee'), (_req, res) => {
    const own = db.prepare('SELECT team_id AS teamId, consented_at AS consentedAt FROM memberships WHERE user_id = ?').get(res.locals.user.id) as { teamId: string; consentedAt: number | null } | undefined
    if (!own) return fail(res, 404, msg('Вы не состоите в команде.'))
    if (own.consentedAt === null) return fail(res, 403, msg('Подтвердите согласие, чтобы видеть результаты команды.'))
    const rows = db.prepare(`SELECT u.id, u.name,
      (SELECT result FROM attempts a WHERE a.user_id = u.id ORDER BY saved_at DESC, rowid DESC LIMIT 1) AS result,
      (SELECT state FROM dynamic_attempts d WHERE d.user_id = u.id AND json_extract(d.state, '$.status') = 'completed' ORDER BY d.saved_at DESC LIMIT 1) AS dynamicResult,
      (SELECT params FROM avatars v WHERE v.user_id = u.id) AS avatar
      FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? AND m.consented_at IS NOT NULL ORDER BY u.name`).all(own.teamId) as {
      id: string; name: string; result: string | null; dynamicResult: string | null; avatar: string | null }[]
    const parsed = (value: string | null) => value ? JSON.parse(value) : null
    res.json({ members: rows.map((row) => ({ id: row.id, name: row.name, result: parsed(row.result), dynamicResult: scoresOnly(parsed(row.dynamicResult)), avatar: parsed(row.avatar) })) })
  })
  router.post('/membership', requireRole('employee'), rateLimit, (req, res) => {
    const validation = validateInviteCode(bodyOf(req).inviteCode)
    if (!validation.ok) return invalid(res, validation.errors)
    const code = validation.value
    const team = db.prepare('SELECT * FROM teams WHERE invite_code = ?').get(code) as Team | undefined
    if (!team) return fail(res, 404, msg('Команда с таким кодом не найдена.'), { inviteCode: msg('Команда с таким кодом не найдена.') })
    if (db.prepare('SELECT team_id FROM memberships WHERE user_id = ?').get(res.locals.user.id)) return fail(res, 409, msg('Сначала выйдите из текущей команды.'))
    const consent = validateConsent(bodyOf(req).consent)
    if (!consent.ok) return invalid(res, consent.errors)
    db.prepare('INSERT INTO memberships (user_id, team_id, consented_at, consent_version) VALUES (?, ?, ?, ?)').run(res.locals.user.id, team.id, Date.now(), CONSENT_VERSION)
    // Отмеченные до вступления «некорректные вопросы» уходят руководителю этой бригады.
    deliverQuestionReports(db, res.locals.user.id)
    res.status(201).json({ ok: true })
  })
  // Участник, вступивший до появления согласия, подтверждает его отдельно.
  router.put('/membership/consent', requireRole('employee'), (req, res) => {
    const consent = validateConsent(bodyOf(req).consent)
    if (!consent.ok) return invalid(res, consent.errors)
    const changed = db.prepare('UPDATE memberships SET consented_at = ?, consent_version = ? WHERE user_id = ?').run(Date.now(), CONSENT_VERSION, res.locals.user.id)
    if (!changed.changes) return fail(res, 404, msg('Вы пока не состоите в команде.'))
    res.json({ ok: true })
  })
  // Аватар сотрудника: руководитель видит его в карточке развития. null — персонаж по результату теста.
  router.get('/avatar', requireRole(), (_req, res) => {
    const row = db.prepare('SELECT params FROM avatars WHERE user_id = ?').get(res.locals.user.id) as { params: string } | undefined
    res.json({ avatar: row ? JSON.parse(row.params) : null })
  })
  router.put('/avatar', requireRole(), (req, res) => {
    const avatar = bodyOf(req).avatar
    if (avatar === null) {
      db.prepare('DELETE FROM avatars WHERE user_id = ?').run(res.locals.user.id)
      return res.json({ avatar: null })
    }
    if (!isAvatarParams(avatar)) return fail(res, 400, msg('Некорректные параметры аватара.'))
    // Сохраняются только известные поля: лишние ключи из запроса в базу не попадают.
    const { universe, gender, palette, role, action, motivation, power, animal, skin } = avatar
    const clean = { universe, gender, palette, role, action, motivation, power, animal, skin }
    db.prepare(`INSERT INTO avatars (user_id, params, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET params = excluded.params, updated_at = excluded.updated_at`).run(res.locals.user.id, JSON.stringify(clean), Date.now())
    res.json({ avatar: clean })
  })
  router.delete('/membership', requireRole('employee'), (_req, res) => {
    db.prepare('DELETE FROM memberships WHERE user_id = ?').run(res.locals.user.id)
    res.json({ ok: true })
  })
  meetingRoutes(router, db, { requireRole, fail, ownedTeam })
  questionReportRoutes(router, db, { requireRole, fail })
  // Руководитель тоже может пройти тест для себя: в бригаду попадают только участники memberships.
  // Любой руководитель может вернуть тестовые аккаунты в исходное состояние; другие пользователи не затрагиваются.
  router.post('/test-accounts/reset', requireRole('manager'), rateLimit, (req, res) => {
    const fixture = JSON.parse(readFileSync(new URL('./test-accounts.json', import.meta.url), 'utf8')) as TestAccounts
    seedTestAccounts(db, fixture, { keepSession: hash(tokenOf(req)) })
    const accounts = [{ name: fixture.manager.name, email: fixture.manager.email, role: 'manager' },
      ...fixture.employees.map((item) => ({ name: item.name, email: item.email, role: 'employee' }))]
    res.json({ password: fixture.password, team: fixture.team, accounts,
      self: accounts.some((item) => item.email.toLowerCase() === res.locals.user.email.toLowerCase()) })
  })
  router.use('/dynamic', dynamicRoutes(db, requireRole(), rateLimit, translator))
  router.use((_req, res) => fail(res, 404, msg('API не найден.')))
  router.use((error: { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500
    return fail(res, status, status === 500 ? msg('Не удалось выполнить запрос. Попробуйте ещё раз.') : msg('Некорректный запрос.'))
  })
  return router
}
