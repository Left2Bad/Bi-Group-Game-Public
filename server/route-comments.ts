import type { DatabaseSync } from 'node:sqlite'

export const ROUTE_COMMENT_MAX = 1000
export const ROUTE_COMMENTS_PER_WEEK = 20

/**
 * Комментарии руководителя к неделям маршрута. Без viewerId — для сотрудника, с viewerId — для руководителя:
 * тогда у своих комментариев mine = true, и только их можно удалить.
 */
export function routeComments(db: DatabaseSync, userId: string, attemptId: string, viewerId?: string) {
  const rows = db.prepare(`SELECT c.id, c.week, c.body, c.created_at AS createdAt, c.manager_id AS managerId, u.name AS managerName
    FROM route_comments c JOIN users u ON u.id = c.manager_id WHERE c.user_id = ? AND c.attempt_id = ?
    ORDER BY c.week, c.created_at, c.rowid`).all(userId, attemptId) as { id: string; week: number; body: string; createdAt: number; managerId: string; managerName: string }[]
  return rows.map((row) => ({ id: row.id, week: row.week, text: row.body, managerName: row.managerName,
    createdAt: new Date(row.createdAt).toISOString(), ...(viewerId ? { mine: row.managerId === viewerId } : {}) }))
}
