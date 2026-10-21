import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const password = 'test-password-2026'
async function fillRegistration(page: Page, email: string, name = 'Тестовый Сотрудник') {
  await page.getByLabel('Имя и фамилия').fill(name)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
}

test('проверяет поля до отправки и позволяет исправить значения', async ({ page }) => {
  let requests = 0
  page.on('request', (request) => { if (request.url().endsWith('/api/auth/register')) requests++ })
  await page.goto('/register')
  await fillRegistration(page, 'a..b@example.test', '   ')
  await page.getByLabel('Пароль', { exact: true }).fill(' '.repeat(10))
  await page.getByLabel('Код команды (необязательно)').fill('INVALID')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  const name = page.getByLabel('Имя и фамилия')
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Код команды (необязательно)')).toHaveAttribute('aria-invalid', 'true')
  expect(requests).toBe(0)
  const email = `corrected-${crypto.randomUUID()}@example.test`
  await fillRegistration(page, email.toUpperCase(), '  Әлия О’Нил  ')
  await page.getByLabel('Код команды (необязательно)').fill('')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page).toHaveURL('/intro')
  const { user } = await (await page.request.get('/api/auth/me')).json()
  expect(user.name).toBe('Әлия О’Нил')
  expect(user.email).toBe(email)
  expect(requests).toBe(1)
})

test('показывает занятый email на нужном поле и разрешает повторную отправку', async ({ page, browser }, info) => {
  const email = `taken-${crypto.randomUUID()}@example.test`
  const other = await browser.newContext({ baseURL: String(info.project.use.baseURL) })
  const response = await other.request.post('/api/auth/register', { headers: { 'X-BI-Academy': '1' }, data: { name: 'Существующий Сотрудник', email, password, role: 'employee' } })
  expect(response.status()).toBe(201)
  await other.close()
  await page.goto('/register')
  await fillRegistration(page, email)
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Этот email уже зарегистрирован. Войдите в аккаунт.')
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('button', { name: 'Зарегистрироваться', exact: true })).toBeEnabled()
  await page.getByLabel('Email', { exact: true }).fill(`available-${crypto.randomUUID()}@example.test`)
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page).toHaveURL('/intro')
})

test('ошибка сети не стирает форму и не блокирует повторную регистрацию', async ({ page }) => {
  await page.goto('/register?role=manager')
  const email = `retry-${crypto.randomUUID()}@example.test`
  await fillRegistration(page, email, 'Руководитель Участка')
  await page.route('**/api/auth/register', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Нет связи с сервером')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await expect(page.getByRole('button', { name: 'Зарегистрироваться', exact: true })).toBeEnabled()
  await page.unroute('**/api/auth/register')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page).toHaveURL('/team')
})

test('проверяет поля входа до запроса и снимает ошибку после исправления', async ({ page }) => {
  let requests = 0
  page.on('request', (request) => { if (request.url().endsWith('/api/auth/login')) requests++ })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('broken')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  expect(requests).toBe(0)
  await page.getByLabel('Email', { exact: true }).fill(`unknown-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль.')
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
  expect(requests).toBe(1)
})

test('не отправляет повторную регистрацию, пока первый запрос ещё выполняется', async ({ page }) => {
  let requests = 0
  let release: (() => void) | undefined
  await page.route('**/api/auth/register', async (route) => {
    requests++
    await new Promise<void>((done) => { release = done })
    await route.continue()
  })
  await page.goto('/register')
  await fillRegistration(page, `single-${crypto.randomUUID()}@example.test`)
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect.poll(() => Boolean(release)).toBe(true)
  await expect(page.getByRole('button', { name: 'Подождите…', exact: true })).toBeDisabled()
  await page.locator('form').evaluate((form) => {
    if (!(form instanceof HTMLFormElement)) throw new Error('Registration form missing')
    form.requestSubmit(); form.requestSubmit()
  })
  expect(requests).toBe(1)
  release!()
  await expect(page).toHaveURL('/intro')
})

test('проверяет название команды и код сотрудника на клиенте и сервере', async ({ page, browser }, info) => {
  const suffix = crypto.randomUUID()
  await page.goto('/register?role=manager')
  await fillRegistration(page, `manager-validation-${suffix}@example.test`, 'Руководитель Участка')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page).toHaveURL('/team')
  let creates = 0
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/teams')) creates++ })
  await page.getByLabel('Название команды').fill('   ')
  await page.getByRole('button', { name: 'Создать команду', exact: true }).click()
  await expect(page.getByLabel('Название команды')).toBeFocused()
  expect(creates).toBe(0)
  await page.getByLabel('Название команды').fill('Проверка команды')
  await page.getByRole('button', { name: 'Создать команду', exact: true }).click()
  const invitation = page.getByLabel('Код приглашения')
  await expect(invitation).toBeVisible()
  const code = (await invitation.innerText()).trim()
  const context = await browser.newContext({ baseURL: String(info.project.use.baseURL) })
  const employee = await context.newPage()
  await employee.goto('/register')
  await fillRegistration(employee, `employee-validation-${suffix}@example.test`)
  await employee.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(employee).toHaveURL('/intro')
  await employee.goto('/account')
  const input = employee.getByLabel('Код команды', { exact: true })
  await employee.getByRole('checkbox', { name: /Согласен\(на\) передать руководителю/ }).check()
  let joins = 0
  employee.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/membership')) joins++ })
  await input.fill('BAD')
  await employee.getByRole('button', { name: 'Присоединиться', exact: true }).click()
  await expect(input).toBeFocused()
  expect(joins).toBe(0)
  await input.fill('FFFFFFFFFFFFFFFF')
  await employee.getByRole('button', { name: 'Присоединиться', exact: true }).click()
  await expect(employee.getByRole('alert')).toHaveText('Команда с таким кодом не найдена.')
  await expect(input).toBeFocused()
  await input.fill(` ${code.toLowerCase()} `)
  await employee.getByRole('button', { name: 'Присоединиться', exact: true }).click()
  await expect(employee.getByRole('heading', { name: 'Проверка команды', exact: true })).toBeVisible()
  expect(joins).toBe(2)
  await context.close()
})
