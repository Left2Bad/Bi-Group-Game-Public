import { expect, test, STORAGE_KEYS } from '../../tests/fixtures/authenticated'

test('главная → вводная → реальный первый вопрос без ошибок', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('link', { name: /Начать знакомство/ }).click()
  await expect(page.getByRole('heading', { name: 'Перед началом' })).toBeVisible()
  await page.getByRole('link', { name: 'Начать тест' }).click()
  await expect(page.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('удаление данных требует подтверждения и не затрагивает чужие ключи', async ({ page }) => {
  await page.goto('/intro')
  await page.evaluate((keys) => {
    for (const key of Object.values(keys)) localStorage.setItem(key, 'test-data')
    localStorage.setItem('another-app:session', 'keep')
  }, STORAGE_KEYS)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Удалить мои данные' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.draft)).toBe('test-data')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Удалить мои данные' }).click()
  await expect(page.getByRole('status')).toHaveText('Результаты удалены из аккаунта и с этого устройства.')
  expect(await page.evaluate((keys) => Object.values(keys).map((key) => localStorage.getItem(key)), STORAGE_KEYS)).toEqual(Object.values(STORAGE_KEYS).map(() => null))
  expect(await page.evaluate(() => localStorage.getItem('another-app:session'))).toBe('keep')
})

test('прямые ссылки и reload не раскрывают фиктивный профиль', async ({ page, request }) => {
  for (const path of ['/results', '/development', '/print']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Сначала пройдите тест' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Сначала пройдите тест' })).toBeVisible()
  }
  await page.getByRole('link', { name: 'Перейти к началу' }).click()
  await expect(page).toHaveURL('/intro')
  const response = await request.get('/assets/missing.js', { headers: { Accept: 'text/html' } })
  expect(response.status()).toBe(404)
  expect((await request.get('/healthz')).status()).toBe(200)
})
