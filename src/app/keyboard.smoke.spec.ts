import { expect, test } from '../../tests/fixtures/authenticated'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { completeWithKeyboard } from './keyboard-flow'
import type { Locator, Page } from '@playwright/test'

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 60; step++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  await expect(target).toBeFocused()
}

test('весь путь клавиатурой: главная → 15 ответов → объяснения → действия', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /бетон уже выехал/ })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: /Начать знакомство/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Перед началом' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Начать тест', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await completeWithKeyboard(page, manualSets.demoA.answers)
  await page.getByRole('tab', { name: /^Подробно/ }).click()
  for (const trait of ['Критическое мышление', 'Уверенность в себе', 'Дисциплина', 'Вовлечённость']) {
    const summary = page.getByLabel(`Почему такой результат: ${trait}`)
    await tabTo(page, summary)
    await expect(summary).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(summary.locator('..')).toHaveAttribute('open', '')
  }
  await page.getByRole('tab', { name: /^Обзор/ }).click()
  await tabTo(page, page.getByRole('link', { name: 'Мой маршрут развития' }))
  await expect(page.getByRole('link', { name: 'Мой маршрут развития' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Маршрут развития' })).toBeVisible()
  for (let index = 0; index < 2; index++) {
    await page.keyboard.press('Tab')
    const checkbox = page.getByRole('checkbox').nth(index)
    await expect(checkbox).toBeFocused()
    await page.keyboard.press('Space')
    await expect(checkbox).toBeChecked()
  }
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Пройти тест повторно' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Вернуться к профилю' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: /^Подробно/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('img', { name: 'Вовлечённость: 46%', exact: true })).toBeVisible()
})
