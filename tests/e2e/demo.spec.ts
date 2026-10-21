import { expect, test, STORAGE_KEYS } from '../fixtures/authenticated'
import { assessmentModule } from '../../src/app/assessment-module'
import { questions } from '../../src/content/questions'
import { DATA_VERSIONS } from '../../src/domain/types'
import { buildRecommendations } from '../../src/domain/recommend'
import { createAssessmentSession } from '../../src/features/assessment/session'
import { createActionStorage } from '../../src/storage/actions'
import { memoryStorage } from '../../src/storage/test-storage'
import { STORAGE_KEYS as baseKeys } from '../../src/storage/shared'
import { manualSets } from '../fixtures/answer-sets'

test('демо без попытки: реальная смена A/B, отметки в памяти и reload без записи', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    let writes = 0
    Object.defineProperty(window, '__demoStorageWrites', { get: () => writes })
    for (const method of ['setItem', 'removeItem', 'clear'] as const) {
      const original = Storage.prototype[method]
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: function (this: Storage, ...args: unknown[]) {
        if (this === window.localStorage) writes++
        return Reflect.apply(original, this, args)
      } })
    }
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Посмотреть пример профиля' }).click()
  await expect(page.getByRole('heading', { name: 'Как один ответ меняет профиль' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Вовлечённость: 46%', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Практика в примере: Вовлечённость' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Отметить в примере: Вовлечённость' }).check()
  await expect(page.getByRole('img', { name: 'Вовлечённость: 46%', exact: true })).toBeVisible()
  const b = page.getByRole('button', { name: 'Вариант B', exact: true })
  await b.focus()
  await page.keyboard.press('Enter')
  await expect(b).toHaveAttribute('aria-pressed', 'true')
  for (const [name, percent] of [['Критическое мышление', 75], ['Уверенность в себе', 57], ['Дисциплина', 76], ['Вовлечённость', 58]]) {
    await expect(page.getByRole('img', { name: `${name}: ${percent}%`, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('region', { name: 'Практика в примере: Вовлечённость' })).toContainText('Связанные ситуации: Q03')
  await expect(page.getByRole('region', { name: 'Практика в примере: Уверенность в себе' })).toContainText('Связанные ситуации: Q04')
  await page.getByRole('checkbox', { name: 'Отметить в примере: Уверенность в себе' }).check()
  await page.getByRole('button', { name: 'Вариант A', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Отметить в примере: Вовлечённость' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Отметить в примере: Уверенность в себе' })).not.toBeChecked()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Вариант A', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('checkbox', { name: 'Отметить в примере: Вовлечённость' })).not.toBeChecked()
  expect(await page.evaluate((keys) => Object.values(keys).map((key) => localStorage.getItem(key)), STORAGE_KEYS)).toEqual(Object.values(STORAGE_KEYS).map(() => null))
  expect(await page.evaluate(() => Reflect.get(window, '__demoStorageWrites'))).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // Пока теста нет, «Профиль» в меню закрыт (не нажимается), а прямой адрес по-прежнему не раскрывает фиктивный профиль.
  const menu = page.getByRole('button', { name: 'Открыть меню', exact: true })
  if (await menu.isVisible()) await menu.click()
  const locked = page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: /^Профиль/ })
  await expect(locked).toHaveAttribute('aria-disabled', 'true')
  await page.goto('/results')
  await expect(page.getByRole('heading', { name: 'Сначала пройдите тест' })).toBeVisible()
  expect(errors).toEqual([])
})

test('демо не меняет активный Q07, завершённую попытку, реальные отметки и чужие ключи', async ({ page }) => {
  const storage = memoryStorage()
  const session = createAssessmentSession({ module: assessmentModule, getStorage: () => storage,
    now: () => '2026-10-17T08:00:00.000Z', newAttemptId: () => 'user-before-demo' })
  for (const question of questions) { session.selectOption(manualSets.demoA.answers[question.id as keyof typeof manualSets.demoA.answers]); session.next() }
  const result = session.finish()!
  const recommendations = buildRecommendations(result).recommendations
  createActionStorage({ attemptId: result.attemptId, versions: DATA_VERSIONS, recommendationIds: recommendations.map((item) => item.id), getStorage: () => storage })
    .setCompleted(recommendations[0]!.id, true)
  session.startOver()
  for (const question of questions.slice(0, 6)) { session.selectOption(manualSets.demoA.answers[question.id as keyof typeof manualSets.demoA.answers]); session.next() }
  session.selectOption('Q07-D')
  const seed = Object.fromEntries(Object.entries(STORAGE_KEYS).flatMap(([name, key]) => {
    const value = storage.getItem(baseKeys[name as keyof typeof baseKeys])
    return value === null ? [] : [[key, value]]
  }))
  seed['another-app:session'] = 'keep'
  await page.goto('/')
  await page.evaluate((data) => { for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value) }, seed)
  await page.goto('/demo')
  await page.getByRole('checkbox', { name: 'Отметить в примере: Вовлечённость' }).check()
  await page.getByRole('button', { name: 'Вариант B', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Отметить в примере: Уверенность в себе' }).check()
  await page.reload()
  expect(await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), Object.keys(seed))).toEqual(seed)
  await page.getByRole('link', { name: 'Вернуться к своему тесту' }).click()
  await page.getByRole('link', { name: 'Продолжить тест', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ситуация 7 из 15' })).toBeVisible()
  const selected = questions[6]!.options.find((option) => option.id === 'Q07-D')!
  await expect(page.getByRole('radio', { name: selected.text, exact: true })).toBeChecked()
  expect(await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), Object.keys(seed))).toEqual(seed)
})

test('прямой вход в демо работает при запрете storage', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, {
      configurable: true, value: () => { throw new DOMException('Storage blocked', 'SecurityError') },
    })
  })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Вариант B', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Вовлечённость: 58%', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('img', { name: 'Вовлечённость: 46%', exact: true })).toBeVisible()
})
