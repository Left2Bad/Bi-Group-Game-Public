import { expect, test, STORAGE_KEYS } from '../../tests/fixtures/authenticated'
import type { Page } from '@playwright/test'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { questions } from '../content/questions'
import { DATA_VERSIONS } from '../domain/types'
import type { Answers, AssessmentResult } from '../domain/types'

async function answerAll(page: Page, answers: Answers, pauseAtSeven = false) {
  for (const [index, question] of questions.entries()) {
    await expect(page.getByRole('heading', { name: `Ситуация ${index + 1} из 15` })).toBeVisible()
    const option = question.options.find((item) => item.id === answers[question.id])
    if (!option) throw new Error(`Missing manual answer ${question.id}`)
    await page.getByRole('radio', { name: option.text, exact: true }).check()
    await page.getByRole('button', { name: index === 14 ? 'Проверить ответы' : 'Далее', exact: true }).click()
    if (pauseAtSeven && index === 5) {
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Ситуация 7 из 15' })).toBeVisible()
      await expect(page.getByText('Ответов: 6 из 15', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Назад', exact: true }).click()
      await expect(page.getByRole('radio', { name: option.text, exact: true })).toBeChecked()
      await page.getByRole('button', { name: 'Далее', exact: true }).click()
    }
  }
  await expect(page.getByRole('heading', { name: 'Проверьте ответы' })).toBeVisible()
  await page.getByRole('button', { name: 'Получить профиль', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
}

async function assertDemoA(page: Page) {
  await page.getByRole('tab', { name: /^Подробно/ }).click()
  for (const [name, percent] of [['Критическое мышление', 75], ['Уверенность в себе', 57], ['Дисциплина', 76], ['Вовлечённость', 46]]) {
    await expect(page.getByRole('img', { name: `${name}: ${percent}%`, exact: true })).toBeVisible()
  }
}

test('15 реальных ответов → reload Q07 → профиль → рекомендации → печать', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('link', { name: /Начать знакомство/ }).click()
  await page.getByRole('link', { name: 'Начать тест', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled()
  await answerAll(page, manualSets.demoA.answers, true)
  await assertDemoA(page)
  const evidence = page.getByLabel('Почему такой результат: Вовлечённость')
  await evidence.focus()
  await page.keyboard.press('Enter')
  await expect(evidence.locator('..')).toHaveAttribute('open', '')
  await expect(evidence.locator('..').getByText(/Свой простой сокращён, но общая задержка остаётся/)).toBeVisible()
  await page.getByRole('tab', { name: /^Обзор/ }).click()
  await expect(page.getByRole('heading', { name: 'Сильные стороны', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Зоны роста' })).toBeVisible()
  await page.reload()
  await assertDemoA(page)
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('link', { name: 'Перейти к действиям для развития' }).click()
  await expect(page.getByRole('heading', { name: 'Маршрут развития' })).toBeVisible()
  const historyBeforeMark = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.attempts)
  await page.getByRole('checkbox', { name: 'Выполнено: Вовлечённость' }).check()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Выполнено: Вовлечённость' })).toBeChecked()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.attempts)).toBe(historyBeforeMark)
  await page.getByRole('link', { name: 'Открыть отчёт для печати' }).click()
  await expect(page.getByRole('heading', { name: 'Профиль BI Academy' })).toBeVisible()
  await expect(page.locator('[data-print-report] p').filter({ hasText: 'Действие: На ближайшей встрече предложите смежной бригаде одну конкретную помощь.' })).toBeVisible()
  await expect(page.getByText('Связанные ситуации: Q13', { exact: true })).toBeVisible()
  const table = page.getByRole('table', { name: 'Четыре независимых показателя' })
  for (const value of ['75%', '57%', '76%', '46%']) await expect(table.getByText(value, { exact: true })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('[data-app-chrome]').first()).toBeHidden()
  await expect(page.getByRole('button', { name: 'Печать / сохранить PDF' })).toBeHidden()
  await expect(page.locator('[data-print-report]')).toBeVisible()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(errors).toEqual([])
})

test('изменение Q13 даёт 46 → 58 и сохраняет прежний снимок', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/assessment')
  await answerAll(page, manualSets.demoA.answers)
  const first: AssessmentResult = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').attempts[0], STORAGE_KEYS.attempts)
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('link', { name: 'Перейти к действиям для развития' }).click()
  await page.getByRole('checkbox', { name: 'Выполнено: Уверенность в себе' }).check()
  await page.getByRole('link', { name: 'Вернуться к профилю' }).click()
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('button', { name: 'Исправить ответы', exact: true }).click()
  await answerAll(page, manualSets.demoB.answers)
  await page.getByRole('tab', { name: /^Подробно/ }).click()
  await expect(page.getByRole('img', { name: 'Вовлечённость: 58%', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Уверенность в себе: 57%', exact: true })).toBeVisible()
  const attempts: AssessmentResult[] = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').attempts, STORAGE_KEYS.attempts)
  expect(attempts).toHaveLength(2)
  expect(attempts[1]).toEqual(first)
  expect(attempts[0]?.attemptId).not.toBe(first.attemptId)
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('link', { name: 'Перейти к действиям для развития' }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await expect(page.getByRole('checkbox', { name: 'Выполнено: Уверенность в себе' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Выполнено: Вовлечённость' })).not.toBeChecked()
  await page.getByRole('link', { name: 'Вернуться к профилю' }).click()
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('link', { name: 'Печать / сохранить PDF', exact: true }).click()
  await expect(page.getByText('Связанные ситуации: Q04', { exact: true })).toBeVisible()
  await expect(page.getByText('Связанные ситуации: Q13', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Вернуться к профилю' }).click()
  await page.getByRole('tab', { name: /^Подробно/ }).click()
  await page.getByRole('combobox', { name: 'Сравнить текущий профиль с' }).selectOption(first.attemptId)
  const comparison = page.getByRole('table', { name: 'Разница ответов по четырём качествам' })
  await expect(comparison.getByRole('row', { name: 'Вовлечённость 46% 58% +12 п.п.' })).toBeVisible()
  await expect(comparison.getByText('0 п.п.', { exact: true })).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('combobox', { name: 'Открыть сохранённый профиль' }).selectOption(first.attemptId)
  await assertDemoA(page)
  await expect(comparison).toHaveCount(0)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').attempts, STORAGE_KEYS.attempts)).toEqual(attempts)
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('link', { name: 'Перейти к действиям для развития' }).click()
  await expect(page.getByRole('checkbox', { name: 'Выполнено: Уверенность в себе' })).toBeChecked()
})

for (const kind of ['invalid', 'incompatible'] as const) {
  test(`восстановление ${kind}: отмена сброса сохраняет данные`, async ({ page }) => {
    await page.goto('/intro')
    const raw = kind === 'invalid' ? '{broken' : JSON.stringify({
      versions: { ...DATA_VERSIONS, assessment: 'old' }, answers: {}, currentQuestionId: 'Q01', updatedAt: '2026-10-17T00:00:00.000Z',
    })
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEYS.draft, value: raw })
    await page.goto('/assessment')
    await expect(page.getByRole('heading', { name: 'Нужно обновить черновик' })).toBeVisible()
    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Начать заново', exact: true }).click()
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.draft)).toBe(raw)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Начать заново', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
  })
}

test('полное прохождение работает в памяти при запрете storage', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, {
      configurable: true, value() { throw new DOMException('Storage disabled for test', 'SecurityError') },
    })
  })
  await page.goto('/assessment')
  await expect(page.getByRole('status')).toContainText('Ответы остаются в памяти')
  await answerAll(page, manualSets.demoA.answers)
  await assertDemoA(page)
  await expect(page.getByText(/Не удалось сохранить завершённую попытку/)).toBeVisible()
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('link', { name: 'Перейти к действиям для развития' }).click()
  await page.getByRole('checkbox', { name: 'Выполнено: Вовлечённость' }).check()
  await page.getByRole('link', { name: 'Вернуться к профилю' }).click()
  await assertDemoA(page)
  await page.getByRole('tab', { name: /^Поделиться/ }).click()
  await page.getByRole('link', { name: 'Перейти к действиям для развития' }).click()
  await expect(page.getByRole('checkbox', { name: 'Выполнено: Вовлечённость' })).toBeChecked()
  await expect(page.getByText(/Не удалось сохранить отметки/)).toBeVisible()
})
