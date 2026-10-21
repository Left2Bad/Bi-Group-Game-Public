// @vitest-environment node
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.mjs'
import { manualSets } from '../tests/fixtures/answer-sets'
import { DATA_VERSIONS } from '../src/domain/types'
import { CRITERIA, TRAIT_CRITERIA } from '../src/dynamic/domain'
import { DEFAULT_AVATAR } from '../src/domain/avatar'

describe('динамическое прохождение по HTTP', () => {
  const app = createApp({ serveClient: false, databasePath: ':memory:' })
  const nativeFetch = globalThis.fetch.bind(globalThis)
  const previousKey = process.env.OPENAI_API_KEY
  let server: Server
  let base = ''
  let openCount = 0
  let rejectNextOpen = false
  let rejectNextEvaluation = false
  let choiceBatch = 0
  let lastChoiceBatch = 0
  let pauseChoices: (() => Promise<void>) | null = null
  let invalidChoices = false
  let lastSelectedIds: string[] = []
  const calls: string[] = []
  const configurations: { model: string; reasoning: { effort: string }; service_tier: string }[] = []
  beforeAll(async () => {
    process.env.OPENAI_API_KEY = 'test-key-not-real'
    vi.stubEnv('OPENAI_MODEL', 'gpt-6-luna')
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'high')
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).startsWith('https://api.openai.com/')) return nativeFetch(input, init)
      const body = JSON.parse(String(init?.body)) as { model: string; reasoning: { effort: string }; service_tier: string;
        input: { content: string }[]; text: { format: { name: string } } }
      const name = body.text.format.name
      calls.push(name)
      configurations.push({ model: body.model, reasoning: body.reasoning, service_tier: body.service_tier })
      if (name === 'open_question' && rejectNextOpen) { rejectNextOpen = false; return new Response('temporary', { status: 503 }) }
      if (name === 'professional_evaluation' && rejectNextEvaluation) { rejectNextEvaluation = false; return new Response('temporary', { status: 503 }) }
      let data: unknown
      if (name === 'question_selection') {
        const batch = ++choiceBatch
        lastChoiceBatch = batch
        if (pauseChoices) await pauseChoices()
        const selection = JSON.parse(body.input[1]!.content) as { bank: { id: string }[] }
        lastSelectedIds = selection.bank.slice(0, 10).map((item) => item.id)
        data = { ids: lastSelectedIds.slice(0, invalidChoices ? 9 : 10) }
      }
      else if (name === 'open_question') data = { text: `Как вы решите рабочую ситуацию ${++openCount}, учитывая риски и взаимодействие с командой?` }
      else data = { criteria: Object.fromEntries(CRITERIA.map((id) => [id, { level: 4, evidence: 'проверю данные', explanation: 'Описан конкретный способ проверки.' }])),
        behavior: Object.fromEntries(Object.keys(TRAIT_CRITERIA).map((id) => [id, { level: 3, evidence: 'проверю данные', explanation: 'Показано наблюдаемое рабочее поведение.' }])),
        skills: [['documentation', 'Проверка документации'], ['work-planning', 'Планирование работ'], ['team-coordination', 'Работа с бригадой']].map(([skillId, skill]) => ({ skillId, name: skill, level: 3,
          evidence: 'проверю данные', explanation: 'Есть описание конкретного действия.', nextStep: 'Провести проверку на новом участке.',
          learningVenue: 'BIU', learningTopic: 'Планирование и контроль строительных работ' })),
        unsafe: false, safetyExplanation: 'Опасные действия не предложены.',
        roadmap: Object.keys(TRAIT_CRITERIA).map((trait, index) => ({ week: index + 1, trait, mode: 'growth',
          action: `Составить и проверить план практики номер ${index + 1}.`, successCriterion: 'План подтверждён руководителем.', support: 'Опирайтесь на проверку данных.' })),
        traits: Object.fromEntries(['criticalThinking', 'confidence', 'discipline', 'engagement'].map((id) => [id, {
        evidence: 'проверю данные', strength: 'Учитывает факты и мнение команды.',
        nextStep: 'Согласуйте план работы с коллегами.', successCriterion: 'План записан и подтверждён командой.',
      }])) }
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] })
    })
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No port')
    base = `http://127.0.0.1:${address.port}/api`
  })
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    app.locals.closeDatabase()
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  async function rawRequest(path: string, cookie = '', method = 'GET', body?: unknown) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  }
  async function waitJob(jobId: string, cookie: string) {
    for (let index = 0; index < 200; index++) {
      const result = await rawRequest(`/dynamic/jobs/${jobId}`, cookie)
      if (result.status !== 202) return result
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error('Background job did not finish')
  }
  async function request(path: string, cookie = '', method = 'GET', body?: unknown) {
    const result = await rawRequest(path, cookie, method, body)
    if (result.status !== 202) return result
    const { jobId } = await result.json() as { jobId: string }
    return waitJob(jobId, cookie)
  }
  async function register(role: 'employee' | 'manager', suffix: string, withAvatar = true) {
    const response = await request('/auth/register', '', 'POST', { name: `Тест ${suffix}`, email: `${suffix}@example.test`,
      password: 'test-password-2026', role })
    expect(response.status).toBe(201)
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!
    if (role === 'employee' && withAvatar) expect((await request('/avatar', cookie, 'PUT', { avatar: DEFAULT_AVATAR })).status).toBe(200)
    return cookie
  }
  it('выбирает из банка 10 вопросов, генерирует 5 открытых и оценивает две рубрики', async () => {
    const employee = await register('employee', 'dynamic-employee')
    const manager = await register('manager', 'dynamic-manager')
    // Руководитель проходит тест для себя: доступ есть, но видны только его собственные попытки.
    expect((await request('/dynamic/current', manager)).status).toBe(200)
    expect((await (await request('/dynamic/attempts?status=completed', manager)).json()).total).toBe(0)
    expect((await (await request('/dynamic/attempts?status=completed&limit=1', employee)).json()).total).toBe(0)
    const id = 'dynamic-attempt-one'
    const started = await request('/dynamic/start', employee, 'POST', { id, jobRole: 'Инженер ПТО' })
    expect(started.status).toBe(201)
    let { attempt } = await started.json()
    expect(attempt.choices).toHaveLength(10)
    expect((await (await request('/dynamic/attempts?status=completed&limit=1', employee)).json()).total).toBe(0)
    expect(attempt.choices.map((q: { id: string }) => q.id)).toEqual(lastSelectedIds)
    expect(lastSelectedIds.every((questionId) => questionId.startsWith('ENG_'))).toBe(true)
    expect(attempt.model).toBe('gpt-6-luna')
    expect(attempt.reasoningEffort).toBe('high')
    expect(attempt.choices.every((q: { options: unknown[] }) => q.options.length === 4)).toBe(true)
    expect((await request('/dynamic/start', employee, 'POST', { id, jobRole: 'Инженер ПТО' })).status).toBe(200)
    for (const question of attempt.choices) {
      const response = await request(`/dynamic/attempts/${id}/answer`, employee, 'PUT', { questionId: question.id, optionId: question.options[0].id })
      expect(response.status).toBe(200)
      attempt = (await response.json()).attempt
    }
    rejectNextOpen = true
    expect((await request(`/dynamic/attempts/${id}/next`, employee, 'POST', {})).status).toBe(503)
    expect((await (await request(`/dynamic/attempts/${id}`, employee)).json()).attempt.choiceAnswers).toHaveProperty(lastSelectedIds[9]!)
    for (let index = 0; index < 5; index++) {
      const generated = await request(`/dynamic/attempts/${id}/next`, employee, 'POST', {})
      expect(generated.status).toBe(200)
      attempt = (await generated.json()).attempt
      const question = attempt.openQuestions[index]
      if (index === 0) {
        const repeated = await (await request(`/dynamic/attempts/${id}/next`, employee, 'POST', {})).json()
        expect(repeated.attempt.openQuestions).toHaveLength(1)
      }
      const saved = await request(`/dynamic/attempts/${id}/answer`, employee, 'PUT', {
        questionId: question.id, answer: `В ситуации ${index + 1} я проверю данные, оценю риски и согласую план с командой.`,
      })
      expect(saved.status).toBe(200)
      attempt = (await saved.json()).attempt
      if (index === 4) expect((await request(`/dynamic/attempts/${id}/answer`, employee, 'PUT', {
        questionId: question.id, answer: `В ситуации ${index + 1} я проверю данные, оценю риски и согласую план с командой.`,
      })).status).toBe(200)
    }
    expect(attempt.status).toBe('ready')
    expect(attempt.openQuestions).toHaveLength(5)
    rejectNextEvaluation = true
    expect((await request(`/dynamic/attempts/${id}/evaluate`, employee, 'POST', {})).status).toBe(503)
    const restored = (await (await request('/dynamic/current', employee)).json()).attempt
    expect(restored.openAnswers).toEqual(attempt.openAnswers)
    expect(restored.status).toBe('ready')
    const evaluated = await request(`/dynamic/attempts/${id}/evaluate`, employee, 'POST', {})
    expect(evaluated.status).toBe(200)
    attempt = (await evaluated.json()).attempt
    expect(attempt.status).toBe('completed')
    const finished = await (await request('/dynamic/attempts?status=completed&limit=1', employee)).json()
    expect(finished.total).toBe(1)
    expect(finished.attempts[0].id).toBe(id)
    expect(attempt.evaluation.traits.criticalThinking.behaviorPercent).toBe(75)
    expect(attempt.evaluation.traits.engagement.finalPercent).toBeGreaterThan(0)
    expect(attempt.evaluation.skills).toHaveLength(3)
    expect(attempt.evaluation.roadmap).toHaveLength(4)
    expect(attempt.evaluation.criteria.facts.level).toBe(4)
    expect(attempt.evaluation.reasoningEffort).toBe('high')
    expect(configurations.every((config) => config.model === 'gpt-6-luna' && config.reasoning.effort === 'high' && config.service_tier === 'fast')).toBe(true)
    expect((await request(`/dynamic/attempts/${id}/answer`, employee, 'PUT', { questionId: 'O5', answer: 'Изменённый ответ после завершения теста.' })).status).toBe(409)
    expect((await request(`/dynamic/attempts/${id}/evaluate`, employee, 'POST', {})).status).toBe(200)
    expect((await (await request('/dynamic/attempts?limit=1&offset=0', employee)).json()).total).toBe(1)
    expect(calls.filter((name) => name === 'open_question')).toHaveLength(6)
    expect((await request(`/dynamic/attempts/${id}`, manager)).status).toBe(404)
    const other = await register('employee', 'other-employee')
    expect((await (await request('/dynamic/attempts?status=completed&limit=1', other)).json()).total).toBe(0)
    expect((await request(`/dynamic/attempts/${id}`, other)).status).toBe(404)
    expect((await request(`/dynamic/attempts/${id}/actions/1`, other, 'PUT', { completed: true })).status).toBe(404)
    expect((await request(`/dynamic/attempts/${id}/actions/1`, employee, 'PUT', { completed: true })).status).toBe(200)
    expect((await (await request(`/dynamic/attempts/${id}/actions`, employee)).json()).completedWeeks).toEqual([1])
    const teamResponse = await request('/teams', manager, 'POST', { name: 'Тестовая команда' })
    const { team } = await teamResponse.json()
    const joined = await request('/membership', employee, 'POST', { inviteCode: team.inviteCode, consent: true })
    expect(joined.status).toBe(201)
    const teamData = await (await request(`/teams/${team.id}`, manager)).json()
    expect(teamData.members[0].dynamicResult.id).toBe(id)
    await request('/membership', employee, 'DELETE')
    expect((await (await request(`/teams/${team.id}`, manager)).json()).members).toHaveLength(0)
  })
  it('параллельный старт оплачивает только один выбор из банка', async () => {
    const employee = await register('employee', 'parallel-start')
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let ready!: () => void
    const started = new Promise<void>((resolve) => { ready = resolve })
    const before = calls.length
    pauseChoices = async () => { ready(); await gate }
    const requests = ['parallel-one', 'parallel-two'].map((id) => request('/dynamic/start', employee, 'POST', { id, jobRole: 'Инженер' }))
    await started
    release()
    const responses = await Promise.all(requests)
    pauseChoices = null
    const attempts = await Promise.all(responses.map(async (response) => (await response.json()).attempt))
    expect(attempts[0].id).toBe(attempts[1].id)
    expect(calls.slice(before)).toEqual(['question_selection'])
    expect((await (await request('/dynamic/attempts', employee)).json()).total).toBe(1)
    expect((await request(`/dynamic/attempts/${attempts[0].id}/actions/1`, employee, 'PUT', { completed: true })).status).toBe(409)
    expect(lastChoiceBatch).toBeGreaterThan(1)
  })
  it('отвечает на старт сразу и ограничивает чтение статуса владельцем', async () => {
    const employee = await register('employee', 'background-start')
    const other = await register('employee', 'background-other')
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let ready!: () => void
    const started = new Promise<void>((resolve) => { ready = resolve })
    pauseChoices = async () => { ready(); await gate }
    try {
      const response = await rawRequest('/dynamic/start', employee, 'POST', { id: 'background-attempt', jobRole: 'Инженер' })
      expect(response.status).toBe(202)
      const { jobId } = await response.json() as { jobId: string }
      await started
      expect((await rawRequest(`/dynamic/jobs/${jobId}`, employee)).status).toBe(202)
      expect((await rawRequest(`/dynamic/jobs/${jobId}`, other)).status).toBe(404)
      expect((await (await rawRequest('/dynamic/current', employee)).json()).pendingJobId).toBe(jobId)
      release()
      expect((await waitJob(jobId, employee)).status).toBe(201)
    } finally { release(); pauseChoices = null }
  })
  it('требует заполненный аватар перед началом теста', async () => {
    const employee = await register('employee', 'avatar-required', false)
    expect((await request('/dynamic/start', employee, 'POST', { id: 'avatar-required-test', jobRole: 'Инженер' })).status).toBe(409)
    expect((await request('/avatar', employee, 'PUT', { avatar: DEFAULT_AVATAR })).status).toBe(200)
    expect((await request('/dynamic/start', employee, 'POST', { id: 'avatar-required-test', jobRole: 'Инженер' })).status).toBe(201)
  })
  it('отклоняет неверный список ID, а после исправления выбирает вопросы из банка', async () => {
    const employee = await register('employee', 'invalid-draft')
    const before = calls.length
    invalidChoices = true
    const first = await request('/dynamic/start', employee, 'POST', { id: 'invalid-format', jobRole: 'Инженер' })
    invalidChoices = false
    expect(first.status).toBe(422)
    expect((await first.json()).code).toBe('invalid_output')
    expect((await request('/dynamic/start', employee, 'POST', { id: 'invalid-repeat', jobRole: 'Инженер' })).status).toBe(201)
    expect(calls.slice(before)).toEqual(['question_selection', 'question_selection'])
  })
  it('удаление истории отменяет отложенное создание попытки', async () => {
    const employee = await register('employee', 'delete-pending')
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let ready!: () => void
    const started = new Promise<void>((resolve) => { ready = resolve })
    pauseChoices = async () => { ready(); await gate }
    const pending = request('/dynamic/start', employee, 'POST', { id: 'deleted-attempt', jobRole: 'Инженер' })
    await started
    expect((await request('/attempts', employee, 'DELETE')).status).toBe(200)
    release()
    expect((await pending).status).toBe(409)
    pauseChoices = null
    expect((await (await request('/dynamic/attempts', employee)).json()).total).toBe(0)
  })
  it('хранит больше десяти старых попыток и выдаёт их страницами без пересчёта', async () => {
    const employee = await register('employee', 'history-employee')
    for (let index = 0; index < 12; index++) {
      const response = await request('/attempts', employee, 'POST', {
        attemptId: `legacy-${index}`, answers: manualSets.demoA.answers, versions: DATA_VERSIONS,
      })
      expect(response.status).toBe(201)
    }
    const first = await (await request('/attempts?limit=5&offset=0', employee)).json()
    const last = await (await request('/attempts?limit=5&offset=10', employee)).json()
    expect(first.total).toBe(12)
    expect(first.attempts).toHaveLength(5)
    expect(last.attempts).toHaveLength(2)
    expect(last.attempts.some((item: { attemptId: string }) => item.attemptId === 'legacy-0')).toBe(true)
  })
  it('без API ключа не подменяет генерацию заготовками', async () => {
    const employee = await register('employee', 'missing-key')
    delete process.env.OPENAI_API_KEY
    const response = await request('/dynamic/start', employee, 'POST', { id: 'missing-key-attempt', jobRole: 'Мастер участка' })
    expect(response.status).toBe(503)
    expect((await (await request('/dynamic/current', employee)).json()).attempt).toBeNull()
    process.env.OPENAI_API_KEY = 'test-key-not-real'
  })
})
