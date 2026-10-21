// @vitest-environment node
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { manualSets } from '../tests/fixtures/answer-sets'
import { DATA_VERSIONS } from '../src/domain/types'

describe('аккаунты, права и реальные команды по HTTP', () => {
  let server: Server
  let base: string
  const app = createApp({ serveClient: false, databasePath: ':memory:' })
  beforeAll(async () => {
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No TCP port')
    base = `http://127.0.0.1:${address.port}/api`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    app.locals.closeDatabase()
  })
  async function request(path: string, options: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
    return fetch(base + path, { method: options.method ?? (options.body ? 'POST' : 'GET'), headers: {
      'Content-Type': 'application/json', 'X-BI-Academy': '1', ...(options.cookie ? { Cookie: options.cookie } : {}), ...options.headers,
    }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) })
  }
  async function register(role: 'employee' | 'manager', suffix: string, inviteCode = '') {
    const response = await request('/auth/register', { body: { name: `${role} ${suffix}`, email: `${suffix}@example.test`, password: 'test-password-2026', role, inviteCode, consent: Boolean(inviteCode) } })
    expect(response.status).toBe(201)
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!
    const { user } = await response.json()
    return { cookie, user }
  }
  it('валидирует регистрацию, уникальность email и не раскрывает хеш пароля', async () => {
    expect((await request('/auth/register', { body: { name: 'A', email: 'bad', password: 'short', role: 'admin' } })).status).toBe(400)
    const { cookie, user } = await register('employee', 'case')
    expect(user.role).toBe('employee')
    expect(Object.keys(user).sort()).toEqual(['email', 'id', 'name', 'role'])
    const response = await request('/auth/me', { cookie })
    expect((await response.json()).user).toEqual(user)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await request('/auth/register', { body: { name: 'Другое имя', email: 'CASE@EXAMPLE.TEST', password: 'test-password-2026', role: 'manager' } })).status).toBe(409)
  })
  it('проверяет пароль, сохраняет сессию и отзывает cookie при выходе', async () => {
    const employee = await register('employee', 'login')
    expect((await request('/auth/login', { body: { email: 'login@example.test', password: 'wrong' } })).status).toBe(401)
    const login = await request('/auth/login', { body: { email: 'LOGIN@example.test', password: 'test-password-2026' } })
    expect(login.status).toBe(200)
    expect(login.headers.get('set-cookie')).toContain('HttpOnly')
    expect(login.headers.get('set-cookie')).toContain('SameSite=Lax')
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    expect((await request('/attempts', { cookie })).status).toBe(200)
    await request('/auth/logout', { cookie, body: {} })
    expect((await request('/attempts', { cookie })).status).toBe(401)
    expect((await request('/auth/me', { cookie: employee.cookie })).status).toBe(200)
  })
  it('сбрасывает прогресс только после успешного входа и позволяет снова вступить в команду', async () => {
    const manager = await register('manager', 'reset-manager')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Команда до сброса' } })).json()
    const employee = await register('employee', 'reset-employee')
    expect((await request('/membership', { cookie: employee.cookie, body: { inviteCode: team.inviteCode, consent: true } })).status).toBe(201)
    const avatar = { universe: 'Животные', gender: 'Нейтральный', palette: 'Яркий', role: 'Стратег', action: 'Анализирую', motivation: 'Результат', power: 'Точность', animal: 'Лис', skin: '#edbe94' }
    expect((await request('/avatar', { cookie: employee.cookie, method: 'PUT', body: { avatar } })).status).toBe(200)
    expect((await request('/attempts', { cookie: employee.cookie, body: { attemptId: 'before-reset', answers: manualSets.demoA.answers, versions: DATA_VERSIONS } })).status).toBe(201)
    expect((await request('/auth/login', { body: { email: employee.user.email, password: 'wrong', resetProgress: true } })).status).toBe(401)
    expect((await (await request('/attempts', { cookie: employee.cookie })).json()).total).toBe(1)
    expect((await request('/auth/login', { body: { email: employee.user.email, password: 'test-password-2026', resetProgress: 'true' } })).status).toBe(400)
    const login = await request('/auth/login', { body: { email: employee.user.email, password: 'test-password-2026', resetProgress: true } })
    expect(login.status).toBe(200)
    const resetAt = (await login.clone().json()).resetAt
    expect(resetAt).toBeGreaterThan(0)
    const freshCookie = login.headers.get('set-cookie')!.split(';')[0]!
    expect((await request('/attempts', { cookie: employee.cookie })).status).toBe(401)
    expect((await (await request('/attempts', { cookie: freshCookie })).json()).total).toBe(0)
    expect((await (await request('/avatar', { cookie: freshCookie })).json()).avatar).toBeNull()
    expect((await (await request('/membership', { cookie: freshCookie })).json()).team).toBeNull()
    expect((await request('/membership', { cookie: freshCookie, body: { inviteCode: team.inviteCode, consent: true } })).status).toBe(201)
    expect((await (await request('/auth/me', { cookie: freshCookie })).json()).resetAt).toBe(resetAt)
    const managerLogin = await request('/auth/login', { body: { email: manager.user.email, password: 'test-password-2026', resetProgress: true } })
    expect(managerLogin.status).toBe(200)
    const managerCookie = managerLogin.headers.get('set-cookie')!.split(';')[0]!
    expect((await (await request('/teams', { cookie: managerCookie })).json()).teams).toEqual([])
    expect((await (await request('/membership', { cookie: freshCookie })).json()).team).toBeNull()
  })
  it('сбрасывает аккаунт из профиля без повторного ввода пароля и выдаёт новую сессию', async () => {
    const employee = await register('employee', 'profile-reset')
    expect((await request('/auth/reset', { body: {} })).status).toBe(401)
    expect((await request('/attempts', { cookie: employee.cookie, body: { attemptId: 'before-profile-reset', answers: manualSets.demoA.answers, versions: DATA_VERSIONS } })).status).toBe(201)
    const reset = await request('/auth/reset', { cookie: employee.cookie, body: {} })
    expect(reset.status).toBe(200)
    const data = await reset.clone().json()
    expect(data.user.id).toBe(employee.user.id)
    expect(data.resetAt).toBeGreaterThan(0)
    const freshCookie = reset.headers.get('set-cookie')!.split(';')[0]!
    expect((await request('/attempts', { cookie: employee.cookie })).status).toBe(401)
    expect((await (await request('/attempts', { cookie: freshCookie })).json()).total).toBe(0)
  })
  it('защищает серверные операции по роли, Origin и текущему аккаунту', async () => {
    const employee = await register('employee', 'permissions-employee')
    const manager = await register('manager', 'permissions-manager')
    expect((await request('/teams')).status).toBe(401)
    expect((await request('/teams', { cookie: employee.cookie, body: { name: 'Чужая команда' } })).status).toBe(403)
    expect((await request('/attempts', { cookie: manager.cookie })).status).toBe(403)
    expect((await request('/membership', { cookie: manager.cookie, body: { inviteCode: 'bad' } })).status).toBe(403)
    expect((await request('/attempts', { cookie: employee.cookie, headers: { 'X-BI-User': manager.user.id } })).status).toBe(401)
    expect((await request('/teams', { cookie: manager.cookie, body: { name: 'Test' }, headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    const withoutHeader = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(withoutHeader.status).toBe(403)
  })
  it('создаёт команду, присоединяет по коду и показывает только подчинённых владельцу', async () => {
    const manager = await register('manager', 'owner')
    const outsider = await register('manager', 'outsider')
    const create = await request('/teams', { cookie: manager.cookie, body: { name: 'Участок № 3' } })
    const { team } = await create.json()
    expect(create.status).toBe(201)
    const employee = await register('employee', 'subordinate', team.inviteCode.toLowerCase())
    const membership = await (await request('/membership', { cookie: employee.cookie })).json()
    expect(membership.team.name).toBe('Участок № 3')
    let detail = await (await request(`/teams/${team.id}`, { cookie: manager.cookie })).json()
    expect(detail.members).toHaveLength(1)
    expect(detail.members[0].result).toBeNull()
    const submission = { attemptId: 'attempt-1', answers: manualSets.demoA.answers, versions: DATA_VERSIONS, traits: { confidence: 100 } }
    const save = await request('/attempts', { cookie: employee.cookie, body: submission })
    expect(save.status).toBe(201)
    const { result } = await save.json()
    expect(result.traits.confidence.percent).toBe(57)
    expect((await request('/attempts', { cookie: employee.cookie, body: submission })).status).toBe(200)
    expect((await (await request('/attempts', { cookie: employee.cookie })).json()).attempts).toHaveLength(1)
    detail = await (await request(`/teams/${team.id}`, { cookie: manager.cookie })).json()
    expect(detail.members[0].result).toEqual(result)
    expect(detail.members[0]).toMatchObject({ consented: true, attemptCount: 1, avatar: null })
    expect(detail.members[0].baseline).toEqual(result)
    expect((await request(`/teams/${team.id}`, { cookie: outsider.cookie })).status).toBe(404)
    expect((await request(`/teams/${team.id}/members/${employee.user.id}`, { cookie: outsider.cookie, method: 'DELETE' })).status).toBe(404)
    expect((await request(`/teams/${team.id}`, { cookie: employee.cookie })).status).toBe(403)
    expect((await request('/attempts', { cookie: employee.cookie, body: { ...submission, attemptId: 'bad', answers: {} } })).status).toBe(400)
    expect((await request('/attempts', { cookie: employee.cookie, body: { ...submission, attemptId: 'old', versions: {} } })).status).toBe(409)
    await request('/membership', { cookie: employee.cookie, method: 'DELETE' })
    detail = await (await request(`/teams/${team.id}`, { cookie: manager.cookie })).json()
    expect(detail.members).toHaveLength(0)
    expect((await (await request('/attempts', { cookie: employee.cookie })).json()).attempts).toHaveLength(1)
    await request('/membership', { cookie: employee.cookie, body: { inviteCode: team.inviteCode, consent: true } })
    await request(`/teams/${team.id}/members/${employee.user.id}`, { cookie: manager.cookie, method: 'DELETE' })
    expect((await (await request('/membership', { cookie: employee.cookie })).json()).team).toBeNull()
    await request('/attempts', { cookie: employee.cookie, method: 'DELETE' })
    expect((await (await request('/attempts', { cookie: employee.cookie })).json()).attempts).toEqual([])
  })
  it('не создаёт аккаунт с ошибочным приглашением и не допускает две команды одновременно', async () => {
    expect((await request('/auth/register', { body: { name: 'Новый сотрудник', email: 'invalid-invite@example.test', password: 'test-password-2026', role: 'employee', inviteCode: 'UNKNOWN' } })).status).toBe(400)
    const manager = await register('manager', 'two-teams')
    const first = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Первая' } })).json()
    const second = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Вторая' } })).json()
    const employee = await register('employee', 'two-memberships')
    expect((await request('/membership', { cookie: employee.cookie, body: { inviteCode: 'bad' } })).status).toBe(400)
    expect((await request('/membership', { cookie: employee.cookie, body: { inviteCode: first.team.inviteCode, consent: true } })).status).toBe(201)
    expect((await request('/membership', { cookie: employee.cookie, body: { inviteCode: second.team.inviteCode, consent: true } })).status).toBe(409)
  })
  it('без явного согласия не вступает в команду и не раскрывает результаты руководителю', async () => {
    const manager = await register('manager', 'consent-manager')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Согласие' } })).json()
    const withoutConsent = await request('/auth/register', { body: { name: 'Без согласия', email: 'no-consent@example.test', password: 'test-password-2026', role: 'employee', inviteCode: team.inviteCode } })
    expect(withoutConsent.status).toBe(400)
    expect((await withoutConsent.json()).fields).toEqual({ consent: expect.any(String) })
    expect((await request('/auth/login', { body: { email: 'no-consent@example.test', password: 'test-password-2026' } })).status).toBe(401)
    const employee = await register('employee', 'consent-employee')
    for (const consent of [undefined, false, 'true', 1]) {
      expect((await request('/membership', { cookie: employee.cookie, body: { inviteCode: team.inviteCode, consent } })).status).toBe(400)
    }
    expect((await (await request('/membership', { cookie: employee.cookie })).json()).team).toBeNull()
    expect((await request('/membership', { cookie: employee.cookie, body: { inviteCode: team.inviteCode, consent: true } })).status).toBe(201)
    expect((await (await request('/membership', { cookie: employee.cookie })).json()).team).toMatchObject({ name: 'Согласие', consented: true })
    expect((await request('/membership/consent', { cookie: manager.cookie, method: 'PUT', body: { consent: true } })).status).toBe(403)
    expect((await request('/membership/consent', { cookie: employee.cookie, method: 'PUT', body: { consent: 'yes' } })).status).toBe(400)
  })
  it('показывает сотруднику бригаду без почты и только после вступления', async () => {
    const manager = await register('manager', 'brigade-manager')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Бригада' } })).json()
    const employee = await register('employee', 'brigade-employee')
    expect((await request('/membership/team', { cookie: employee.cookie })).status).toBe(404)
    expect((await request('/membership/team', { cookie: manager.cookie })).status).toBe(403)
    await request('/membership', { cookie: employee.cookie, body: { inviteCode: team.inviteCode, consent: true } })
    const { members } = await (await request('/membership/team', { cookie: employee.cookie })).json()
    expect(members).toHaveLength(1)
    expect(members[0]).not.toHaveProperty('email')
  })
  it('показывает руководителю аватар, входную и последнюю попытки для карточки развития', async () => {
    const manager = await register('manager', 'card-manager')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Карточка' } })).json()
    const employee = await register('employee', 'card-employee', team.inviteCode)
    const avatar = { universe: 'Животные', gender: 'Нейтральный', palette: 'Яркий', role: 'Стратег', action: 'Анализирую', motivation: 'Результат', power: 'Точность', animal: 'Лис', skin: '#edbe94' }
    expect((await request('/avatar', { cookie: employee.cookie, method: 'PUT', body: { avatar: { ...avatar, palette: 'Розовый' } } })).status).toBe(400)
    expect((await request('/avatar', { cookie: manager.cookie, method: 'PUT', body: { avatar } })).status).toBe(200)
    const saved = await request('/avatar', { cookie: employee.cookie, method: 'PUT', body: { avatar: { ...avatar, extra: '<script>' } } })
    expect(saved.status).toBe(200)
    expect((await saved.json()).avatar).toEqual(avatar)
    expect((await (await request('/avatar', { cookie: employee.cookie })).json()).avatar).toEqual(avatar)
    await request('/attempts', { cookie: employee.cookie, body: { attemptId: 'card-1', answers: manualSets.demoA.answers, versions: DATA_VERSIONS, completedAt: '2026-10-01T08:00:00.000Z' } })
    await request('/attempts', { cookie: employee.cookie, body: { attemptId: 'card-2', answers: manualSets.demoB.answers, versions: DATA_VERSIONS, completedAt: '2026-10-18T08:00:00.000Z' } })
    const { members } = await (await request(`/teams/${team.id}`, { cookie: manager.cookie })).json()
    expect(members[0]).toMatchObject({ consented: true, attemptCount: 2, avatar })
    expect(members[0].baseline.attemptId).toBe('card-1')
    expect(members[0].result.attemptId).toBe('card-2')
    expect(members[0].result.traits.engagement.percent - members[0].baseline.traits.engagement.percent).toBe(12)
    expect((await request('/avatar', { cookie: employee.cookie, method: 'PUT', body: { avatar: null } })).status).toBe(200)
    expect((await (await request(`/teams/${team.id}`, { cookie: manager.cookie })).json()).members[0].avatar).toBeNull()
  })
})
