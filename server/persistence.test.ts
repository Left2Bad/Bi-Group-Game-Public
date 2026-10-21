// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import { resolve, join } from 'node:path'
import { expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { DATA_VERSIONS } from '../src/domain/types'
import { manualSets } from '../tests/fixtures/answer-sets'

it('сохраняет аккаунты, сессии, команды и результаты после перезапуска сервера', async () => {
  const parent = resolve('.tmp')
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'auth-persistence-'))
  const databasePath = join(directory, 'academy.sqlite')
  let server: Server | undefined
  let app: ReturnType<typeof createApp> | undefined
  let base = ''
  async function start() {
    app = createApp({ serveClient: false, databasePath })
    await new Promise<void>((done) => { server = app!.listen(0, '127.0.0.1', () => done()) })
    const address = server!.address()
    if (!address || typeof address === 'string') throw new Error('No port')
    base = `http://127.0.0.1:${address.port}/api`
  }
  async function stop() {
    if (server) { await new Promise<void>((done) => server!.close(() => done())); server = undefined }
    if (app) { app.locals.closeDatabase(); app = undefined }
  }
  async function call(path: string, cookie = '', body?: unknown) {
    return fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  try {
    await start()
    const registration = await call('/auth/register', '', { name: 'Басшы', email: 'manager@example.test', password: 'test-password-2026', role: 'manager' })
    const managerCookie = registration.headers.get('set-cookie')!.split(';')[0]!
    const { team } = await (await call('/teams', managerCookie, { name: 'Постоянная команда' })).json()
    const employee = await call('/auth/register', '', { name: 'Қызметкер', email: 'employee@example.test', password: 'test-password-2026', role: 'employee', inviteCode: team.inviteCode, consent: true })
    const cookie = employee.headers.get('set-cookie')!.split(';')[0]!
    expect((await call('/attempts', cookie, { attemptId: 'persistent-attempt', answers: manualSets.demoA.answers, versions: DATA_VERSIONS })).status).toBe(201)
    await stop()
    await start()
    expect((await (await call('/auth/me', cookie)).json()).user.email).toBe('employee@example.test')
    const { attempts } = await (await call('/attempts', cookie)).json()
    expect(attempts[0].attemptId).toBe('persistent-attempt')
    const details = await (await call(`/teams/${team.id}`, managerCookie)).json()
    expect(details.members[0].result.attemptId).toBe('persistent-attempt')
    expect((await call('/auth/login', '', { email: 'employee@example.test', password: 'test-password-2026' })).status).toBe(200)
  } finally {
    await stop()
    await rm(directory, { recursive: true, force: true })
  }
})
