// @vitest-environment node
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'
import { manualSets } from '../tests/fixtures/answer-sets'
import { DATA_VERSIONS, TRAIT_IDS } from '../src/domain/types'
import { DYNAMIC_METHOD, RUBRIC_VERSION } from '../src/dynamic/domain'
import type { DynamicAttempt } from '../src/dynamic/domain'
import { SKILL_RUBRIC_VERSION } from '../src/dynamic/skills'

const attempt = (id: string, day: number, status: DynamicAttempt['status'] = 'completed'): DynamicAttempt => ({
  id, method: DYNAMIC_METHOD, promptVersion: 'bank-selection-v1', model: 'gpt-6-luna', reasoningEffort: 'high', bankVersion: 'bank-v1', jobRole: 'Прораб',
  createdAt: `2026-10-0${day}T08:00:00.000Z`, completedAt: status === 'completed' ? `2026-10-0${day}T09:00:00.000Z` : null, status,
  choices: [{ id: 'C1', context: 'Контекст', text: `Вопрос ${id}`, primaryTrait: 'confidence', secondaryTrait: 'discipline',
    options: [{ id: 'C1-1', text: 'Вариант', primary: 4, secondary: 1 }] }],
  choiceAnswers: { C1: 'C1-1' }, openQuestions: [{ id: 'O1', text: 'Открытый вопрос', trait: 'confidence' }], openAnswers: { O1: `Ответ ${id}` },
  evaluation: status !== 'completed' ? null : { rubricVersion: RUBRIC_VERSION, promptVersion: 'bank-selection-v1', model: 'gpt-6-luna', reasoningEffort: 'high',
    skillRubricVersion: SKILL_RUBRIC_VERSION,
    skills: [{ skillId: 'work-planning', name: 'Планирование работ', level: 2, percent: 50, evidence: 'Ответ', explanation: 'Описан план.', nextStep: 'Составить график.',
      learningVenue: 'BIU', learningTopic: 'Планирование' }],
    traits: Object.fromEntries(TRAIT_IDS.map((trait) => [trait, { preferencePercent: 60, professionalPercent: 60, behaviorPercent: 60, finalPercent: 60 + day,
      evidence: 'Ответ', strength: 'Сильная сторона', nextStep: 'Шаг', successCriterion: 'Критерий' }])) as never },
})

describe('карточка развития сотрудника: доступ руководителя по HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bi-manager-card-'))
  const databasePath = join(directory, 'card.sqlite')
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

  it('отдаёт новую диагностику, историю без чужих ответов и отметки практик только руководителю команды', async () => {
    const manager = await register('manager', 'card-owner')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Участок' } })).json()
    const dynamicOnly = await register('employee', 'card-dynamic', team.inviteCode)
    const legacyOnly = await register('employee', 'card-legacy', team.inviteCode)
    const noConsent = await register('employee', 'card-no-consent', team.inviteCode)
    const stranger = await register('employee', 'card-stranger')
    const outsider = await register('manager', 'card-outsider')
    direct((db) => {
      for (const [item, saved] of [[attempt('dyn-1', 1), 1], [attempt('dyn-2', 5), 5], [attempt('dyn-draft', 6, 'choices'), 6]] as const)
        db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(dynamicOnly.user.id, item.id, JSON.stringify(item), saved)
      db.prepare('INSERT INTO dynamic_actions VALUES (?, ?, ?, ?)').run(dynamicOnly.user.id, 'dyn-2', 1, Date.parse('2026-10-07T10:00:00.000Z'))
      db.prepare('INSERT INTO dynamic_actions VALUES (?, ?, ?, ?)').run(dynamicOnly.user.id, 'dyn-1', 3, Date.parse('2026-10-03T10:00:00.000Z'))
      db.prepare('UPDATE memberships SET consented_at = NULL WHERE user_id = ?').run(noConsent.user.id)
    })
    await request('/attempts', { cookie: legacyOnly.cookie, body: { attemptId: 'legacy-1', answers: manualSets.demoA.answers, versions: DATA_VERSIONS, completedAt: '2026-10-01T08:00:00.000Z' } })
    const path = (userId: string, teamId = team.id) => `/teams/${teamId}/members/${userId}/card`

    const fresh = await request(path(dynamicOnly.user.id), { cookie: manager.cookie })
    expect(fresh.status).toBe(200)
    const card = await fresh.json()
    expect(card.member).toEqual({ id: dynamicOnly.user.id, name: 'employee card-dynamic' })
    expect(card.legacy).toBeNull()
    expect(card.dynamic.latest.id).toBe('dyn-2')
    expect(card.dynamic.latest.openAnswers).toEqual({ O1: 'Ответ dyn-2' })
    expect(card.dynamic.history.map((item: DynamicAttempt) => item.id)).toEqual(['dyn-1', 'dyn-2'])
    expect(card.dynamic.history[0]).toMatchObject({ choices: [], openAnswers: {}, evaluation: { skillRubricVersion: SKILL_RUBRIC_VERSION } })
    // Отметки — только для практик текущего маршрута.
    expect(card.dynamic.marks).toEqual([{ week: 1, completedAt: '2026-10-07T10:00:00.000Z' }])

    const old = await (await request(path(legacyOnly.user.id), { cookie: manager.cookie })).json()
    expect(old.dynamic).toBeNull()
    expect(old.legacy).toMatchObject({ count: 1, latest: { attemptId: 'legacy-1' }, baseline: { attemptId: 'legacy-1' } })

    const refused = await request(path(noConsent.user.id), { cookie: manager.cookie })
    expect(refused.status).toBe(403)
    expect(JSON.stringify(await refused.json())).not.toMatch(/dynamic|legacy/)
    expect((await request(path(stranger.user.id), { cookie: manager.cookie })).status).toBe(404)
    expect((await request(path(dynamicOnly.user.id), { cookie: outsider.cookie })).status).toBe(404)
    expect((await request(path(dynamicOnly.user.id), { cookie: dynamicOnly.cookie })).status).toBe(403)
    expect((await request(path(dynamicOnly.user.id))).status).toBe(401)
    const { team: otherTeam } = await (await request('/teams', { cookie: outsider.cookie, body: { name: 'Чужая' } })).json()
    expect((await request(path(dynamicOnly.user.id, otherTeam.id), { cookie: outsider.cookie })).status).toBe(404)

    // После выхода из команды доступ к карточке, маршруту и отметкам закрывается.
    await request('/membership', { cookie: dynamicOnly.cookie, method: 'DELETE' })
    expect((await request(path(dynamicOnly.user.id), { cookie: manager.cookie })).status).toBe(404)
    // Чтение карточки не меняет сохранённые оценки.
    direct((db) => {
      const row = db.prepare('SELECT state FROM dynamic_attempts WHERE user_id = ? AND id = ?').get(dynamicOnly.user.id, 'dyn-1') as { state: string }
      expect(JSON.parse(row.state)).toEqual(attempt('dyn-1', 1))
    })
  })

  it('списки команды для руководителя и коллег содержат только оценки, без вопросов, ответов и цитат', async () => {
    const manager = await register('manager', 'list-owner')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Списки' } })).json()
    const member = await register('employee', 'list-member', team.inviteCode)
    const colleague = await register('employee', 'list-colleague', team.inviteCode)
    direct((db) => {
      for (const [item, saved] of [[attempt('list-1', 1), 1], [attempt('list-2', 4), 4]] as const)
        db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(member.user.id, item.id, JSON.stringify(item), saved)
    })
    // Тексты, которые есть только в вопросах, ответах и разборе тестовой попытки.
    const secrets = /Вопрос list|Вариант|Открытый вопрос|Ответ|Сильная сторона|Шаг|Критерий|Описан план|Планирование/
    const scores = { rubricVersion: RUBRIC_VERSION, traits: { confidence: { preferencePercent: 60, professionalPercent: 60, behaviorPercent: 60, finalPercent: 64 } } }

    const list = await (await request(`/teams/${team.id}`, { cookie: manager.cookie })).json()
    const listed = list.members.find((item: { id: string }) => item.id === member.user.id)
    expect(JSON.stringify(list)).not.toMatch(secrets)
    expect(listed.dynamicResult).toMatchObject({ id: 'list-2', jobRole: 'Прораб', choices: [], choiceAnswers: {}, openQuestions: [], openAnswers: {}, evaluation: scores })
    expect(listed.dynamicBaseline).toMatchObject({ id: 'list-1', choices: [], openAnswers: {} })
    expect(listed.dynamicResult.evaluation).not.toHaveProperty('skills')

    const colleagues = await (await request('/membership/team', { cookie: colleague.cookie })).json()
    expect(JSON.stringify(colleagues)).not.toMatch(secrets)
    expect(colleagues.members.find((item: { id: string }) => item.id === member.user.id).dynamicResult).toMatchObject({ id: 'list-2', choiceAnswers: {}, evaluation: scores })

    // Ответы последней попытки по-прежнему доступны руководителю в карточке сотрудника.
    const card = await (await request(`/teams/${team.id}/members/${member.user.id}/card`, { cookie: manager.cookie })).json()
    expect(card.dynamic.latest.openAnswers).toEqual({ O1: 'Ответ list-2' })
  })

  it('комментарии руководителя к неделям: добавляет только руководитель команды, сотрудник читает их в своём маршруте', async () => {
    const manager = await register('manager', 'note-owner')
    const { team } = await (await request('/teams', { cookie: manager.cookie, body: { name: 'Комментарии' } })).json()
    const employee = await register('employee', 'note-employee', team.inviteCode)
    const noConsent = await register('employee', 'note-no-consent', team.inviteCode)
    const outsider = await register('manager', 'note-outsider')
    const second = await register('manager', 'note-second')
    direct((db) => {
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(employee.user.id, 'note-1', JSON.stringify(attempt('note-1', 2)), 2)
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(employee.user.id, 'note-draft', JSON.stringify(attempt('note-draft', 3, 'choices')), 3)
      db.prepare('UPDATE memberships SET consented_at = NULL WHERE user_id = ?').run(noConsent.user.id)
    })
    const base = `/teams/${team.id}/members/${employee.user.id}/route-comments`
    const add = (cookie: string, body: unknown, path = base) => request(path, { cookie, body })
    expect((await add(manager.cookie, { attemptId: 'note-1', week: 2, text: '  Обсудим результат в пятницу  ' })).status).toBe(201)
    const created = await (await add(manager.cookie, { attemptId: 'note-1', week: 2, text: 'Второй комментарий' })).json()
    expect(created.comments.map((item: { text: string; week: number; mine: boolean }) => [item.week, item.text, item.mine])).toEqual([[2, 'Обсудим результат в пятницу', true], [2, 'Второй комментарий', true]])
    for (const body of [{ attemptId: 'note-1', week: 5, text: 'x' }, { attemptId: 'note-1', week: '2', text: 'x' }, { attemptId: 'note-1', week: 1, text: '   ' },
      { attemptId: 'note-1', week: 1, text: 'я'.repeat(1001) }]) expect((await add(manager.cookie, body)).status).toBe(400)
    expect((await add(manager.cookie, { attemptId: 'note-draft', week: 1, text: 'x' })).status).toBe(404)
    expect((await add(manager.cookie, { attemptId: 'нет', week: 1, text: 'x' })).status).toBe(404)
    expect((await add(outsider.cookie, { attemptId: 'note-1', week: 1, text: 'x' })).status).toBe(404)
    expect((await add(employee.cookie, { attemptId: 'note-1', week: 1, text: 'x' })).status).toBe(403)
    expect((await add(manager.cookie, { attemptId: 'note-1', week: 1, text: 'x' }, `/teams/${team.id}/members/${noConsent.user.id}/route-comments`)).status).toBe(403)
    expect((await request(base, { body: { attemptId: 'note-1', week: 1, text: 'x' } })).status).toBe(401)
    const mine = await (await request('/dynamic/attempts/note-1/comments', { cookie: employee.cookie })).json()
    expect(mine.comments).toHaveLength(2)
    expect(mine.comments[0]).toMatchObject({ week: 2, text: 'Обсудим результат в пятницу', managerName: 'manager note-owner' })
    expect(mine.comments[0]).not.toHaveProperty('mine')
    expect((await request('/dynamic/attempts/note-1/comments', { cookie: noConsent.cookie })).status).toBe(404)
    expect((await request('/dynamic/attempts/note-1/comments', { cookie: manager.cookie })).status).toBe(404)
    const card = await (await request(`/teams/${team.id}/members/${employee.user.id}/card`, { cookie: manager.cookie })).json()
    expect(card.dynamic.comments).toHaveLength(2)
    const id = card.dynamic.comments[0].id
    expect((await request(`${base}/${id}`, { cookie: outsider.cookie, method: 'DELETE' })).status).toBe(404)
    expect((await request(`${base}/${id}`, { cookie: second.cookie, method: 'DELETE' })).status).toBe(404)
    expect((await request(`${base}/${id}`, { cookie: employee.cookie, method: 'DELETE' })).status).toBe(403)
    expect((await request(`${base}/${id}`, { cookie: manager.cookie, method: 'DELETE' })).status).toBe(200)
    expect((await (await request('/dynamic/attempts/note-1/comments', { cookie: employee.cookie })).json()).comments).toHaveLength(1)
    for (let index = 0; index < 19; index++) expect((await add(manager.cookie, { attemptId: 'note-1', week: 2, text: `Ещё ${index}` })).status).toBe(201)
    expect((await add(manager.cookie, { attemptId: 'note-1', week: 2, text: 'Лишний' })).status).toBe(409)
    expect((await request('/dynamic/attempts', { cookie: employee.cookie, method: 'DELETE' })).status).toBe(200)
    direct((db) => expect((db.prepare('SELECT COUNT(*) AS count FROM route_comments').get() as { count: number }).count).toBe(0))
  })
})
