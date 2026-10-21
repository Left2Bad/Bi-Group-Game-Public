import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { isAvatarParams } from '../src/domain/avatar.ts'
import { CONSENT_VERSION } from '../src/domain/account-validation.ts'
import type { TestAccounts } from '../src/dynamic/test-accounts.ts'
import { invalidatePendingAssessments } from './dynamic-routes.ts'

const DAY = 86_400_000

/** Хэш в том же формате, что и при регистрации в api.ts. */
function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

/**
 * Создаёт или пересоздаёт тестовые аккаунты из server/test-accounts.json одной транзакцией.
 * Пользователи сохраняют id, но всё их содержимое (сессии, попытки, аватары, команды, отметки,
 * комментарии, беседы) удаляется и записывается заново, а открытые вкладки браузера сбрасывают локальные данные.
 * keepSession — хэш сессии того, кто нажал кнопку сброса: тестовый руководитель остаётся в аккаунте.
 */
export function seedTestAccounts(db: DatabaseSync, fixture: TestAccounts, { now = Date.now(), keepSession = '' }: { now?: number; keepSession?: string } = {}) {
  const people = [{ ...fixture.manager, role: 'manager' as const }, ...fixture.employees.map((item) => ({ ...item, role: 'employee' as const }))]
  for (const person of fixture.employees) if (person.avatar && !isAvatarParams(person.avatar)) throw new Error(`Некорректный аватар у ${person.email}.`)
  const foreignTeam = db.prepare(`SELECT t.id FROM teams t JOIN users u ON u.id = t.manager_id WHERE t.invite_code = ? AND u.email != ?`)
    .get(fixture.team.inviteCode, fixture.manager.email)
  if (foreignTeam) throw new Error(`Код ${fixture.team.inviteCode} уже занят командой другого руководителя.`)
  const ids: Record<string, string> = {}
  const teamId = randomUUID()
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const person of people) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(person.email) as { id: string } | undefined
      const id = existing?.id ?? randomUUID()
      ids[person.email] = id
      if (existing) db.prepare('UPDATE users SET name = ?, password_hash = ?, role = ? WHERE id = ?').run(person.name, passwordHash(fixture.password), person.role, id)
      else db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(id, person.name, person.email, passwordHash(fixture.password), person.role)
      invalidatePendingAssessments(db, id)
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(id, keepSession)
      for (const table of ['attempts', 'avatars', 'dynamic_attempts', 'dynamic_actions', 'route_comments', 'memberships'])
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id)
      db.prepare('DELETE FROM route_comments WHERE manager_id = ?').run(id)
      db.prepare('DELETE FROM meetings WHERE manager_id = ? OR employee_id = ?').run(id, id)
      // Участники чужих команд тестового руководителя теряют членство вместе с командой.
      db.prepare('DELETE FROM teams WHERE manager_id = ?').run(id)
      db.prepare(`INSERT INTO account_resets (user_id, reset_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET reset_at = MAX(excluded.reset_at, reset_at + 1)`).run(id, now)
    }
    const managerId = ids[fixture.manager.email]!
    db.prepare('INSERT INTO teams VALUES (?, ?, ?, ?)').run(teamId, fixture.team.name, managerId, fixture.team.inviteCode)
    for (const person of fixture.employees) {
      const userId = ids[person.email]!
      if (person.inTeam) db.prepare('INSERT INTO memberships (user_id, team_id, consented_at, consent_version) VALUES (?, ?, ?, ?)').run(userId, teamId, now, CONSENT_VERSION)
      if (person.avatar) db.prepare('INSERT INTO avatars VALUES (?, ?, ?)').run(userId, JSON.stringify(person.avatar), now)
      const attempts = person.attempts.map((attempt) => ({ ...attempt, id: randomUUID() }))
      for (const attempt of attempts) db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(userId, attempt.id, JSON.stringify(attempt), Date.parse(attempt.completedAt!))
      const latest = attempts.at(-1)
      if (!latest) continue
      const base = Date.parse(latest.completedAt!)
      for (const mark of person.marks) db.prepare('INSERT INTO dynamic_actions VALUES (?, ?, ?, ?)').run(userId, latest.id, mark.week, base + mark.day * DAY)
      for (const comment of person.comments) db.prepare('INSERT INTO route_comments VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), userId, latest.id, comment.week, managerId, comment.text, base + comment.day * DAY)
    }
    for (const meeting of fixture.meetings) {
      const at = new Date(now + meeting.inDays * DAY)
      at.setHours(meeting.hour, 0, 0, 0)
      const accepted = meeting.status === 'accepted'
      db.prepare(`INSERT INTO meetings (id, team_id, manager_id, employee_id, scheduled_at, message, status, created_at, responded_at, manager_seen, employee_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(randomUUID(), teamId, managerId, ids[meeting.email]!, at.getTime(), meeting.message, meeting.status,
        now - 3 * DAY, accepted ? now - 2 * DAY : null, accepted ? 1 : 0)
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { teamId, people: people.length }
}
