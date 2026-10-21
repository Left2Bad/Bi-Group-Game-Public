import { expect, test } from '@playwright/test'
import { CRITERIA, DYNAMIC_METHOD, PAIRS, PREFERENCE_WEIGHTS, PROMPT_VERSION, RUBRIC_VERSION } from '../../src/dynamic/domain'
import type { DynamicAttempt, DynamicEvaluation } from '../../src/dynamic/domain'
import { TRAIT_IDS } from '../../src/domain/types'
import { DEFAULT_AVATAR } from '../../src/domain/avatar'
import { DatabaseSync } from 'node:sqlite'
import { completed, skill } from '../fixtures/dynamic-attempts'

test('новый путь: 10 вариантов, 5 открытых ответов, восстановление черновика и профиль', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const registered = await page.request.post('/api/auth/register', { headers: { 'X-BI-Academy': '1' }, data: {
    name: 'Новый сотрудник', email: `dynamic-${crypto.randomUUID()}@example.test`, password: 'test-password-2026', role: 'employee',
  } })
  expect(registered.status()).toBe(201)
  let attempt: DynamicAttempt | null = null
  let failNextQuestion = true
  let failEvaluation = true
  let completedWeeks: number[] = []
  const jobs = new Map<string, { status: number; body: unknown; polls: number }>()
  await page.route('**/api/dynamic/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const body = method === 'GET' ? {} : route.request().postDataJSON() as Record<string, string>
    const queue = (status: number, result: unknown) => {
      const jobId = crypto.randomUUID()
      jobs.set(jobId, { status, body: result, polls: 0 })
      return route.fulfill({ status: 202, json: { jobId } })
    }
    if (path.includes('/jobs/')) {
      const job = jobs.get(path.split('/').at(-1)!)
      if (!job) return route.fulfill({ status: 404, json: { error: 'Задача не найдена.' } })
      if (job.polls++ === 0) return route.fulfill({ status: 202, json: { pending: true } })
      return route.fulfill({ status: job.status, json: job.body })
    }
    if (path.endsWith('/comments')) return route.fulfill({ json: { comments: [] } })
    if (path.endsWith('/actions')) return route.fulfill({ json: { completedWeeks } })
    if (path.includes('/actions/')) {
      const week = Number(path.split('/').at(-1))
      completedWeeks = body.completed ? [...completedWeeks, week] : completedWeeks.filter((item) => item !== week)
      return route.fulfill({ json: { ok: true } })
    }
    if (path.endsWith('/current')) return route.fulfill({ json: { attempt } })
    if (path.endsWith('/attempts') && new URL(route.request().url()).searchParams.get('status') === 'completed') {
      const attempts = attempt?.status === 'completed' ? [attempt] : []
      return route.fulfill({ json: { attempts, total: attempts.length } })
    }
    if (path.endsWith('/start')) {
      const choices = PAIRS.map(([primaryTrait, secondaryTrait], index) => ({
        id: `C${index + 1}`, context: `Рабочая ситуация ${index + 1}`, text: `Как вы поступите в ситуации ${index + 1}?`,
        primaryTrait, secondaryTrait, options: PREFERENCE_WEIGHTS.map(([primary, secondary], option) => ({
          id: `C${index + 1}-${option + 1}`, text: `Профессиональный подход ${option + 1}`, primary, secondary,
        })),
      }))
      attempt = { id: body.id!, method: DYNAMIC_METHOD, promptVersion: PROMPT_VERSION, model: 'gpt-6-luna', reasoningEffort: 'high',
        jobRole: body.jobRole!, createdAt: new Date().toISOString(), completedAt: null, status: 'choices',
        choices, choiceAnswers: {}, openQuestions: [], openAnswers: {}, evaluation: null }
      return queue(201, { attempt })
    }
    if (!attempt) return route.fulfill({ status: 404, json: { error: 'Not found' } })
    if (path.endsWith('/answer') && method === 'PUT') {
      attempt = body.optionId ? { ...attempt, choiceAnswers: { ...attempt.choiceAnswers, [body.questionId!]: body.optionId } }
        : { ...attempt, openAnswers: { ...attempt.openAnswers, [body.questionId!]: body.answer! },
          status: Object.keys(attempt.openAnswers).length === 4 ? 'ready' : 'open' }
      return route.fulfill({ json: { attempt } })
    }
    if (path.endsWith('/next')) {
      if (failNextQuestion) { failNextQuestion = false; return queue(503, { error: 'Временный отказ OpenAI. Ответы сохранены.' }) }
      const index = attempt.openQuestions.length
      attempt = { ...attempt, status: 'open', openQuestions: [...attempt.openQuestions, {
        id: `O${index + 1}`, text: `Как вы решите новую рабочую ситуацию ${index + 1} и почему?`, trait: TRAIT_IDS[index % 4]!,
      }] }
      return queue(200, { attempt })
    }
    if (path.endsWith('/evaluate')) {
      if (failEvaluation) { failEvaluation = false; return queue(503, { error: 'Оценивание недоступно. Повторите запрос.' }) }
      const traits = Object.fromEntries(TRAIT_IDS.map((id) => [id, {
        preferencePercent: 65, professionalPercent: 100, behaviorPercent: 75, finalPercent: 68,
        evidence: 'проверю данные', strength: 'Сначала проверяет факты.',
        nextStep: 'Согласовать план с коллегами.', successCriterion: 'План записан и согласован.',
      }])) as DynamicEvaluation['traits']
      attempt = { ...attempt, status: 'completed', completedAt: new Date().toISOString(),
        evaluation: { rubricVersion: RUBRIC_VERSION, model: 'gpt-6-luna', reasoningEffort: 'high', traits,
          behavior: Object.fromEntries(TRAIT_IDS.map((id) => [id, { level: 3, evidence: 'проверю данные', explanation: 'Действие подтверждено ответом.' }])) as NonNullable<DynamicEvaluation['behavior']>,
          skills: [{ name: 'Проверка документации', level: 3, percent: 75, evidence: 'проверю данные',
            explanation: 'Проверяет данные перед решением.', nextStep: 'Проверить следующую схему.',
            learningVenue: 'BIU', learningTopic: 'Проверка строительной документации' }],
          criteria: Object.fromEntries(CRITERIA.map((id) => [id, { level: 4, evidence: 'проверю данные', explanation: 'Проверка фактов обоснована.' }])) as NonNullable<DynamicEvaluation['criteria']>,
          unsafe: false, safetyExplanation: 'Опасных решений в ответах нет.',
          roadmap: TRAIT_IDS.map((trait, index) => ({ week: index + 1, trait, mode: index === 3 ? 'consolidation' : 'growth',
            action: `Запишите и согласуйте план проверки на участке ${index + 1}.`, successCriterion: 'План согласован с ответственным.', support: 'Используйте проверку данных.' })) } }
      return queue(200, { attempt })
    }
    if (path.endsWith('/comparison')) return route.fulfill({ json: { baseline: attempt, previous: null, count: 1 } })
    if (path.endsWith('/attempts')) return route.fulfill({ json: { attempts: [attempt], total: 1 } })
    return route.fulfill({ json: { attempt } })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/avatar/setup')
  await expect(page.getByRole('heading', { name: 'Создайте своего героя' })).toBeVisible()
  for (let index = 0; index < 7; index++) {
    await page.getByRole('radio').first().click()
    await page.getByRole('button', { name: index === 6 ? 'Создать аватара' : 'Далее' }).click()
  }
  await expect(page).toHaveURL(/\/intro/)
  await expect(page.getByRole('heading', { name: 'Как отвечать' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Время и условия' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('intro.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('link', { name: 'Начать или продолжить тест' }).click()
  await page.getByLabel('Ваша должность или рабочая роль').fill('Инженер ПТО')
  await page.getByRole('button', { name: 'Начать новое прохождение' }).click()
  for (let index = 0; index < 10; index++) {
    await expect(page.getByText(`Вопрос ${index + 1} из 15`)).toBeVisible()
    if (index === 0) await page.screenshot({ path: testInfo.outputPath('question.png'), fullPage: true, animations: 'disabled' })
    await page.getByRole('radio').first().check()
    await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click()
  }
  await expect(page.getByRole('alert')).toContainText('Временный отказ OpenAI')
  await page.reload()
  await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click()
  for (let index = 0; index < 5; index++) {
    await expect(page.getByText(`Вопрос ${index + 11} из 15`)).toBeVisible()
    if (index === 1) {
      await page.getByLabel('Ваш ответ').fill('Сначала я проверю данные')
      await page.reload()
      await expect(page.getByLabel('Ваш ответ')).toHaveValue('Сначала я проверю данные')
    }
    await page.getByLabel('Ваш ответ').fill(`В ситуации ${index + 1} я проверю данные и согласую план с командой.`)
    await page.getByRole('button', { name: index < 4 ? 'Следующий вопрос' : 'Получить результат', exact: true }).click()
  }
  await expect(page.getByRole('alert')).toContainText('Оценивание недоступно')
  await page.reload()
  await page.getByRole('button', { name: 'Получить результат' }).click()
  await expect(page).toHaveURL(/\/results\?attempt=/)
  await expect(page.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Основная навигация' })
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await expect(navigation.getByRole('link', { name: 'Профиль', exact: true })).toHaveAttribute('href', '/results')
  await expect(navigation.getByRole('link', { name: 'Маршрут', exact: true })).toHaveAttribute('href', '/development')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await expect(navigation.getByRole('link', { name: 'Профиль', exact: true })).toHaveAttribute('href', '/results')
  await expect(navigation.getByRole('link', { name: 'Маршрут', exact: true })).toHaveAttribute('href', '/development')
  await page.getByRole('button', { name: 'Закрыть меню' }).click()
  await expect(page.getByRole('region', { name: 'Рабочий архетип' })).toBeVisible()
  await expect(page.getByLabel('Код архетипа ПДГН', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /Радар профиля:/ })).toBeVisible()
  await expect(page.getByText(/поведение в ответах: 75%/i).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Динамика навыков' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('profile.png'), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Сменить аватар' }).click()
  await expect(page.getByRole('heading', { name: 'Ваш аватар в профиле' })).toBeVisible()
  await page.goBack()
  await page.getByRole('tab', { name: /^Подробно/ }).click()
  await page.getByText('Как сложился результат').click()
  await expect(page.getByText(/уровень размышлений: high/)).toBeVisible()
  await expect(page.getByRole('img', { name: 'Дисциплина: 68%', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ориентир BI Academy' }).getByText(/Диагностика в приложении: пройдена/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('details.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('link', { name: 'План развития на 30 дней' }).click()
  await expect(page.getByRole('heading', { name: 'Ваш путь на 30 дней' })).toBeVisible()
  await expect(page.getByText('Запишите и согласуйте план проверки на участке 4.')).toBeVisible()
  await page.getByRole('button', { name: 'Отметить выполнение' }).first().click()
  await expect(page.getByText('Наклеек: 1 из 4')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Наклеек: 1 из 4')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('development.png'), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('без настроенного API показывает ошибку и позволяет повторить создание теста', async ({ page }) => {
  const registered = await page.request.post('/api/auth/register', { headers: { 'X-BI-Academy': '1' }, data: {
    name: 'Сотрудник без API', email: `no-api-${crypto.randomUUID()}@example.test`, password: 'test-password-2026', role: 'employee',
  } })
  expect(registered.status()).toBe(201)
  expect((await page.request.put('/api/avatar', { headers: { 'X-BI-Academy': '1' }, data: { avatar: DEFAULT_AVATAR } })).status()).toBe(200)
  await page.goto('/assessment')
  await page.getByLabel('Ваша должность или рабочая роль').fill('Инженер')
  await page.getByRole('button', { name: 'Начать новое прохождение' }).click()
  await expect(page.getByRole('alert')).toContainText('На сервере не настроен OPENAI_API_KEY')
  await expect(page.getByRole('button', { name: 'Начать новое прохождение' })).toBeEnabled()
  await expect(page.getByLabel('Ваша должность или рабочая роль')).toHaveValue('Инженер')
})

test('при ошибке подбора из банка можно повторить старт', async ({ page }) => {
  const registered = await page.request.post('/api/auth/register', { headers: { 'X-BI-Academy': '1' }, data: {
    name: 'Проверка качества', email: `quality-${crypto.randomUUID()}@example.test`, password: 'test-password-2026', role: 'employee',
  } })
  expect(registered.status()).toBe(201)
  expect((await page.request.put('/api/avatar', { headers: { 'X-BI-Academy': '1' }, data: { avatar: DEFAULT_AVATAR } })).status()).toBe(200)
  const requests: unknown[] = []
  await page.route('**/api/dynamic/start', async (route) => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ status: 422, json: { code: 'invalid_output', error: 'AI вернул неверный список вопросов из банка.' } })
  })
  await page.goto('/assessment')
  await page.getByLabel('Ваша должность или рабочая роль').fill('Инженер')
  await page.getByRole('button', { name: 'Начать новое прохождение' }).click()
  await expect(page.getByRole('alert')).toContainText('неверный список вопросов')
  await page.getByRole('button', { name: 'Начать новое прохождение' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toMatchObject({ jobRole: 'Инженер' })
})

test('карточка развития в кабинете руководителя: навыки, динамика и маршрут на телефоне и компьютере', async ({ page: manager, browser }, testInfo) => {
  const suffix = crypto.randomUUID()
  const baseURL = String(testInfo.project.use.baseURL)
  const errors: string[] = []
  manager.on('pageerror', (error) => errors.push(error.message))
  const headers = { 'X-BI-Academy': '1' }
  expect((await manager.request.post('/api/auth/register', { headers, data: { name: 'Анна Руководитель', email: `card-manager-${suffix}@example.test`,
    password: 'test-password-2026', role: 'manager' } })).status()).toBe(201)
  const { team } = await (await manager.request.post('/api/teams', { headers, data: { name: 'Участок карточки' } })).json() as { team: { id: string; inviteCode: string } }
  const employeeContext = await browser.newContext({ baseURL })
  const employee = await (await employeeContext.request.post('/api/auth/register', { headers, data: { name: 'Иван Прораб', email: `card-employee-${suffix}@example.test`,
    password: 'test-password-2026', role: 'employee', inviteCode: team.inviteCode, consent: true } })).json() as { user: { id: string } }
  expect((await employeeContext.request.put('/api/avatar', { headers, data: { avatar: DEFAULT_AVATAR } })).status()).toBe(200)
  // Две сопоставимые завершённые попытки записываются прямо в базу сервера: генерация OpenAI в этом сценарии не нужна.
  const db = new DatabaseSync('.tmp/playwright-dynamic.sqlite')
  const first = completed('card-first', 1, { percent: 50, skills: [skill('work-planning', 'Планирование работ', 25)] })
  const latest = completed('card-latest', 18, { percent: 58, skills: [skill('work-planning', 'Планирование работ', 75), skill('contractor-management', 'Работа с подрядчиками', 50)] })
  for (const [item, saved] of [[first, 1], [latest, 2]] as const)
    db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(employee.user.id, item.id, JSON.stringify(item), saved)
  db.prepare('INSERT INTO dynamic_actions VALUES (?, ?, ?, ?)').run(employee.user.id, latest.id, 1, Date.parse('2026-10-20T10:00:00.000Z'))
  db.close()

  await manager.goto('/team')
  await manager.getByRole('button', { name: 'Результат Иван Прораб', exact: true }).click()
  const card = manager.getByRole('region', { name: 'Карточка развития сотрудника' })
  await expect(card.getByText('Прораб', { exact: true })).toBeVisible()
  await expect(card.getByRole('img', { name: 'Критическое мышление: входная 50%, последняя 58%', exact: true })).toBeVisible()
  const skills = card.getByRole('region', { name: 'Профессиональные навыки' })
  await expect(skills.getByText('+50 п.п.')).toBeVisible()
  await expect(skills.getByText('Недостаточно данных').first()).toBeVisible()
  await expect(card.getByText('Отмечено сотрудником: 1 из 4')).toBeVisible()
  await expect(card.getByText('Ближайшее невыполненное действие')).toBeVisible()
  await skills.getByText('Основание и рекомендация').first().click()
  await expect(skills.getByText('Основание из ответов:').first()).toBeVisible()
  // Профиль команды: аватары, радар и четыре качества по результатам новой методики; пар наставничества нет.
  await expect(manager.getByRole('heading', { name: 'Профиль команды' })).toBeVisible()
  await expect(manager.getByRole('heading', { name: 'Бригада: 1 человек' })).toBeVisible()
  await expect(manager.getByRole('img', { name: /Радар профиля/ }).first()).toBeVisible()
  await manager.getByRole('tab', { name: /Качества сотрудников/ }).click()
  await expect(manager.getByRole('heading', { name: 'Качества сотрудников' })).toBeVisible()
  const heat = manager.getByRole('table', { name: 'Проценты четырёх качеств и архетип каждого сотрудника' })
  for (const name of ['Критическое мышление', 'Уверенность в себе', 'Дисциплина', 'Вовлечённость']) await expect(heat.getByRole('columnheader', { name })).toBeVisible()
  await expect(heat.getByText('Согласованность')).toHaveCount(0)
  await expect(manager.getByText('Пары наставничества')).toHaveCount(0)
  await expect(manager.getByRole('button', { name: /Назначить беседу/ })).toHaveCount(0)
  await manager.getByRole('tab', { name: /Обзор команды/ }).click()
  await manager.getByRole('heading', { name: 'Профиль команды' }).scrollIntoViewIfNeeded()
  await manager.screenshot({ path: `test-results/team-profile-${testInfo.project.name}.png`, animations: 'disabled' })
  // Комментарий руководителя к неделе 2 появляется у сотрудника в его маршруте.
  const route = card.getByRole('region', { name: 'Маршрут на 30 дней' })
  await route.getByRole('button', { name: /Добавить комментарий/ }).nth(1).click()
  await route.getByLabel(/Комментарий к неделе 2/).fill('Обсудим результат на планёрке в пятницу')
  await route.getByRole('button', { name: 'Добавить комментарий', exact: true }).click()
  await expect(route.getByRole('list', { name: 'Комментарии руководителя к неделе 2' }).getByText('Обсудим результат на планёрке в пятницу')).toBeVisible()
  const employeePage = await employeeContext.newPage()
  await employeePage.goto('/development?attempt=card-latest')
  const notes = employeePage.getByRole('group', { name: 'Комментарии руководителя к неделе 2' })
  await expect(notes.getByText('Обсудим результат на планёрке в пятницу')).toBeVisible()
  await expect(employeePage.getByRole('group', { name: 'Комментарии руководителя к неделе 1' })).toHaveCount(0)
  await employeePage.screenshot({ path: `test-results/employee-route-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
  await employeeContext.close()
  expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await card.screenshot({ path: `test-results/manager-card-${testInfo.project.name}.png`, animations: 'disabled' })
  expect(errors).toEqual([])
})

test('профиль сотрудника: сильные стороны, динамика навыков и подробности словами без истории', async ({ page }, testInfo) => {
  const registered = await page.request.post('/api/auth/register', { headers: { 'X-BI-Academy': '1' }, data: {
    name: 'Профиль Сотрудник', email: `profile-${crypto.randomUUID()}@example.test`, password: 'test-password-2026', role: 'employee',
  } })
  const { user } = await registered.json() as { user: { id: string } }
  const db = new DatabaseSync('.tmp/playwright-dynamic.sqlite')
  const first = completed('profile-first', 1, { percent: 50, skills: [skill('work-planning', 'Планирование работ', 75), skill('contractor-management', 'Работа с подрядчиками', 50)] })
  const latest = completed('profile-latest', 18, { percent: 58, skills: [skill('work-planning', 'Планирование работ', 50), skill('contractor-management', 'Работа с подрядчиками', 75), skill('quality-control', 'Контроль качества', 25)] })
  for (const [item, saved] of [[first, 1], [latest, 2]] as const)
    db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(user.id, item.id, JSON.stringify(item), saved)
  db.close()
  await page.goto('/results')
  await expect(page.getByRole('heading', { name: 'Динамика навыков' })).toBeVisible()
  await expect(page.getByText('Снизилось на 25 процентов (было 75% → стало 50%)')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Сильные стороны', exact: true })).toBeVisible()
  await page.screenshot({ path: `test-results/profile-overview-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('tab', { name: /^Подробно/ }).click()
  await expect(page.getByRole('heading', { name: 'Главное' })).toBeVisible()
  await expect(page.getByText('История прохождений')).toHaveCount(0)
  await expect(page.getByText(/п\.п\./)).toHaveCount(0)
  await page.screenshot({ path: `test-results/profile-details-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('беседа: руководитель приглашает сотрудника с низким показателем, сотрудник принимает, руководитель видит ответ', async ({ browser, page: managerPage }, testInfo) => {
  const suffix = crypto.randomUUID()
  const baseURL = String(testInfo.project.use.baseURL)
  const headers = { 'X-BI-Academy': '1' }
  expect((await managerPage.request.post('/api/auth/register', { headers, data: { name: 'Анна Руководитель', email: `meet-manager-${suffix}@example.test`, password: 'test-password-2026', role: 'manager' } })).status()).toBe(201)
  const { team } = await (await managerPage.request.post('/api/teams', { headers, data: { name: 'Участок бесед' } })).json() as { team: { id: string; inviteCode: string } }
  const employeeContext = await browser.newContext({ ...(testInfo.project.name === 'mobile-chromium' ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } : {}), baseURL })
  const registered = await (await employeeContext.request.post('/api/auth/register', { headers, data: { name: 'Иван Сотрудник', email: `meet-employee-${suffix}@example.test`,
    password: 'test-password-2026', role: 'employee', inviteCode: team.inviteCode, consent: true } })).json() as { user: { id: string } }
  const db = new DatabaseSync('.tmp/playwright-dynamic.sqlite')
  const attempt = completed('meet-1', 18, { percent: 40 })
  db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(registered.user.id, attempt.id, JSON.stringify(attempt), 1)
  db.close()

  await managerPage.goto('/team')
  await managerPage.getByRole('tab', { name: /Качества сотрудников/ }).click()
  await expect(managerPage.getByRole('heading', { name: 'Качества сотрудников' })).toBeVisible()
  await managerPage.screenshot({ path: `test-results/meetings-table-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
  await managerPage.getByRole('button', { name: 'Назначить беседу: Иван Сотрудник' }).click()
  const form = managerPage.getByRole('form', { name: 'Беседа с Иван Сотрудник' })
  await expect(form.getByText(/Ниже нормы/)).toBeVisible()
  await form.getByLabel(/Сообщение сотруднику/).fill('Обсудим дисциплину и план на 30 дней')
  await form.getByRole('button', { name: 'Отправить приглашение' }).click()
  const list = managerPage.getByRole('region', { name: 'Встречи с сотрудниками' })
  await expect(list.getByText('Ждёт ответа')).toBeVisible()
  await expect(managerPage.getByRole('button', { name: 'Назначить беседу: Иван Сотрудник' })).toHaveCount(0)
  expect(await managerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await managerPage.screenshot({ path: `test-results/meetings-manager-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })

  const employee = await employeeContext.newPage()
  await employee.goto('/account')
  const bell = employee.getByRole('button', { name: 'Уведомления: 1' })
  await expect(bell).toBeVisible()
  await bell.click()
  const panel = employee.getByRole('region', { name: 'Уведомления' })
  await expect(panel.getByText('Обсудим дисциплину и план на 30 дней')).toBeVisible()
  await employee.screenshot({ path: `test-results/meetings-employee-${testInfo.project.name}.png`, animations: 'disabled' })
  await panel.getByRole('button', { name: /Принять приглашение/ }).click()
  await expect(panel.getByText('Принято')).toBeVisible()
  await expect(employee.getByRole('button', { name: 'Уведомления' })).toBeVisible()

  await managerPage.reload()
  await managerPage.getByRole('button', { name: 'Уведомления: 1' }).click()
  const managerPanel = managerPage.getByRole('region', { name: 'Уведомления' })
  await expect(managerPanel.getByRole('region', { name: 'Новые ответы' }).getByText(/приглашение принято/)).toBeVisible()
  await expect(managerPanel.getByRole('region', { name: 'Список встреч' }).getByText('Иван Сотрудник')).toBeVisible()
  await managerPage.screenshot({ path: `test-results/meetings-manager-bell-${testInfo.project.name}.png`, animations: 'disabled' })
  await employeeContext.close()
})
