// @vitest-environment node
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { DATA_VERSIONS } from '../src/domain/types'
import { manualSets } from '../tests/fixtures/answer-sets'

describe('проверка аккаунтов при обходе HTML-формы', () => {
  const app = createApp({ serveClient: false, databasePath: ':memory:' })
  let server: Server
  let base = ''
  beforeAll(async () => {
    await new Promise<void>((done) => { server = app.listen(0, '127.0.0.1', () => done()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No port')
    base = `http://127.0.0.1:${address.port}/api`
  })
  afterAll(async () => { if (server) await new Promise<void>((done) => server.close(() => done())); app.locals.closeDatabase() })
  const valid = { name: 'Сотрудник', email: 'employee@example.test', password: 'test-password-2026', role: 'employee', inviteCode: '' }
  async function request(path: string, body?: unknown, cookie = '', headers: Record<string, string> = {}) {
    return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      'Content-Type': 'application/json', 'X-BI-Academy': '1', Cookie: cookie, ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  async function register(email: string, role = 'employee', password = valid.password) {
    const response = await request('/auth/register', { ...valid, email, role, password })
    expect(response.status).toBe(201)
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, user: (await response.json()).user }
  }

  it.each([
    ['name', ' '], ['name', '123'], ['name', 'x'.repeat(81)], ['name', 'Иван\u0000'], ['name', 12],
    ['email', 'a..b@example.test'], ['email', 'a@example..test'], ['email', 'a@-example.test'], ['email', 42],
    ['password', ' '.repeat(12)], ['password', 'x'.repeat(129)], ['password', null], ['password', 1234567890],
    ['role', 'admin'], ['role', null], ['inviteCode', 123], ['inviteCode', null], ['inviteCode', 'bad'], ['inviteCode', {}],
  ] as const)('API отклоняет %s=%j и указывает поле', async (field, value) => {
    const response = await request('/auth/register', { ...valid, [field]: value })
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.fields[field]).toBeTruthy()
    expect(JSON.stringify(data)).not.toContain(valid.password)
    expect((await (await request('/auth/me')).json()).user).toBeNull()
  })
  it('валидирует JSON, обязательность полей и неизвестный код без частичного создания аккаунта', async () => {
    for (const body of [null, [], {}, { ...valid, inviteCode: 'FFFFFFFFFFFFFFFF' }]) expect((await request('/auth/register', body)).status).toBe(400)
    const malformed = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1' }, body: '{broken' })
    expect(malformed.status).toBe(400)
    const payload = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1' }, body: JSON.stringify({ ...valid, name: 'x'.repeat(70_000) }) })
    expect(payload.status).toBe(413)
    const employee = await register(valid.email)
    expect(employee.user.role).toBe('employee')
  })
  it('не создаёт два аккаунта при одновременной регистрации одного email', async () => {
    const requests = await Promise.all([request('/auth/register', { ...valid, email: 'race@example.test' }), request('/auth/register', { ...valid, email: 'RACE@example.test' })])
    expect(requests.map((response) => response.status).sort()).toEqual([201, 409])
  })
  it('сохраняет пробелы пароля и нормализует только email', async () => {
    await register('spaces@example.test', 'employee', '  test-password-2026  ')
    expect((await request('/auth/login', { email: ' SPACES@EXAMPLE.TEST ', password: '  test-password-2026  ' })).status).toBe(200)
    expect((await request('/auth/login', { email: 'spaces@example.test', password: 'test-password-2026' })).status).toBe(401)
    for (const body of [{}, { email: valid.email, password: null }, { email: 'bad', password: valid.password }]) expect((await request('/auth/login', body)).status).toBe(400)
  })
  it('выход из устаревшей вкладки не отзывает сессию другого аккаунта', async () => {
    const first = await register('tab-first@example.test')
    const second = await register('tab-second@example.test')
    const logout = await request('/auth/logout', {}, second.cookie, { 'X-BI-User': first.user.id })
    expect(logout.status).toBe(401)
    expect(logout.headers.get('set-cookie')).toBeNull()
    expect((await (await request('/auth/me', undefined, second.cookie)).json()).user.id).toBe(second.user.id)
    expect((await request('/auth/logout', {}, second.cookie, { 'X-BI-User': second.user.id })).status).toBe(200)
    expect((await (await request('/auth/me', undefined, second.cookie)).json()).user).toBeNull()
    expect((await request('/auth/logout', {})).status).toBe(200)
    expect((await request('/attempts', undefined, 'bi_academy_session=forged-token')).status).toBe(401)
  })
  it('не принимает подмену роли в теле запроса входа', async () => {
    await register('login-role@example.test')
    const response = await request('/auth/login', { email: 'login-role@example.test', password: valid.password, role: 'manager' })
    expect(response.status).toBe(200)
    expect((await response.json()).user.role).toBe('employee')
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!
    expect((await request('/teams', undefined, cookie)).status).toBe(403)
  })
  it('валидирует создание команды и вступление при прямом запросе', async () => {
    const manager = await register('validation-manager@example.test', 'manager')
    for (const name of [' ', 'A', 'x'.repeat(81), 'Бригада\u0000', 123]) expect((await request('/teams', { name }, manager.cookie)).status).toBe(400)
    const employee = await register('validation-employee@example.test')
    for (const inviteCode of ['', '123', 123, {}, null]) expect((await request('/membership', { inviteCode }, employee.cookie)).status).toBe(400)
    expect((await request('/membership', { inviteCode: 'FFFFFFFFFFFFFFFF' }, employee.cookie)).status).toBe(404)
  })
  it('повторная отправка попытки не обходит проверку ответов и даты', async () => {
    const employee = await register('validation-attempt@example.test')
    const submission = { attemptId: 'retry-attempt', answers: manualSets.demoA.answers, versions: DATA_VERSIONS }
    expect((await request('/attempts', submission, employee.cookie)).status).toBe(201)
    expect((await request('/attempts', submission, employee.cookie)).status).toBe(200)
    expect((await request('/attempts', { ...submission, answers: {} }, employee.cookie)).status).toBe(400)
    expect((await request('/attempts', { ...submission, completedAt: 123 }, employee.cookie)).status).toBe(400)
    expect((await request('/attempts', { ...submission, completedAt: 'bad' }, employee.cookie)).status).toBe(400)
    expect((await request('/attempts', { ...submission, answers: manualSets.demoB.answers }, employee.cookie)).status).toBe(409)
    const { attempts } = await (await request('/attempts', undefined, employee.cookie)).json()
    expect(attempts).toHaveLength(1)
    expect(attempts[0].answers).toEqual(submission.answers)
  })
  it('ограничивает запросы регистрации и сообщает время повтора', async () => {
    let response: Response | undefined
    for (let index = 0; index < 101; index++) {
      response = await request('/auth/register', {})
      if (response.status === 429) break
    }
    expect(response?.status).toBe(429)
    expect(Number(response?.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await request('/auth/register', {}, '', { 'X-Forwarded-For': '1.2.3.4' })).status).toBe(429)
  })
})
