import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { questions } from '../../src/content/questions'
import { manualSets } from '../fixtures/answer-sets'
import type { Answers } from '../../src/domain/types'

async function register(page: Page, data: { role: 'manager' | 'employee'; name: string; email: string; code?: string }) {
  await page.goto(`/register?role=${data.role}`)
  await page.getByLabel('Имя и фамилия').fill(data.name)
  await page.getByLabel('Email', { exact: true }).fill(data.email)
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-2026')
  if (data.code) {
    await page.getByLabel('Код команды (необязательно)').fill(data.code)
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
    // Без согласия аккаунт с кодом команды не создаётся.
    await expect(page.getByRole('alert')).toHaveText('Чтобы вступить в команду, подтвердите согласие на передачу результатов руководителю.')
    await page.getByRole('checkbox', { name: /Согласен\(на\) передать руководителю/ }).check()
  }
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page).toHaveURL(data.role === 'manager' ? '/team' : '/intro')
}

test('регистрация двух ролей → команда → реальный тест → результат подчинённого', async ({ page, browser }, testInfo) => {
  // Три браузерных контекста, полное прохождение и снимки длинной страницы команды.
  test.setTimeout(60_000)
  const suffix = crypto.randomUUID()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/register?role=manager')
  await expect(page.getByRole('radio', { name: /Руководитель/ })).toBeChecked()
  await page.screenshot({ path: `.tmp/register-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
  await register(page, { role: 'manager', name: 'Анна Руководитель', email: `manager-${suffix}@example.test` })
  await page.getByLabel('Название команды').fill('Команда монтажа')
  await page.getByRole('button', { name: 'Создать команду', exact: true }).click()
  const invitation = page.getByLabel('Код приглашения')
  await expect(invitation).toBeVisible()
  const code = (await invitation.innerText()).trim()
  await expect(page.getByText('Пока никто не присоединился.', { exact: false })).toBeVisible()
  expect((await page.request.get('/api/attempts')).status()).toBe(403)

  const employeeContext = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: page.viewportSize() })
  const employee = await employeeContext.newPage()
  employee.on('pageerror', (error) => errors.push(error.message))
  await register(employee, { role: 'employee', name: 'Иван Сотрудник', email: `employee-${suffix}@example.test`, code })
  await employee.goto('/account')
  await expect(employee.getByRole('heading', { name: 'Команда монтажа' })).toBeVisible()
  expect((await employee.request.get('/api/teams')).status()).toBe(403)
  await employee.goto('/assessment')
  const answers: Answers = manualSets.demoA.answers
  for (const [index, question] of questions.entries()) {
    const option = question.options.find((item) => item.id === answers[question.id])!
    await employee.getByRole('radio', { name: option.text, exact: true }).check()
    await employee.getByRole('button', { name: index === 14 ? 'Проверить ответы' : 'Далее', exact: true }).click()
  }
  await employee.getByRole('button', { name: 'Получить профиль', exact: true }).click()
  await expect(employee.getByRole('status').filter({ hasText: 'Результат сохранён в аккаунте.' })).toBeVisible()
  await page.getByRole('button', { name: 'Обновить результаты' }).click()
  await expect(page.getByRole('button', { name: 'Результат Иван Сотрудник', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Результат Иван Сотрудник', exact: true }).click()
  const resultRegion = page.getByRole('region', { name: 'Результат сотрудника', exact: true })
  const card = resultRegion.getByRole('region', { name: 'Карточка развития сотрудника' })
  await expect(card.getByText('Сотрудник проходил только прежнюю методику', { exact: false })).toBeVisible()
  await expect(card.getByRole('img', { name: 'Вовлечённость: 46%', exact: true })).toBeVisible()
  await expect(card.getByText('Маршрут появится после диагностики по новой методике.')).toBeVisible()
  await expect(card.getByText('Общий процент развития')).toHaveCount(0)
  await resultRegion.getByText('Полный профиль прежней методики').click()
  const legacyProfile = resultRegion.locator('details', { hasText: 'Полный профиль прежней методики' })
  await legacyProfile.getByRole('tab', { name: /^Подробно/ }).click()
  await expect(legacyProfile.getByRole('img', { name: 'Уверенность в себе: 57%', exact: true })).toBeVisible()
  await page.screenshot({ path: `.tmp/manager-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  // Новый контекст имитирует другое устройство без localStorage.
  const secondDevice = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) })
  const returning = await secondDevice.newPage()
  await returning.goto('/login')
  await returning.getByLabel('Email', { exact: true }).fill(`employee-${suffix}@example.test`)
  await returning.getByLabel('Пароль', { exact: true }).fill('test-password-2026')
  await returning.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(returning).toHaveURL('/intro')
  await returning.goto('/results')
  await expect(returning.getByRole('heading', { name: 'Ваш профиль', exact: true })).toBeVisible()
  await returning.getByRole('tab', { name: /^Подробно/ }).click()
  await expect(returning.getByRole('img', { name: 'Вовлечённость: 46%', exact: true })).toBeVisible()
  await secondDevice.close()

  await employee.goto('/account')
  employee.once('dialog', (dialog) => dialog.accept())
  await employee.getByRole('button', { name: 'Выйти из команды', exact: true }).click()
  await expect(employee.getByRole('button', { name: 'Присоединиться', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Обновить результаты' }).click()
  await expect(page.getByText('Пока никто не присоединился.', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Результат сотрудника' })).toHaveCount(0)
  await employeeContext.close()
  expect(errors).toEqual([])
})

test('гостевой доступ, ошибки входа и изоляция аккаунтов в одном браузере', async ({ page }) => {
  await page.goto('/assessment')
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('unknown@example.test')
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-2026')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль.')
  const suffix = crypto.randomUUID()
  await register(page, { role: 'employee', name: 'Первый Сотрудник', email: `first-${suffix}@example.test` })
  await page.goto('/assessment')
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Далее', exact: true }).click()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible()
  await register(page, { role: 'employee', name: 'Второй Сотрудник', email: `second-${suffix}@example.test` })
  await page.goto('/assessment')
  await expect(page.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
  await page.goto('/team')
  await expect(page.getByRole('heading', { name: 'Эта страница доступна для другой роли' })).toBeVisible()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(`first-${suffix}@example.test`)
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-2026')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL('/intro')
  await page.goto('/assessment')
  await expect(page.getByRole('heading', { name: 'Ситуация 2 из 15' })).toBeVisible()
})
