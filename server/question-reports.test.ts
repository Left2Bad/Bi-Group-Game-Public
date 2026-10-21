// @vitest-environment node
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { DYNAMIC_METHOD } from '../src/dynamic/domain'
import type { DynamicAttempt } from '../src/dynamic/domain'

const option = (id: string, text: string) => ({ id, text, primary: 2, secondary: 2 })
const attempt = (id: string): DynamicAttempt => ({
  id, method: DYNAMIC_METHOD, promptVersion: 'bank-selection-v1', model: 'gpt-6-luna', jobRole: 'Прораб',
  createdAt: '2026-10-01T08:00:00.000Z', completedAt: null, status: 'choices', evaluation: null,
  choices: [{ id: 'q-rain', context: 'После дождя репер мог сместиться.', text: 'Какой подход вам ближе?', primaryTrait: 'discipline', secondaryTrait: 'criticalThinking',
    options: [option('a', 'Сверю репер'), option('b', 'Проверю сеть'), option('c', 'Проведу замыкание'), option('d', 'Выведу из применения')] }],
  choiceAnswers: { 'q-rain': 'b' }, openQuestions: [{ id: 'open-1', text: 'Как вы поступите?', trait: 'engagement' }], openAnswers: {},
})

describe('«Некорректный вопрос» по HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bi-reports-'))
  const databasePath = join(directory, 'reports.sqlite')
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
  const direct = <T>(work: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(databasePath); try { return work(db) } finally { db.close() } }
  const team = async (cookie: string, name: string) => (await (await request('/teams', { cookie, body: { name } })).json()).team as { id: string; inviteCode: string }
  const inbox = async (cookie: string) => (await request('/manager/question-reports', { cookie })).json() as Promise<{ reports: { subject: string; employeeName: string; teamName: string; questionId: string; question: { kind: string; context?: string; text: string; options?: string[] }; unseen: boolean }[]; unread: number }>
  const report = (cookie: string, questionId: string, attemptId = 'att-1') => request('/question-reports', { cookie, body: { attemptId, questionId } })

  it('доставка руководителю текущей бригады, без повторной отправки новому и с ожиданием для сотрудника без бригады', async () => {
    const first = await register('manager', 'rep-first')
    const second = await register('manager', 'rep-second')
    const brigadeA = await team(first.cookie, 'Бригада А')
    const brigadeB = await team(second.cookie, 'Бригада Б')
    const employee = await register('employee', 'rep-worker', brigadeA.inviteCode)
    const loner = await register('employee', 'rep-loner')
    direct((db) => {
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(employee.user.id, 'att-1', JSON.stringify(attempt('att-1')), 1)
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(loner.user.id, 'att-1', JSON.stringify(attempt('att-1')), 1)
    })

    // Сотрудник в бригаде А: сообщение сразу у её руководителя, с темой, вопросом и отправителем.
    const sent = await report(employee.cookie, 'q-rain')
    expect(sent.status).toBe(201)
    expect((await sent.json()).questionIds).toEqual(['q-rain'])
    const a = await inbox(first.cookie)
    expect(a.unread).toBe(1)
    expect(a.reports[0]).toMatchObject({ subject: 'Некорректный вопрос', employeeName: 'employee rep-worker', teamName: 'Бригада А', questionId: 'q-rain',
      question: { kind: 'choice', context: 'После дождя репер мог сместиться.', text: 'Какой подход вам ближе?', options: ['Сверю репер', 'Проверю сеть', 'Проведу замыкание', 'Выведу из применения'] } })
    // Повторная отметка не создаёт второе сообщение; ответ на вопрос остаётся в попытке и учитывается.
    const again = await report(employee.cookie, 'q-rain')
    expect(again.status).toBe(200)
    expect((await again.json()).alreadyReported).toBe(true)
    expect((await inbox(first.cookie)).reports).toHaveLength(1)
    expect(direct((db) => JSON.parse((db.prepare('SELECT state FROM dynamic_attempts WHERE user_id = ?').get(employee.user.id) as { state: string }).state).choiceAnswers)).toEqual({ 'q-rain': 'b' })

    // Переход в бригаду Б: уже доставленное сообщение новому руководителю не уходит, у прежнего остаётся.
    expect((await request('/membership', { method: 'DELETE', cookie: employee.cookie })).status).toBe(200)
    expect((await request('/membership', { cookie: employee.cookie, body: { inviteCode: brigadeB.inviteCode, consent: true } })).status).toBe(201)
    expect((await inbox(second.cookie)).reports).toHaveLength(0)
    expect((await inbox(first.cookie)).reports).toHaveLength(1)
    // А новый вопрос, отмеченный уже в бригаде Б, получает её руководитель.
    expect((await report(employee.cookie, 'open-1')).status).toBe(201)
    expect((await inbox(second.cookie)).reports.map((item) => item.question)).toEqual([{ kind: 'open', text: 'Как вы поступите?' }])

    // Сотрудник без бригады: сообщение ждёт и приходит руководителю, когда сотрудник вступит в бригаду.
    expect((await report(loner.cookie, 'q-rain')).status).toBe(201)
    expect((await inbox(first.cookie)).reports).toHaveLength(1)
    expect((await inbox(second.cookie)).reports).toHaveLength(1)
    expect((await request('/membership', { cookie: loner.cookie, body: { inviteCode: brigadeA.inviteCode, consent: true } })).status).toBe(201)
    const withLoner = await inbox(first.cookie)
    expect(withLoner.reports.map((item) => item.employeeName)).toEqual(['employee rep-loner', 'employee rep-worker'])

    // Просмотр сбрасывает счётчик; чужой вопрос и чужая попытка не принимаются; сотрудник не читает ящик руководителя.
    expect((await (await request('/manager/question-reports/seen', { cookie: first.cookie, body: {} })).json()).unread).toBe(0)
    expect((await report(employee.cookie, 'no-such-question')).status).toBe(404)
    expect((await report(employee.cookie, 'q-rain', 'other-attempt')).status).toBe(404)
    expect((await request('/manager/question-reports', { cookie: employee.cookie })).status).toBe(403)
    expect((await (await request('/question-reports', { cookie: employee.cookie })).json()).questionIds.sort()).toEqual(['open-1', 'q-rain'])
  })
})
