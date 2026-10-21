// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { seedTestAccounts } from './test-accounts'
import { buildTestAccounts } from '../src/dynamic/test-accounts'
import type { TestAccounts } from '../src/dynamic/test-accounts'
import type { DynamicAttempt } from '../src/dynamic/domain'

const fixture = JSON.parse(readFileSync(new URL('./test-accounts.json', import.meta.url), 'utf8')) as TestAccounts

it('server/test-accounts.json совпадает с примером: после правок примера нужен npm run test-accounts:build', () => {
  expect(fixture).toEqual(JSON.parse(JSON.stringify(buildTestAccounts())))
})

describe('заполнение тестовых аккаунтов', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bi-test-accounts-'))
  const databasePath = join(directory, 'academy.sqlite')
  const app = createApp({ serveClient: false, databasePath })
  let server: Server
  let base = ''
  const seed = () => { const db = new DatabaseSync(databasePath); try { seedTestAccounts(db, fixture) } finally { db.close() } }
  async function call(path: string, cookie = '', body?: unknown) {
    const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, data: await res.json() as Record<string, never>, cookie: res.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ') }
  }
  const login = async (email: string) => (await call('/auth/login', '', { email, password: fixture.password })).cookie

  beforeAll(async () => {
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No TCP port')
    base = `http://127.0.0.1:${address.port}/api`
  })
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    app.locals.closeDatabase()
    rmSync(directory, { recursive: true, force: true })
  })

  it('повторный запуск пересоздаёт данные без дублей и завершает старые сессии', async () => {
    seed()
    const before = await login('alexey@bi.test')
    const db = new DatabaseSync(databasePath)
    db.prepare("DELETE FROM avatars WHERE user_id = (SELECT id FROM users WHERE email = 'asel@bi.test')").run()
    db.close()
    seed()
    expect((await call('/auth/me', before)).data.user).toBeNull()
    const check = new DatabaseSync(databasePath, { readOnly: true })
    const count = (sql: string) => (check.prepare(sql).get() as { n: number }).n
    expect(count("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@bi.test'")).toBe(fixture.employees.length + 1)
    expect(count('SELECT COUNT(*) AS n FROM teams')).toBe(1)
    expect(count('SELECT COUNT(*) AS n FROM dynamic_attempts')).toBe(fixture.employees.reduce((sum, item) => sum + item.attempts.length, 0))
    expect(count('SELECT COUNT(*) AS n FROM meetings')).toBe(fixture.meetings.length)
    expect(count("SELECT COUNT(*) AS n FROM avatars WHERE user_id = (SELECT id FROM users WHERE email = 'asel@bi.test')")).toBe(1)
    check.close()
  })

  it('руководитель видит команду с результатами и карточками, сотрудник — свои попытки целиком', async () => {
    const manager = await login(fixture.manager.email)
    const { data: { teams } } = await call('/teams', manager) as unknown as { data: { teams: { id: string; inviteCode: string; memberCount: number }[] } }
    expect(teams).toEqual([expect.objectContaining({ inviteCode: fixture.team.inviteCode, memberCount: 6 })])
    const team = (await call(`/teams/${teams[0]!.id}`, manager)).data as unknown as { members: { id: string; email: string; consented: boolean; dynamicResult: DynamicAttempt | null; attemptCount: number }[] }
    expect(team.members.every((member) => member.consented)).toBe(true)
    expect(team.members.filter((member) => member.dynamicResult).length).toBe(5)
    const alexey = team.members.find((member) => member.email === 'alexey@bi.test')!
    const card = (await call(`/teams/${teams[0]!.id}/members/${alexey.id}/card`, manager)).data as unknown as { dynamic: { marks: unknown[]; comments: unknown[]; history: unknown[] } }
    expect(card.dynamic).toMatchObject({ marks: [expect.anything()], comments: [expect.anything()], history: [expect.anything(), expect.anything()] })

    const dinara = await login('dinara@bi.test')
    const { attempts } = (await call('/dynamic/attempts', dinara)).data as unknown as { attempts: DynamicAttempt[] }
    expect(attempts).toHaveLength(2)
    for (const attempt of attempts) expect(Object.keys(attempt.choiceAnswers)).toHaveLength(10)

    const novice = await login('novichok@bi.test')
    expect((await call('/avatar', novice)).data).toEqual({ avatar: null })
    expect((await call('/membership', novice)).data).toEqual({ team: null })
  })
  it('кнопка сброса доступна любому руководителю и не выкидывает нажавшего', async () => {
    const employee = await login('alexey@bi.test')
    expect((await call('/test-accounts/reset', employee, {})).status).toBe(403)
    const other = (await call('/auth/register', '', { name: 'Другой Руководитель', email: 'boss@example.com', password: 'secret12345', role: 'manager', inviteCode: '', consent: false })).cookie
    const reset = await call('/test-accounts/reset', other, {})
    expect(reset.status).toBe(200)
    expect(reset.data).toMatchObject({ password: fixture.password, self: false, team: fixture.team })
    expect((await call('/auth/me', employee)).data.user).toBeNull()
    expect((await call('/auth/me', other)).data.user).toMatchObject({ email: 'boss@example.com' })
    const manager = await login(fixture.manager.email)
    expect((await call('/test-accounts/reset', manager, {})).data).toMatchObject({ self: true })
    expect((await call('/auth/me', manager)).data.user).toMatchObject({ email: fixture.manager.email })
    expect((await call('/teams', manager)).data).toMatchObject({ teams: [{ inviteCode: fixture.team.inviteCode, memberCount: 6 }] })
  })
})
