import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Answers } from '../domain/types'
import { questions } from '../content/questions.ts'

/** Реальные Tab/Arrow/Space/Enter: без click/check/focus для прохождения теста. */
export async function completeWithKeyboard(page: Page, answers: Answers) {
  for (const [index, question] of questions.entries()) {
    await expect(page.getByRole('heading', { name: `Ситуация ${index + 1} из 15` })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('radio').first()).toBeFocused()
    const optionIndex = question.options.findIndex((option) => option.id === answers[question.id])
    if (optionIndex < 0) throw new Error('Missing keyboard fixture answer')
    for (let step = 0; step < optionIndex; step++) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')
    await expect(page.getByRole('radio').nth(optionIndex)).toBeChecked()
    await page.keyboard.press('Tab')
    if (index > 0) {
      await expect(page.getByRole('button', { name: 'Назад', exact: true })).toBeFocused()
      await page.keyboard.press('Tab')
    }
    await expect(page.getByRole('button', { name: index === 14 ? 'Проверить ответы' : 'Далее', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('heading', { name: 'Проверьте ответы' })).toBeVisible()
  for (let index = 0; index < 16; index++) await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Получить профиль' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
}
