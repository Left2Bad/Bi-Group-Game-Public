// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { openDatabase } from './database'
import { manualSets } from '../tests/fixtures/answer-sets'
import { DATA_VERSIONS } from '../src/domain/types'

it('добавляет поля согласия в старую базу и скрывает результаты прежних участников до подтверждения', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bi-academy-consent-'))
  const path = join(directory, 'academy.sqlite')
  // Схема до появления согласия: в memberships только пользователь и команда.
  const legacy = new DatabaseSync(path)
  legacy.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('employee', 'manager')));
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, manager_id TEXT NOT NULL REFERENCES users(id), invite_code TEXT NOT NULL UNIQUE);
    CREATE TABLE memberships (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE);`)
  legacy.close()
  const migrated = openDatabase(path)
  const columns = (migrated.prepare('PRAGMA table_info(memberships)').all() as { name: string }[]).map((column) => column.name)
  expect(columns).toEqual(['user_id', 'team_id', 'consented_at', 'consent_version'])
  migrated.close()
  openDatabase(path).close()

  const app = createApp({ serveClient: false, databasePath: path })
  let server: Server | undefined
  try {
    await new Promise<void>((done) => { server = app.listen(0, '127.0.0.1', () => done()) })
    const address = server!.address()
    if (!address || typeof address === 'string') throw new Error('No port')
    const base = `http://127.0.0.1:${address.port}/api`
    const call = (route: string, cookie = '', body?: unknown, method?: string) => fetch(base + route, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]!
    const manager = cookieOf(await call('/auth/register', '', { name: 'Басшы', email: 'legacy-manager@example.test', password: 'test-password-2026', role: 'manager' }))
    const { team } = await (await call('/teams', manager, { name: 'Старая команда' })).json()
    const employee = cookieOf(await call('/auth/register', '', { name: 'Қызметкер', email: 'legacy-employee@example.test', password: 'test-password-2026', role: 'employee', inviteCode: team.inviteCode, consent: true }))
    expect((await call('/attempts', employee, { attemptId: 'legacy', answers: manualSets.demoA.answers, versions: DATA_VERSIONS })).status).toBe(201)

    // Имитируем участника, вступившего до появления согласия.
    const direct = new DatabaseSync(path)
    direct.exec('UPDATE memberships SET consented_at = NULL, consent_version = NULL')
    direct.close()
    let member = (await (await call(`/teams/${team.id}`, manager)).json()).members[0]
    expect(member).toMatchObject({ consented: false, result: null, baseline: null, attemptCount: 0, avatar: null })
    expect((await (await call('/membership', employee)).json()).team.consented).toBe(false)

    expect((await call('/membership/consent', employee, { consent: true }, 'PUT')).status).toBe(200)
    member = (await (await call(`/teams/${team.id}`, manager)).json()).members[0]
    expect(member.consented).toBe(true)
    expect(member.result.attemptId).toBe('legacy')
    expect((await call('/membership', employee, undefined, 'DELETE')).status).toBe(200)
    expect((await call('/membership/consent', employee, { consent: true }, 'PUT')).status).toBe(404)
  } finally {
    if (server) await new Promise<void>((done) => server!.close(() => done()))
    app.locals.closeDatabase()
    await rm(directory, { recursive: true, force: true })
  }
})
