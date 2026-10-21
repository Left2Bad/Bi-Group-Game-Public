import { randomUUID } from 'node:crypto'
import type { Request, RequestHandler, Response, Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'

import { msg } from '../src/i18n/translate.ts'
/**
 * Беседы руководителя с сотрудником. Руководитель приглашает сотрудника своей команды (с согласием на передачу результатов),
 * у которого хотя бы один показатель ниже нормы; сотрудник принимает или отклоняет приглашение.
 * Статусы: pending — ждёт ответа, accepted, declined, cancelled — отменена руководителем.
 */
export const MEETING_MESSAGE_MAX = 500
export const MEETING_MAX_PENDING_PER_EMPLOYEE = 5
/** Показатель ниже нормы: меньше 55%, как уровень «приоритет развития» в профиле. */
export const BELOW_NORM_PERCENT = 55
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000

type MeetingRow = { id: string; teamId: string; teamName: string; employeeId: string; employeeName: string; managerId: string; managerName: string
  scheduledAt: number; message: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; createdAt: number; respondedAt: number | null
  managerSeen: number; employeeSeen: number }

const SELECT = `SELECT m.id, m.team_id AS teamId, t.name AS teamName, m.employee_id AS employeeId, e.name AS employeeName, m.manager_id AS managerId,
  g.name AS managerName, m.scheduled_at AS scheduledAt, m.message, m.status, m.created_at AS createdAt, m.responded_at AS respondedAt,
  m.manager_seen AS managerSeen, m.employee_seen AS employeeSeen
  FROM meetings m JOIN teams t ON t.id = m.team_id JOIN users e ON e.id = m.employee_id JOIN users g ON g.id = m.manager_id`

const view = (row: MeetingRow, viewer: 'manager' | 'employee') => ({
  id: row.id, teamId: row.teamId, teamName: row.teamName, employeeId: row.employeeId, employeeName: row.employeeName, managerName: row.managerName,
  at: new Date(row.scheduledAt).toISOString(), message: row.message, status: row.status, createdAt: new Date(row.createdAt).toISOString(),
  respondedAt: row.respondedAt === null ? null : new Date(row.respondedAt).toISOString(),
  /** Требует внимания зрителя: руководителю — новый ответ сотрудника; сотруднику — приглашение без ответа или отмена. */
  unseen: viewer === 'manager' ? (row.status === 'accepted' || row.status === 'declined') && row.managerSeen === 0
    : row.status === 'pending' || (row.status === 'cancelled' && row.employeeSeen === 0),
})

/** У сотрудника есть показатель ниже нормы: по последней диагностике новой методики, а при её отсутствии — прежней. */
export function belowNorm(db: DatabaseSync, userId: string): boolean {
  const dynamic = db.prepare("SELECT state FROM dynamic_attempts WHERE user_id = ? AND json_extract(state, '$.status') = 'completed' ORDER BY saved_at DESC, rowid DESC LIMIT 1")
    .get(userId) as { state: string } | undefined
  if (dynamic) {
    const traits = (JSON.parse(dynamic.state) as { evaluation?: { traits?: Record<string, { finalPercent?: number }> } }).evaluation?.traits
    if (traits) return Object.values(traits).some((trait) => typeof trait.finalPercent === 'number' && trait.finalPercent < BELOW_NORM_PERCENT)
  }
  const legacy = db.prepare('SELECT result FROM attempts WHERE user_id = ? ORDER BY saved_at DESC, rowid DESC LIMIT 1').get(userId) as { result: string } | undefined
  if (!legacy) return false
  return Object.values((JSON.parse(legacy.result) as { traits: Record<string, { level: string }> }).traits).some((trait) => trait.level === 'priority')
}

export function meetingRoutes(router: Router, db: DatabaseSync, deps: {
  readonly requireRole: (role: 'employee' | 'manager') => RequestHandler
  readonly fail: (res: Response, status: number, message: string) => unknown
  readonly ownedTeam: (req: Request, res: Response) => { id: string } | null
}) {
  const { requireRole, fail, ownedTeam } = deps
  const body = (req: Request): Record<string, unknown> => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  // Руководитель видит беседы только с теми, кто сейчас состоит в его команде и дал согласие.
  const managerList = (managerId: string) => db.prepare(`${SELECT}
    JOIN memberships s ON s.user_id = m.employee_id AND s.team_id = m.team_id AND s.consented_at IS NOT NULL
    WHERE m.manager_id = ? ORDER BY m.scheduled_at ASC, m.rowid ASC`).all(managerId) as MeetingRow[]
  // Сотрудник видит приглашения команды, в которой состоит сейчас.
  const employeeList = (employeeId: string) => db.prepare(`${SELECT}
    JOIN memberships s ON s.user_id = m.employee_id AND s.team_id = m.team_id
    WHERE m.employee_id = ? ORDER BY m.scheduled_at ASC, m.rowid ASC`).all(employeeId) as MeetingRow[]
  const managerPayload = (managerId: string) => { const meetings = managerList(managerId).map((row) => view(row, 'manager')); return { meetings, unread: meetings.filter((item) => item.unseen).length } }
  const employeePayload = (employeeId: string) => { const meetings = employeeList(employeeId).map((row) => view(row, 'employee')); return { meetings, unread: meetings.filter((item) => item.unseen).length } }

  router.post('/teams/:id/members/:userId/meetings', requireRole('manager'), (req, res) => {
    const team = ownedTeam(req, res)
    if (!team) return
    const member = db.prepare('SELECT user_id AS id, consented_at AS consentedAt FROM memberships WHERE team_id = ? AND user_id = ?')
      .get(team.id, String(req.params.userId)) as { id: string; consentedAt: number | null } | undefined
    if (!member) return fail(res, 404, msg('Сотрудник не найден в команде.'))
    if (member.consentedAt === null) return fail(res, 403, msg('Сотрудник ещё не дал согласия на передачу результатов.'))
    const input = body(req)
    const at = typeof input.at === 'string' ? Date.parse(input.at) : NaN
    const message = typeof input.message === 'string' ? input.message.trim() : ''
    if (!Number.isFinite(at) || at < Date.now() || at > Date.now() + MAX_AHEAD_MS) return fail(res, 400, msg('Укажите дату и время встречи в будущем (не дальше года).'))
    if (message.length > MEETING_MESSAGE_MAX) return fail(res, 400, `Сообщение не должно быть длиннее ${MEETING_MESSAGE_MAX} символов.`)
    if (!belowNorm(db, member.id)) return fail(res, 409, msg('У сотрудника нет показателей ниже нормы.'))
    const pending = (db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE employee_id = ? AND status = 'pending'").get(member.id) as { count: number }).count
    if (pending >= MEETING_MAX_PENDING_PER_EMPLOYEE) return fail(res, 409, msg('У сотрудника уже есть неотвеченные приглашения.'))
    db.prepare("INSERT INTO meetings (id, team_id, manager_id, employee_id, scheduled_at, message, status, created_at, manager_seen, employee_seen) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 1, 0)")
      .run(randomUUID(), team.id, res.locals.user.id, member.id, at, message, Date.now())
    res.status(201).json(managerPayload(res.locals.user.id))
  })
  router.get('/manager/meetings', requireRole('manager'), (_req, res) => res.json(managerPayload(res.locals.user.id)))
  router.post('/manager/meetings/seen', requireRole('manager'), (_req, res) => {
    db.prepare("UPDATE meetings SET manager_seen = 1 WHERE manager_id = ? AND manager_seen = 0 AND status IN ('accepted', 'declined')").run(res.locals.user.id)
    res.json(managerPayload(res.locals.user.id))
  })
  router.post('/manager/meetings/:meetingId/cancel', requireRole('manager'), (req, res) => {
    const changed = db.prepare("UPDATE meetings SET status = 'cancelled', employee_seen = 0, responded_at = ? WHERE id = ? AND manager_id = ? AND status IN ('pending', 'accepted')")
      .run(Date.now(), String(req.params.meetingId), res.locals.user.id)
    if (!changed.changes) return fail(res, 404, msg('Беседа не найдена или уже завершена.'))
    res.json(managerPayload(res.locals.user.id))
  })

  router.get('/meetings', requireRole('employee'), (_req, res) => res.json(employeePayload(res.locals.user.id)))
  router.post('/meetings/seen', requireRole('employee'), (_req, res) => {
    db.prepare("UPDATE meetings SET employee_seen = 1 WHERE employee_id = ? AND status = 'cancelled'").run(res.locals.user.id)
    res.json(employeePayload(res.locals.user.id))
  })
  router.put('/meetings/:meetingId', requireRole('employee'), (req, res) => {
    const response = body(req).response
    if (response !== 'accepted' && response !== 'declined') return fail(res, 400, msg('Выберите «принять» или «отклонить».'))
    const row = db.prepare(`SELECT m.status, m.scheduled_at AS scheduledAt FROM meetings m
      JOIN memberships s ON s.user_id = m.employee_id AND s.team_id = m.team_id WHERE m.id = ? AND m.employee_id = ?`)
      .get(String(req.params.meetingId), res.locals.user.id) as { status: string; scheduledAt: number } | undefined
    if (!row) return fail(res, 404, msg('Приглашение не найдено.'))
    if (row.status !== 'pending') return fail(res, 409, msg('На это приглашение уже отвечено или оно отменено.'))
    if (row.scheduledAt < Date.now()) return fail(res, 409, msg('Дата встречи уже прошла.'))
    db.prepare("UPDATE meetings SET status = ?, responded_at = ?, manager_seen = 0 WHERE id = ? AND employee_id = ? AND status = 'pending'")
      .run(response, Date.now(), String(req.params.meetingId), res.locals.user.id)
    res.json(employeePayload(res.locals.user.id))
  })
}
