// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.mjs'
import { completed } from '../tests/fixtures/dynamic-attempts'
import { CRITERIA, DYNAMIC_METHOD, PAIRS, PREFERENCE_WEIGHTS, PROGRESS_PROMPT_VERSION, PROMPT_VERSION, progressAnchors } from '../src/dynamic/domain'
import { TRAIT_IDS } from '../src/domain/types'
import type { DynamicAttempt } from '../src/dynamic/domain'

/** Попытка с открытым ответом: цитаты анализа проверяются по тексту ответов. */
const withAnswer = (attempt: DynamicAttempt, answer: string): DynamicAttempt => ({ ...attempt,
  openQuestions: [{ id: 'O1', text: 'Как вы примете армирование перед заливкой?', trait: 'discipline' }], openAnswers: { O1: answer } })

describe('опорные точки цикла «до и после»', () => {
  const series = Array.from({ length: 7 }, (_, index) => completed(`p${index + 1}`, index + 1))
  it('при семи прохождениях сравнивает 7-е с 1-м и 4-м', () => {
    const anchors = progressAnchors(series[6]!, series)
    expect([anchors.first?.id, anchors.middle?.id, anchors.count]).toEqual(['p1', 'p4', 7])
  })
  it('у старой попытки учитывает только прохождения до неё; серединное — с третьей попытки', () => {
    expect(progressAnchors(series[1]!, series)).toMatchObject({ first: { id: 'p1' }, middle: null, count: 2 })
    expect(progressAnchors(series[2]!, series).middle?.id).toBe('p2')
    expect(progressAnchors(series[0]!, series)).toEqual({ first: null, middle: null, count: 1 })
  })
  it('новая попытка без сохранения в истории добавляется в конец; другая методика не учитывается', () => {
    const fresh = completed('p8', 8)
    const other = { ...completed('legacy', 0), method: 'bi-academy-dynamic-v1' }
    expect(progressAnchors(fresh, [other, ...series])).toMatchObject({ first: { id: 'p1' }, middle: { id: 'p4' }, count: 8 })
  })
})

const ready: DynamicAttempt = { id: 'progress-4', method: DYNAMIC_METHOD, promptVersion: PROMPT_VERSION, model: 'gpt-6-luna', reasoningEffort: 'high',
  bankVersion: 'bank-v1', jobRole: 'Прораб', createdAt: '2026-10-25T08:00:00.000Z', completedAt: null, status: 'ready',
  choices: PAIRS.map(([primaryTrait, secondaryTrait], index) => ({ id: `C${index + 1}`, context: 'Строительная ситуация', text: `Ситуация ${index + 1}`,
    primaryTrait, secondaryTrait, options: PREFERENCE_WEIGHTS.map(([primary, secondary], i) => ({ id: `C${index + 1}-${i + 1}`, text: `Подход ${i}`, primary, secondary })) })),
  choiceAnswers: Object.fromEntries(PAIRS.map((_, i) => [`C${i + 1}`, `C${i + 1}-2`])),
  openQuestions: Array.from({ length: 5 }, (_, i) => ({ id: `O${i + 1}`, text: `Рабочая ситуация ${i}`, trait: TRAIT_IDS[i % 4]! })),
  openAnswers: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`O${i + 1}`, 'Я проверю данные, остановлю опасные работы и согласую безопасный план с командой.'])),
  evaluation: null }
const evaluationReply = {
  criteria: Object.fromEntries(CRITERIA.map((id) => [id, { level: 3, evidence: 'проверю данные', explanation: 'Обоснована проверка фактов и рисков.' }])),
  behavior: Object.fromEntries(TRAIT_IDS.map((id) => [id, { level: 3, evidence: 'проверю данные', explanation: 'Показано наблюдаемое рабочее поведение.' }])),
  skills: [['documentation', 'Проверка документации'], ['work-planning', 'Планирование работ'], ['quality-control', 'Контроль качества']].map(([skillId, name]) => ({ skillId, name, level: 3,
    evidence: 'проверю данные', explanation: 'Показан конкретный способ работы.', nextStep: 'Провести проверку на следующем участке.',
    learningVenue: 'BIU', learningTopic: 'Планирование и проверка строительных работ' })),
  unsafe: false, unsafeEvidence: '', safetyExplanation: 'Опасных действий в ответах нет.',
  traits: Object.fromEntries(TRAIT_IDS.map((id) => [id, { evidence: 'проверю данные', strength: 'Проверяет факты перед решением.',
    nextStep: 'Зафиксировать результаты проверки.', successCriterion: 'Результаты согласованы с командой.' }])),
  roadmap: TRAIT_IDS.map((trait, i) => ({ week: i + 1, trait, mode: 'growth', action: `Проверить и согласовать рабочий план ${i + 1}.`,
    successCriterion: 'План проверен и утверждён.', support: 'Использовать проверку фактов.' })),
}

describe('анализ прогресса по HTTP', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bi-dynamic-progress-'))
  const databasePath = join(directory, 'progress.sqlite')
  const token = 'progress-test-session'
  const nativeFetch = globalThis.fetch.bind(globalThis)
  const requests: { name: string; input: string }[] = []
  let app: ReturnType<typeof createApp>
  let server: Server
  let base = ''
  const attempts = [
    withAnswer(completed('progress-1', 1, { percent: 40 }), 'Если отклонение небольшое, оставлю, потому что сроки жёсткие.'),
    withAnswer(completed('progress-2', 10, { percent: 50 }), 'Сверю шаг стержней с проектом и позову мастера.'),
    withAnswer(completed('progress-3', 20, { percent: 60 }), 'Остановлю бетонирование и вместе с технадзором замерю защитный слой.'),
  ]
  beforeAll(async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key-not-real')
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).startsWith('https://api.openai.com/')) return nativeFetch(input, init)
      const body = JSON.parse(String(init?.body)) as { input: { content: string }[]; text: { format: { name: string } } }
      requests.push({ name: body.text.format.name, input: body.input[1]!.content })
      if (body.text.format.name === 'professional_evaluation') return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(evaluationReply) }] }] })
      const data = { summary: 'Ответы стали конкретнее: вместо допуска по срокам вы опираетесь на замеры и проект.',
        professionalism: { verdict: 'better', explanation: 'Решение о бетонировании теперь зависит от замеров, а не от сроков.',
          before: 'оставлю, потому что сроки жёсткие', now: 'замерю защитный слой' },
        trajectory: 'Рост был ровным: уже к середине появилась сверка с проектом.',
        improvements: [{ area: 'Технология', before: 'этой фразы не было в ответах', now: 'Остановлю бетонирование', explanation: 'Вы останавливаете работы при отклонении.' }],
        attention: [], nextFocus: 'Фиксируйте результат замеров в акте скрытых работ.' }
      return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] })
    })
    app = createApp({ serveClient: false, databasePath })
    const db = new DatabaseSync(databasePath)
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('progress-user', 'Прогресс', 'progress@example.test', 'unused', 'employee')
    attempts.forEach((attempt, index) => db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run('progress-user', attempt.id, JSON.stringify(attempt), index + 1))
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), 'progress-user', Date.now() + 60_000)
    db.close()
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No port')
    base = `http://127.0.0.1:${address.port}/api/dynamic`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    app?.locals.closeDatabase()
    vi.unstubAllGlobals(); vi.unstubAllEnvs()
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(databasePath + suffix)) unlinkSync(databasePath + suffix)
    rmdirSync(directory)
  })
  const call = (path: string, method = 'GET') => fetch(base + path, { method,
    headers: { Cookie: `bi_academy_session=${token}`, 'Content-Type': 'application/json', 'X-BI-Academy': '1' }, ...(method === 'POST' ? { body: '{}' } : {}) })
  const settle = async (response: Response) => {
    if (response.status !== 202) return response
    const { jobId } = await response.json() as { jobId: string }
    for (let index = 0; index < 200; index++) {
      const result = await call(`/jobs/${jobId}`)
      if (result.status !== 202) return result
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error('Background job did not finish')
  }

  it('сравнение отдаёт закреплённое первое и серединное прохождение', async () => {
    const comparison = await (await call('/attempts/progress-3/comparison')).json()
    expect([comparison.baseline.id, comparison.middle.id, comparison.previous.id, comparison.progressCount]).toEqual(['progress-1', 'progress-2', 'progress-2', 3])
    const second = await (await call('/attempts/progress-2/comparison')).json()
    expect([second.baseline.id, second.middle, second.progressCount]).toEqual(['progress-1', null, 2])
  })
  it('для первого прохождения анализ не нужен', async () => {
    expect((await call('/attempts/progress-1/progress', 'POST')).status).toBe(409)
    expect(requests).toHaveLength(0)
  })
  it('анализирует ответы последней попытки против первой и серединной и сохраняет без смены порядка истории', async () => {
    const result = await settle(await call('/attempts/progress-3/progress', 'POST'))
    expect(result.status).toBe(200)
    const { attempt } = await result.json() as { attempt: DynamicAttempt }
    const progress = attempt.evaluation!.progress!
    expect(progress).toMatchObject({ promptVersion: PROGRESS_PROMPT_VERSION, firstId: 'progress-1', middleId: 'progress-2',
      professionalism: { verdict: 'better', before: 'оставлю, потому что сроки жёсткие', now: 'замерю защитный слой' } })
    // Цитата, которой нет в ответах, не показывается; верная остаётся.
    expect(progress.improvements[0]).toMatchObject({ before: '', now: 'Остановлю бетонирование' })
    expect(requests.map((item) => item.name)).toEqual(['progress_analysis'])
    // Разделы данных названы по-русски, чтобы модель не переносила в текст «first» и «current».
    const sent = JSON.parse(requests[0]!.input) as Record<string, { баллы: { качестваВПроцентах: Record<string, number> }; открытыеОтветы: { ответ: string }[] }>
    expect(Object.keys(sent)).toEqual(['первое', 'серединное', 'последнее'])
    expect(sent['первое']!.баллы.качестваВПроцентах['Критическое мышление']).toBe(40)
    expect(sent['первое']!.открытыеОтветы[0]!.ответ).toContain('сроки жёсткие')
    expect(requests[0]!.input).not.toMatch(/"(first|middle|current|traits|criteria|skills|unsafe|criticalThinking)"/)
    const list = await (await call('/attempts?limit=3')).json() as { attempts: DynamicAttempt[] }
    expect(list.attempts.map((item) => item.id)).toEqual(['progress-3', 'progress-2', 'progress-1'])
    expect((await (await call('/attempts/progress-3')).json()).attempt.evaluation.progress.summary).toContain('конкретнее')
  })
  it('готовый анализ для того же набора прохождений не запрашивается повторно', async () => {
    const response = await call('/attempts/progress-3/progress', 'POST')
    expect(response.status).toBe(200)
    expect(requests).toHaveLength(1)
  })
  it('анализ прежней версии промпта пересоздаётся по запросу', async () => {
    const db = new DatabaseSync(databasePath)
    db.prepare("UPDATE dynamic_attempts SET state = json_set(state, '$.evaluation.progress.promptVersion', 'progress-v1') WHERE id = 'progress-3'").run()
    db.close()
    const before = requests.length
    const result = await settle(await call('/attempts/progress-3/progress', 'POST'))
    expect(result.status).toBe(200)
    expect(requests.length).toBe(before + 1)
    expect((await result.json()).attempt.evaluation.progress.promptVersion).toBe(PROGRESS_PROMPT_VERSION)
  })
  it('оценка повторной попытки видит только её ответы, а «до и после» строит отдельным запросом', async () => {
    const db = new DatabaseSync(databasePath)
    db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run('progress-user', ready.id, JSON.stringify(ready), 10)
    db.close()
    requests.length = 0
    const result = await settle(await call(`/attempts/${ready.id}/evaluate`, 'POST'))
    expect(result.status).toBe(200)
    const { attempt } = await result.json() as { attempt: DynamicAttempt }
    expect(requests.map((item) => item.name)).toEqual(['professional_evaluation', 'progress_analysis'])
    const sent = JSON.parse(requests[0]!.input) as { history: Record<string, unknown>[] }
    // Ответы и баллы прошлых прохождений в оценку не попадают: только даты и выполненные практики для маршрута.
    expect(sent.history.length).toBeGreaterThan(0)
    expect(sent.history.every((item) => Object.keys(item).sort().join() === 'completedActions,date')).toBe(true)
    expect(requests[0]!.input).not.toContain('сроки жёсткие')
    expect(attempt.evaluation!.unsafe).toBe(false)
    expect(attempt.evaluation!.progress).toMatchObject({ firstId: 'progress-1', middleId: 'progress-2' })
  })
})
