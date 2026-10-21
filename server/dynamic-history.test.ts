// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'
import type { DynamicAttempt } from '../src/dynamic/domain'
import { TRAIT_IDS } from '../src/domain/types'
import { configuredModel, configuredReasoningEffort } from './dynamic-ai'
import { PROMPT_VERSION } from '../src/dynamic/domain'
import { DEFAULT_AVATAR } from '../src/domain/avatar'
import { initialBank } from './question-bank'

describe('миграция и полная история динамических попыток', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bi-dynamic-history-'))
  const databasePath = join(directory, 'history.sqlite')
  const token = 'history-test-session'
  const first: DynamicAttempt = { id: 'history-0', method: 'bi-academy-dynamic-v1', promptVersion: 'dynamic-questions-v1', model: 'old-model',
    jobRole: 'Инженер', createdAt: '2026-10-01T00:00:00.000Z', completedAt: '2026-10-01T01:00:00.000Z', status: 'completed',
    choices: [{ id: 'C1', context: 'Исходный контекст', text: 'Исходный вопрос', primaryTrait: 'confidence', secondaryTrait: 'discipline',
      options: [{ id: 'C1-1', text: 'Исходный вариант', primary: 4, secondary: 1 }] }],
    choiceAnswers: { C1: 'C1-1' }, openQuestions: [{ id: 'O1', text: 'Исходный открытый вопрос', trait: 'confidence' }],
    openAnswers: { O1: 'Исходный ответ сотрудника' },
    evaluation: { rubricVersion: 'professional-v1', model: 'old-model', traits: Object.fromEntries(TRAIT_IDS.map((id) => [id, {
      preferencePercent: 60, professionalPercent: 80, finalPercent: 76, evidence: 'Исходный ответ', strength: 'Сильная сторона',
      nextStep: 'Следующее действие', successCriterion: 'Проверяемый результат',
    }])) as NonNullable<DynamicAttempt['evaluation']>['traits'] },
  }
  let app: ReturnType<typeof createApp>
  let server: Server
  let base = ''
  beforeAll(async () => {
    // Database produced by the unfinished version, before the new revision table existed.
    const db = new DatabaseSync(databasePath)
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL);
      CREATE TABLE dynamic_attempts (user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL,
      state TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(user_id, id));`)
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('history-user', 'История', 'history@example.test', 'unused', 'employee')
    for (let index = 0; index < 12; index++) db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)')
      .run('history-user', `history-${index}`, JSON.stringify({ ...first, id: `history-${index}` }), index)
    db.close()
    app = createApp({ serveClient: false, databasePath })
    // Seed a valid session through a separate connection; routes still enforce the actual session middleware.
    const sessions = new DatabaseSync(databasePath)
    sessions.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), 'history-user', Date.now() + 60_000)
    sessions.close()
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No port')
    base = `http://127.0.0.1:${address.port}/api/dynamic`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    app?.locals.closeDatabase()
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(databasePath + suffix)) unlinkSync(databasePath + suffix)
    rmdirSync(directory)
  })
  const get = async (path: string) => (await fetch(base + path, { headers: { Cookie: `bi_academy_session=${token}` } })).json()

  it('после открытия старой базы выдаёт все 12 попыток страницами и сохраняет исходные тексты и оценки', async () => {
    const newest = await get('/attempts?limit=5&offset=0')
    const oldest = await get('/attempts?limit=5&offset=10')
    expect(newest.total).toBe(12)
    expect(newest.attempts).toHaveLength(5)
    expect(oldest.attempts).toHaveLength(2)
    expect((await get('/attempts/history-0')).attempt).toEqual(first)
    expect((await get('/current')).attempt).toBeNull()
  })
  it('выбирает входную и предыдущую попытки стабильно даже при одинаковых датах', async () => {
    const latest = await get('/attempts/history-11/comparison')
    expect(latest.baseline.id).toBe('history-0')
    expect(latest.previous.id).toBe('history-10')
    expect(latest.count).toBe(12)
    expect((await get('/attempts/history-0/comparison')).previous).toBeNull()
  })
  it('после перезапуска использует сохранённые ID вопросов без нового обращения к OpenAI', async () => {
    const db = new DatabaseSync(databasePath)
    db.prepare('INSERT INTO avatars VALUES (?, ?, ?)').run('history-user', JSON.stringify(DEFAULT_AVATAR), Date.now())
    db.prepare('INSERT INTO dynamic_starts VALUES (?, ?)').run('history-user', JSON.stringify({
      id: 'persisted-draft', jobRole: 'Инженер', model: configuredModel(), reasoningEffort: configuredReasoningEffort(),
      promptVersion: PROMPT_VERSION, ids: initialBank.slice(0, 10).map((item) => item.id),
    }))
    db.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    app.locals.closeDatabase()
    app = createApp({ serveClient: false, databasePath })
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No port')
    base = `http://127.0.0.1:${address.port}/api/dynamic`
    const response = await fetch(base + '/start', { method: 'POST', headers: { Cookie: `bi_academy_session=${token}`,
      'Content-Type': 'application/json', 'X-BI-Academy': '1' }, body: JSON.stringify({ id: 'new-client-id', jobRole: 'Инженер' }) })
    expect(response.status).toBe(202)
    const { jobId } = await response.json() as { jobId: string }
    let result: Response | null = null
    for (let index = 0; index < 50; index++) {
      result = await fetch(base + `/jobs/${jobId}`, { headers: { Cookie: `bi_academy_session=${token}` } })
      if (result.status !== 202) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(result?.status).toBe(201)
    const { attempt } = await result!.json() as { attempt: DynamicAttempt }
    expect(attempt.id).toBe('persisted-draft')
    expect(attempt.choices.map((item) => item.id)).toEqual(initialBank.slice(0, 10).map((item) => item.id))
  })
})
