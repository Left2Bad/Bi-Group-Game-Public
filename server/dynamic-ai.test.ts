// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CRITERIA, DYNAMIC_METHOD, PAIRS, PREFERENCE_WEIGHTS, PROMPT_VERSION } from '../src/dynamic/domain'
import type { DynamicAttempt } from '../src/dynamic/domain'
import { TRAIT_IDS } from '../src/domain/types'
import { SKILL_RUBRIC_VERSION } from '../src/dynamic/skills'
import { AiUnavailable, aiFailure, configuredModel, configuredReasoningEffort, evaluate, generateChoices, generateOpen, reviewChoices } from './dynamic-ai'

const answer = 'Я проверю данные, остановлю опасные работы и согласую безопасный план с командой.'
const fixture = (): DynamicAttempt => ({ id: 'test-attempt', method: DYNAMIC_METHOD, promptVersion: PROMPT_VERSION, model: 'test-model',
  jobRole: 'Инженер', createdAt: '2026-10-19T00:00:00Z', completedAt: null, status: 'ready',
  choices: PAIRS.map(([primaryTrait, secondaryTrait], index) => ({ id: `C${index + 1}`, context: 'Строительная ситуация', text: `Ситуация ${index + 1}`,
    primaryTrait, secondaryTrait, options: PREFERENCE_WEIGHTS.map(([primary, secondary], i) => ({ id: `C${index + 1}-${i + 1}`, text: `Подход ${i}`, primary, secondary })) })),
  choiceAnswers: Object.fromEntries(PAIRS.map((_, i) => [`C${i + 1}`, `C${i + 1}-2`])),
  openQuestions: Array.from({ length: 5 }, (_, i) => ({ id: `O${i + 1}`, text: `Рабочая ситуация ${i}`, trait: TRAIT_IDS[i % 4]! })),
  openAnswers: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`O${i + 1}`, answer])), evaluation: null,
})
const evaluation = () => ({
  criteria: Object.fromEntries(CRITERIA.map((id) => [id, { level: 4, evidence: 'проверю данные', explanation: 'Обоснована проверка фактов и рисков.' }])),
  behavior: Object.fromEntries(TRAIT_IDS.map((id) => [id, { level: 3, evidence: 'проверю данные', explanation: 'Показано наблюдаемое рабочее поведение.' }])),
  skills: [['documentation', 'Проверка документации'], ['work-planning', 'Планирование работ'], ['other', 'Взаимодействие с бригадой']].map(([skillId, name]) => ({ skillId, name, level: 3,
    evidence: 'проверю данные', explanation: 'Показан конкретный способ работы.', nextStep: 'Провести проверку на следующем участке.',
    learningVenue: 'BIU', learningTopic: 'Планирование и проверка строительных работ' })),
  unsafe: false, safetyExplanation: 'Опасных действий в ответах нет.',
  traits: Object.fromEntries(TRAIT_IDS.map((id) => [id, { evidence: 'проверю данные', strength: 'Проверяет факты перед решением.',
    nextStep: 'Зафиксировать результаты проверки.', successCriterion: 'Результаты согласованы с командой.' }])),
  roadmap: TRAIT_IDS.map((trait, i) => ({ week: i + 1, trait, mode: 'growth', action: `Проверить и согласовать рабочий план ${i + 1}.`,
    successCriterion: 'План проверен и утверждён.', support: 'Использовать проверку фактов.' })),
})
const choices = () => ({ questions: Array.from({ length: 10 }, (_, i) => ({ context: `На площадке проводится приёмка участка ${i + 1}.`,
  text: `Как вы организуете безопасную приёмку участка номер ${i + 1}?`,
  options: Array.from({ length: 4 }, (_, o) => `Согласую безопасный рабочий подход номер ${o + 1} с коллегами.`) })) })

describe('валидация ответов OpenAI', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key-not-real')
    vi.stubEnv('OPENAI_MODEL', '')
    vi.stubEnv('OPENAI_REASONING_EFFORT', '')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  const respond = (data: unknown, status = 'completed') => vi.stubGlobal('fetch', vi.fn(async () =>
    Response.json({ status, output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] })))

  it('использует gpt-6-luna с high и сохраняет строгий формат запроса', async () => {
    respond(choices())
    await generateChoices('Инженер', [], [], 'test-id')
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(request.model).toBe('gpt-6-luna')
    expect(request.reasoning).toEqual({ effort: 'high' })
    expect(request.max_output_tokens).toBe(25_000)
    expect(request.text.format.strict).toBe(true)
    expect(request).not.toHaveProperty('temperature')
    expect(request).not.toHaveProperty('top_p')
  })
  it('читает модель и пресет из env, не подменяя настройки сохранённой попытки', async () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-6-luna')
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'medium')
    expect(configuredModel()).toBe('gpt-6-luna')
    expect(configuredReasoningEffort()).toBe('medium')
    respond(choices())
    await generateChoices('Инженер', [], [], 'test-id')
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string).reasoning.effort).toBe('medium')
    respond({ text: 'Как вы проверите безопасность работ и согласуете новый план с командой?' })
    await generateOpen({ ...fixture(), model: 'gpt-6-luna', reasoningEffort: 'high', openQuestions: [] }, [])
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string).reasoning.effort).toBe('high')
    respond(evaluation())
    const result = await evaluate({ ...fixture(), model: 'gpt-6-luna', reasoningEffort: 'high' }, [])
    expect(result.reasoningEffort).toBe('high')
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string).reasoning.effort).toBe('high')
  })
  it('не отправляет новый reasoning в старую попытку и поддерживает default для других моделей', async () => {
    respond(evaluation())
    await evaluate({ ...fixture(), model: 'gpt-4o-mini' }, [])
    const oldRequest = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(oldRequest).not.toHaveProperty('reasoning')
    expect(oldRequest.max_output_tokens).toBe(8000)
    vi.stubEnv('OPENAI_MODEL', 'gpt-4o-mini')
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'default')
    respond(choices())
    await generateChoices('Инженер', [], [], 'test-id')
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)).not.toHaveProperty('reasoning')
  })
  it('отклоняет неизвестный пресет вместо скрытой замены на high', () => {
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'hgh')
    expect(configuredReasoningEffort).toThrow('OPENAI_REASONING_EFFORT')
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'none')
    expect(configuredReasoningEffort()).toBe('none')
  })

  it('различает отказ настроек API и не выводит ключ или ответ модели в лог', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'unsupported_parameter', type: 'invalid_request_error', param: 'reasoning.effort', message: 'secret user text' } },
      { status: 400, headers: { 'x-request-id': 'req-diagnostic' } })))
    try { await generateChoices('Секретная должность', [], [], 'test-id'); expect.fail('must reject') }
    catch (error) {
      const result = aiFailure(error, 'start')
      expect(result.body.code).toBe('configuration')
      expect(logger.mock.calls[0]![1]).toContain('req-diagnostic')
      expect(logger.mock.calls[0]![1]).toContain('unsupported_parameter')
      expect(logger.mock.calls[0]![1]).not.toMatch(/test-key|secret user|Секретная/)
    }
    logger.mockRestore()
  })
  it('показывает незавершённый ответ отдельно и сохраняет usage в диагностике', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'resp-incomplete', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { total_tokens: 5603 } })))
    await expect(generateChoices('Инженер', [], [], 'test-id')).rejects.toMatchObject({ code: 'incomplete', details: { responseId: 'resp-incomplete', totalTokens: 5603, reason: 'max_output_tokens' } })
  })
  it('передаёт проверку смысловой равноценности модели вместо отношения длин', async () => {
    const data = choices()
    data.questions[0]!.options[0] = 'Согласую безопасный рабочий подход и порядок проверки с коллегами, затем запишу подтверждённый план и распределю ответственных за каждый этап.'
    respond(data)
    await expect(generateChoices('Инженер', [], [], 'test-id')).resolves.toHaveLength(10)
  })

  it('вычисляет проценты на сервере и сохраняет проверяемые основания и четыре практики', async () => {
    respond(evaluation())
    const result = await evaluate(fixture(), [])
    expect(result.traits.criticalThinking.behaviorPercent).toBe(75)
    expect(result.traits.engagement.behaviorPercent).toBe(75)
    expect(result.skills).toHaveLength(3)
    expect(result.traits.discipline.questionId).toBe('O1')
    expect(result.roadmap).toHaveLength(4)
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(request.model).toBe('test-model')
    expect(request.store).toBe(false)
    expect(request.text.format.strict).toBe(true)
  })
  it('ограничивает опасные решения даже при высоких уровнях от модели', async () => {
    respond({ ...evaluation(), unsafe: true, unsafeEvidence: 'остановлю опасные работы' })
    const result = await evaluate(fixture(), [])
    expect(TRAIT_IDS.every((id) => result.traits[id].professionalPercent === 25)).toBe(true)
  })
  it('не принимает опасное решение без дословной цитаты из текущих ответов, например из прошлой попытки', async () => {
    respond({ ...evaluation(), unsafe: true, unsafeEvidence: 'Выключу защиту оборудования' })
    await expect(evaluate(fixture(), [])).rejects.toMatchObject({ code: 'invalid_output', details: { check: 'unsafe_quote' } })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    respond({ ...evaluation(), unsafe: true, unsafeEvidence: '' })
    await expect(evaluate(fixture(), [])).rejects.toMatchObject({ details: { check: 'unsafe_quote' } })
  })
  it('отклоняет выдуманную цитату и сохраняет возможность повторить оценивание', async () => {
    const data = evaluation()
    data.criteria.facts!.evidence = 'Этого нет в ответе пользователя'
    respond(data)
    await expect(evaluate(fixture(), [])).rejects.toBeInstanceOf(AiUnavailable)
    respond(evaluation())
    await expect(evaluate(fixture(), [])).resolves.toHaveProperty('criteria.facts.level', 4)
  })
  it('исправляет неверную цитату отдельным запросом и проверяет её по исходному ответу', async () => {
    const data = evaluation()
    data.traits.criticalThinking!.evidence = 'Я проверяю данные'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] }))
      .mockResolvedValueOnce(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text',
        text: JSON.stringify({ quotes: { trait_criticalThinking: 'проверю данные' } }) }] }] }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await evaluate(fixture(), [])
    expect(result.traits.criticalThinking.evidence).toBe('проверю данные')
    expect(result.traits.criticalThinking.questionId).toBe('O1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const repairRequest = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)
    expect(repairRequest.text.format.name).toBe('evaluation_quote_repair')
    expect(repairRequest.text.format.schema.properties.quotes.required).toEqual(['trait_criticalThinking'])
  })
  it('сохраняет устойчивые ID навыков и версию каталога, отклоняет неизвестный и повторный ID', async () => {
    respond(evaluation())
    const result = await evaluate(fixture(), [])
    expect(result.skillRubricVersion).toBe(SKILL_RUBRIC_VERSION)
    expect(result.skills.map((skill) => [skill.skillId, skill.name])).toEqual([
      ['documentation', 'Исполнительная документация'], ['work-planning', 'Планирование работ'], ['other', 'Взаимодействие с бригадой']])
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    const payload = JSON.parse(request.input[1].content)
    expect(payload.expectedSkillIds).toEqual(['duties', 'drawings-big-engineering', 'work-planning'])
    expect(payload.skillCatalog.map((item: { id: string }) => item.id)).toContain('practice-monolith')
    for (const skillId of ['unknown-skill', undefined]) {
      const data = evaluation()
      ;(data.skills[0] as { skillId?: string | undefined }).skillId = skillId
      respond(data)
      await expect(evaluate(fixture(), [])).rejects.toMatchObject({ details: { check: 'skill_id' } })
    }
    const duplicate = evaluation()
    duplicate.skills[1]!.skillId = 'documentation'
    respond(duplicate)
    await expect(evaluate(fixture(), [])).rejects.toMatchObject({ details: { check: 'skill_id' } })
  })
  it('отклоняет неполную рубрику и повторяющиеся практики', async () => {
    respond({ ...evaluation(), criteria: {} })
    await expect(evaluate(fixture(), [])).rejects.toBeInstanceOf(AiUnavailable)
    const data = evaluation()
    data.roadmap[1]!.action = data.roadmap[0]!.action
    respond(data)
    await expect(evaluate(fixture(), [])).rejects.toBeInstanceOf(AiUnavailable)
  })
  it('не возвращает уже выполненное действие в следующем маршруте', async () => {
    const data = evaluation()
    respond(data)
    await expect(evaluate(fixture(), [{ completedActions: [data.roadmap[0]] }])).rejects.toBeInstanceOf(AiUnavailable)
  })
  it('не принимает незавершённый ответ, отказ модели и null', async () => {
    respond(evaluation(), 'incomplete')
    await expect(evaluate(fixture(), [])).rejects.toBeInstanceOf(AiUnavailable)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] })))
    await expect(evaluate(fixture(), [])).rejects.toBeInstanceOf(AiUnavailable)
    respond(null)
    await expect(generateChoices('Инженер', [], [], 'test-id')).rejects.toBeInstanceOf(AiUnavailable)
  })
  it('отклоняет неверное число вариантов и повтор прошлой ситуации', async () => {
    const data = choices()
    respond(data)
    await expect(generateChoices('Инженер', [], [], 'test-id', [data.questions[0]!.text])).rejects.toBeInstanceOf(AiUnavailable)
    data.questions[0]!.options.pop()
    respond(data)
    await expect(generateChoices('Инженер', [], [], 'test-id')).rejects.toBeInstanceOf(AiUnavailable)
  })
  it('отклоняет повтор старого открытого вопроса и неравноценные варианты', async () => {
    const question = 'Как вы проверите безопасность работ и согласуете новый план с командой?'
    respond({ text: question })
    await expect(generateOpen({ ...fixture(), openQuestions: [] }, [], [question])).rejects.toBeInstanceOf(AiUnavailable)
    respond({ valid: false, reason: 'Один вариант заведомо опасен.' })
    await expect(reviewChoices(fixture().choices)).rejects.toBeInstanceOf(AiUnavailable)
  })
})
