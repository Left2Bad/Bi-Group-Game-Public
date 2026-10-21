// @vitest-environment node
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { TRAIT_IDS } from '../src/domain/types'
import { DYNAMIC_METHOD, RUBRIC_VERSION } from '../src/dynamic/domain'
import type { DynamicAttempt } from '../src/dynamic/domain'

const attempt = (id: string, percent: number): DynamicAttempt => ({
  id, method: DYNAMIC_METHOD, promptVersion: 'bank-selection-v1', model: 'gpt-6-luna', jobRole: 'Прораб',
  createdAt: '2026-10-01T08:00:00.000Z', completedAt: '2026-10-01T09:00:00.000Z', status: 'completed',
  choices: [], choiceAnswers: {}, openQuestions: [], openAnswers: {},
  evaluation: { rubricVersion: RUBRIC_VERSION, model: 'gpt-6-luna', traits: Object.fromEntries(TRAIT_IDS.map((trait) => [trait, { preferencePercent: percent, professionalPercent: percent,
    finalPercent: percent, evidence: 'Ответ', strength: 'Сильная', nextStep: 'Шаг', successCriterion: 'Критерий' }])) as never },
})

describe('беседы руководителя с сотрудниками по HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bi-meetings-'))
  const databasePath = join(directory, 'meetings.sqlite')
  const app = createApp({ serveClient: false, databasePath })
  let server: Server
  let base = ''
  beforeAll(async () => {
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No TCP port')
    base = `http://127.0.0.1:${address.port}/api`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    app.locals.closeDatabase()
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(databasePath + suffix)) unlinkSync(databasePath + suffix)
    rmdirSync(directory)
  })
  async function request(path: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
    return fetch(base + path, { method: options.method ?? (options.body ? 'POST' : 'GET'), headers: {
      'Content-Type': 'application/json', 'X-BI-Academy': '1', ...(options.cookie ? { Cookie: options.cookie } : {}),
    }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) })
  }
  async function register(role: 'employee' | 'manager', suffix: string, inviteCode = '') {
    const response = await request('/auth/register', { body: { name: `${role} ${suffix}`, email: `${suffix}@example.test`, password: 'test-password-2026', role, inviteCode, consent: Boolean(inviteCode) } })
    expect(response.status).toBe(201)
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, user: (await response.json()).user as { id: string } }
  }
  const direct = (work: (db: DatabaseSync) => void) => { const db = new DatabaseSync(databasePath); try { work(db) } finally { db.close() } }
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

  it('приглашение, ответ сотрудника, уведомления и права доступа', async () => {
    const manager = await register('manager', 'meet-owner')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Беседы' } })).json()
    const low = await register('employee', 'meet-low', team.inviteCode)
    const high = await register('employee', 'meet-high', team.inviteCode)
    const noConsent = await register('employee', 'meet-no-consent', team.inviteCode)
    const noResult = await register('employee', 'meet-none', team.inviteCode)
    const outsider = await register('manager', 'meet-outsider')
    direct((db) => {
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(low.user.id, 'low-1', JSON.stringify(attempt('low-1', 40)), 1)
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(high.user.id, 'high-1', JSON.stringify(attempt('high-1', 80)), 1)
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(noConsent.user.id, 'nc-1', JSON.stringify(attempt('nc-1', 40)), 1)
      db.prepare('UPDATE memberships SET consented_at = NULL WHERE user_id = ?').run(noConsent.user.id)
    })
    const path = (userId: string, teamId = team.id) => `/teams/${teamId}/members/${userId}/meetings`
    const invite = (userId: string, body: unknown, cookie = manager.cookie) => request(path(userId), { cookie, body })

    // Ограничения: только ниже нормы, будущая дата, длина сообщения, права.
    expect((await invite(high.user.id, { at: future(3) })).status).toBe(409)
    expect((await invite(noResult.user.id, { at: future(3) })).status).toBe(409)
    expect((await invite(low.user.id, { at: '2020-01-01T10:00:00.000Z' })).status).toBe(400)
    expect((await invite(low.user.id, { at: 'не дата' })).status).toBe(400)
    expect((await invite(low.user.id, { at: future(400) })).status).toBe(400)
    expect((await invite(low.user.id, { at: future(3), message: 'я'.repeat(501) })).status).toBe(400)
    expect((await invite(noConsent.user.id, { at: future(3) })).status).toBe(403)
    expect((await invite(low.user.id, { at: future(3) }, outsider.cookie)).status).toBe(404)
    expect((await invite(low.user.id, { at: future(3) }, low.cookie)).status).toBe(403)
    expect((await request(path(low.user.id), { body: { at: future(3) } })).status).toBe(401)

    const created = await invite(low.user.id, { at: future(3), message: '  Поговорим о дисциплине  ' })
    expect(created.status).toBe(201)
    const { meetings, unread } = await created.json()
    expect(unread).toBe(0)
    expect(meetings).toHaveLength(1)
    expect(meetings[0]).toMatchObject({ employeeName: 'employee meet-low', managerName: 'manager meet-owner', message: 'Поговорим о дисциплине', status: 'pending', unseen: false })
    const id = meetings[0].id as string

    // Сотрудник видит приглашение как требующее внимания; остальные — нет.
    const mine = await (await request('/meetings', { cookie: low.cookie })).json()
    expect(mine.unread).toBe(1)
    expect(mine.meetings[0]).toMatchObject({ id, status: 'pending', unseen: true })
    expect((await (await request('/meetings', { cookie: high.cookie })).json()).meetings).toEqual([])
    expect((await request('/meetings', { cookie: manager.cookie })).status).toBe(403)
    expect((await request('/manager/meetings', { cookie: low.cookie })).status).toBe(403)

    // Ответить может только адресат.
    expect((await request(`/meetings/${id}`, { cookie: high.cookie, method: 'PUT', body: { response: 'accepted' } })).status).toBe(404)
    expect((await request(`/meetings/${id}`, { cookie: low.cookie, method: 'PUT', body: { response: 'maybe' } })).status).toBe(400)
    const accepted = await request(`/meetings/${id}`, { cookie: low.cookie, method: 'PUT', body: { response: 'accepted' } })
    expect(accepted.status).toBe(200)
    expect((await accepted.json()).unread).toBe(0)
    expect((await request(`/meetings/${id}`, { cookie: low.cookie, method: 'PUT', body: { response: 'declined' } })).status).toBe(409)

    // Руководитель получает уведомление о принятии, только своей команды.
    const notice = await (await request('/manager/meetings', { cookie: manager.cookie })).json()
    expect(notice.unread).toBe(1)
    expect(notice.meetings[0]).toMatchObject({ id, status: 'accepted', unseen: true })
    expect((await (await request('/manager/meetings', { cookie: outsider.cookie })).json()).meetings).toEqual([])
    expect((await (await request('/manager/meetings/seen', { cookie: manager.cookie, body: {} })).json()).unread).toBe(0)

    // Отказ и отмена.
    const second = await (await invite(low.user.id, { at: future(5) })).json()
    const secondId = second.meetings.find((item: { id: string }) => item.id !== id).id as string
    await request(`/meetings/${secondId}`, { cookie: low.cookie, method: 'PUT', body: { response: 'declined' } })
    expect((await (await request('/manager/meetings', { cookie: manager.cookie })).json()).meetings.find((item: { id: string }) => item.id === secondId)).toMatchObject({ status: 'declined', unseen: true })
    expect((await request(`/manager/meetings/${id}/cancel`, { cookie: outsider.cookie, body: {} })).status).toBe(404)
    expect((await request(`/manager/meetings/${id}/cancel`, { cookie: manager.cookie, body: {} })).status).toBe(200)
    const cancelled = await (await request('/meetings', { cookie: low.cookie })).json()
    expect(cancelled.meetings.find((item: { id: string }) => item.id === id)).toMatchObject({ status: 'cancelled', unseen: true })
    expect((await (await request('/meetings/seen', { cookie: low.cookie, body: {} })).json()).unread).toBe(0)
    expect((await request(`/manager/meetings/${id}/cancel`, { cookie: manager.cookie, body: {} })).status).toBe(404)

    // Просроченное приглашение принять нельзя; после выхода из команды беседы не видны.
    direct((db) => db.prepare("INSERT INTO meetings (id, team_id, manager_id, employee_id, scheduled_at, message, status, created_at, manager_seen, employee_seen) VALUES ('old', ?, ?, ?, ?, '', 'pending', ?, 1, 0)")
      .run(team.id, manager.user.id, low.user.id, Date.now() - 1000, Date.now()))
    expect((await request('/meetings/old', { cookie: low.cookie, method: 'PUT', body: { response: 'accepted' } })).status).toBe(409)
    await request('/membership', { cookie: low.cookie, method: 'DELETE' })
    expect((await (await request('/meetings', { cookie: low.cookie })).json()).meetings).toEqual([])
    expect((await (await request('/manager/meetings', { cookie: manager.cookie })).json()).meetings).toEqual([])
  })
  it('ограничивает число неотвеченных приглашений одному сотруднику', async () => {
    const manager = await register('manager', 'meet-limit-owner')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Лимит' } })).json()
    const employee = await register('employee', 'meet-limit-employee', team.inviteCode)
    direct((db) => db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(employee.user.id, 'lim-1', JSON.stringify(attempt('lim-1', 30)), 1))
    const path = `/teams/${team.id}/members/${employee.user.id}/meetings`
    for (let index = 0; index < 5; index++) expect((await request(path, { cookie: manager.cookie, body: { at: future(index + 1) } })).status).toBe(201)
    expect((await request(path, { cookie: manager.cookie, body: { at: future(9) } })).status).toBe(409)
  })
})
