import { randomUUID } from 'node:crypto'
import type { Request, RequestHandler, Response, Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { DynamicAttempt } from '../src/dynamic/domain.ts'

import { msg } from '../src/i18n/translate.ts'
/**
 * Сообщения «Некорректный вопрос». Сотрудник отмечает вопрос во время теста; ответ на него всё равно учитывается в результате.
 * Сообщение получает руководитель бригады, в которой сотрудник состоит в момент отметки. Если бригады нет, сообщение ждёт
 * и уходит руководителю той бригады, в которую сотрудник вступит. Доставленное сообщение закреплено за получателем:
 * при переходе в другую бригаду оно не отправляется повторно. Один сотрудник отмечает один вопрос только один раз.
 */
export const QUESTION_REPORT_SUBJECT = msg('Некорректный вопрос')

export interface ReportedQuestion {
  readonly kind: 'choice' | 'open'
  readonly context?: string
  readonly text: string
  readonly options?: readonly string[]
}

type ReportRow = { id: string; questionId: string; question: string; createdAt: number; deliveredAt: number; teamName: string
  employeeName: string; managerSeen: number }

/** Закрепляет ожидающие сообщения сотрудника за руководителем его текущей бригады. Уже доставленные не трогает. */
export function deliverQuestionReports(db: DatabaseSync, userId: string) {
  const team = db.prepare('SELECT t.id, t.name, t.manager_id AS managerId FROM memberships m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ?')
    .get(userId) as { id: string; name: string; managerId: string } | undefined
  if (!team) return
  db.prepare('UPDATE question_reports SET manager_id = ?, team_name = ?, delivered_at = ? WHERE user_id = ? AND manager_id IS NULL')
    .run(team.managerId, team.name, Date.now(), userId)
}

/** Снимок вопроса из сохранённой попытки: руководитель видит текст, который был у сотрудника, а не присланный браузером. */
function questionOf(attempt: DynamicAttempt, questionId: string): ReportedQuestion | null {
  const choice = attempt.choices.find((item) => item.id === questionId)
  if (choice) return { kind: 'choice', context: choice.context, text: choice.text, options: choice.options.map((option) => option.text) }
  const open = attempt.openQuestions.find((item) => item.id === questionId)
  return open ? { kind: 'open', text: open.text } : null
}

export function questionReportRoutes(router: Router, db: DatabaseSync, deps: {
  readonly requireRole: (role?: 'employee' | 'manager') => RequestHandler
  readonly fail: (res: Response, status: number, message: string) => unknown
}) {
  const { requireRole, fail } = deps
  const body = (req: Request): Record<string, unknown> => req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  const mine = (userId: string) => (db.prepare('SELECT question_id AS questionId FROM question_reports WHERE user_id = ?').all(userId) as { questionId: string }[])
    .map((row) => row.questionId)
  const managerPayload = (managerId: string) => {
    // Страховка: сотрудники, которые уже в бригадах руководителя, но чьи сообщения ещё ждут доставки.
    const waiting = db.prepare(`SELECT DISTINCT r.user_id AS userId FROM question_reports r JOIN memberships m ON m.user_id = r.user_id
      JOIN teams t ON t.id = m.team_id WHERE r.manager_id IS NULL AND t.manager_id = ?`).all(managerId) as { userId: string }[]
    for (const { userId } of waiting) deliverQuestionReports(db, userId)
    const rows = db.prepare(`SELECT r.id, r.question_id AS questionId, r.question, r.created_at AS createdAt, r.delivered_at AS deliveredAt,
      r.team_name AS teamName, u.name AS employeeName, r.manager_seen AS managerSeen
      FROM question_reports r JOIN users u ON u.id = r.user_id WHERE r.manager_id = ? ORDER BY r.delivered_at DESC, r.rowid DESC`).all(managerId) as ReportRow[]
    const reports = rows.map((row) => ({ id: row.id, subject: QUESTION_REPORT_SUBJECT, questionId: row.questionId, question: JSON.parse(row.question) as ReportedQuestion,
      employeeName: row.employeeName, teamName: row.teamName, reportedAt: new Date(row.createdAt).toISOString(),
      deliveredAt: new Date(row.deliveredAt).toISOString(), unseen: row.managerSeen === 0 }))
    return { reports, unread: reports.filter((item) => item.unseen).length }
  }

  // Сотрудник (и руководитель, проходящий тест для себя): какие вопросы он уже отметил и новая отметка.
  router.get('/question-reports', requireRole(), (_req, res) => res.json({ questionIds: mine(res.locals.user.id) }))
  router.post('/question-reports', requireRole(), (req, res) => {
    const input = body(req)
    const attemptId = typeof input.attemptId === 'string' ? input.attemptId : ''
    const questionId = typeof input.questionId === 'string' ? input.questionId : ''
    const row = db.prepare('SELECT state FROM dynamic_attempts WHERE user_id = ? AND id = ?').get(res.locals.user.id, attemptId) as { state: string } | undefined
    if (!row) return fail(res, 404, msg('Прохождение не найдено.'))
    const question = questionOf(JSON.parse(row.state) as DynamicAttempt, questionId)
    if (!question) return fail(res, 404, msg('Вопрос не найден в этом прохождении.'))
    const created = db.prepare(`INSERT OR IGNORE INTO question_reports (id, user_id, attempt_id, question_id, question, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), res.locals.user.id, attemptId, questionId, JSON.stringify(question), Date.now())
    if (created.changes) deliverQuestionReports(db, res.locals.user.id)
    res.status(created.changes ? 201 : 200).json({ questionIds: mine(res.locals.user.id), alreadyReported: !created.changes })
  })

  router.get('/manager/question-reports', requireRole('manager'), (_req, res) => res.json(managerPayload(res.locals.user.id)))
  router.post('/manager/question-reports/seen', requireRole('manager'), (_req, res) => {
    db.prepare('UPDATE question_reports SET manager_seen = 1 WHERE manager_id = ? AND manager_seen = 0').run(res.locals.user.id)
    res.json(managerPayload(res.locals.user.id))
  })
}
