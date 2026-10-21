import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { questions } from '../content/questions'
import type { Answers } from '../domain/types'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { memoryStorage } from '../storage/test-storage'
import { STORAGE_KEYS } from '../storage/shared'
import { createAttemptStorage } from '../storage/attempts'
import { createDraftStorage } from '../storage/draft'
import { AppRoutes } from './routes'
import { assessmentModule } from './assessment-module'

const openTab = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }))

function realResult(answers: Answers, attemptId: string) {
  const calculated = assessmentModule.calculateProfile(answers, {
    ...assessmentModule, attemptId, completedAt: '2026-10-17T00:00:00.000Z',
  })
  if (!calculated.ok) throw new Error(calculated.error.message)
  return calculated.result
}

describe('A интегрирует реальный каталог/расчёт C и интерфейс B', () => {
  it('показывает 75/57/76/46 и рекомендации Q13 из реальных ответов', () => {
    const storage = memoryStorage()
    const answers: Answers = manualSets.demoA.answers
    render(<MemoryRouter initialEntries={['/assessment']}><AppRoutes getStorage={() => storage} /></MemoryRouter>)
    for (const [index, question] of questions.entries()) {
      const option = question.options.find((item) => item.id === answers[question.id])
      if (!option) throw new Error('Missing manual answer')
      fireEvent.click(screen.getByRole('radio', { name: option.text }))
      fireEvent.click(screen.getByRole('button', { name: index === 14 ? 'Проверить ответы' : 'Далее' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Получить профиль' }))
    expect(screen.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Контролёр качества' })).toBeVisible()
    openTab(/^Подробно/)
    for (const [name, value] of [['Критическое мышление', 75], ['Уверенность в себе', 57], ['Дисциплина', 76], ['Вовлечённость', 46]] as const) {
      expect(screen.getByRole('img', { name: `${name}: ${value}%` })).toBeVisible()
    }
    const saved = JSON.parse(storage.getItem(STORAGE_KEYS.attempts) ?? '{}')
    expect(saved.attempts).toHaveLength(1)
    expect(saved.attempts[0].answers).toEqual(manualSets.demoA.answers)
    expect(screen.queryByRole('table', { name: 'Разница ответов по четырём качествам' })).not.toBeInTheDocument()
    openTab(/^Поделиться/)
    fireEvent.click(screen.getByRole('link', { name: 'Печать / сохранить PDF' }))
    const table = screen.getByRole('table', { name: 'Четыре независимых показателя' })
    expect(within(table).getByText('46%')).toBeVisible()
    expect(screen.getByText('На ближайшей встрече предложите смежной бригаде одну конкретную помощь.')).toBeVisible()
    expect(screen.getByText('Связанные ситуации: Q13')).toBeVisible()
  })

  it('реальная попытка совместима с восстановлением сессии и общим контрактом', () => {
    const output = assessmentModule.calculateProfile(manualSets.demoA.answers, {
      ...assessmentModule, attemptId: 'real-contract', completedAt: '2026-10-17T00:00:00.000Z',
    })
    if (!output.ok) throw new Error(output.error.message)
    expect(assessmentModule.buildRecommendations?.(output.result).priorityTraits).toEqual(['engagement', 'confidence'])
    expect(output.result.versions).toEqual(assessmentModule.versions)
  })

  it('сравнивает два реальных снимка, открывает старый профиль и не перезаписывает историю', () => {
    const storage = memoryStorage()
    const history = createAttemptStorage(() => storage)
    history.appendAttempt(realResult(manualSets.demoA.answers, 'first'))
    history.appendAttempt(realResult(manualSets.demoB.answers, 'second'))
    const raw = storage.getItem(STORAGE_KEYS.attempts)
    render(<MemoryRouter initialEntries={['/results']}><AppRoutes getStorage={() => storage} /></MemoryRouter>)
    openTab(/^Подробно/)
    fireEvent.change(screen.getByRole('combobox', { name: 'Сравнить текущий профиль с' }), { target: { value: 'first' } })
    const comparison = screen.getByRole('table', { name: 'Разница ответов по четырём качествам' })
    const row = within(comparison).getByRole('row', { name: 'Вовлечённость 46% 58% +12 п.п.' })
    expect(row).toBeVisible()
    expect(within(comparison).getAllByText('0 п.п.')).toHaveLength(3)
    fireEvent.change(screen.getByRole('combobox', { name: 'Открыть сохранённый профиль' }), { target: { value: 'first' } })
    expect(screen.getByRole('img', { name: 'Вовлечённость: 46%' })).toBeVisible()
    expect(screen.queryByRole('table', { name: 'Разница ответов по четырём качествам' })).not.toBeInTheDocument()
    openTab(/^Поделиться/)
    fireEvent.click(screen.getByRole('link', { name: 'Печать / сохранить PDF' }))
    expect(screen.getByText('Связанные ситуации: Q13')).toBeVisible()
    expect(storage.getItem(STORAGE_KEYS.attempts)).toBe(raw)
  })

  it('не разрешает открыть/сравнить снимок другой версии', () => {
    const storage = memoryStorage()
    const history = createAttemptStorage(() => storage)
    const old = realResult(manualSets.demoB.answers, 'old')
    history.appendAttempt({ ...old, versions: { ...old.versions, scoring: 'old-rules' } })
    history.appendAttempt(realResult(manualSets.demoA.answers, 'current'))
    const raw = storage.getItem(STORAGE_KEYS.attempts)
    render(<MemoryRouter initialEntries={['/results']}><AppRoutes getStorage={() => storage} /></MemoryRouter>)
    openTab(/^Подробно/)
    expect(screen.getByRole('option', { name: /другая версия/ })).toBeDisabled()
    expect(screen.queryByRole('combobox', { name: 'Сравнить текущий профиль с' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Разница ответов по четырём качествам' })).not.toBeInTheDocument()
    expect(storage.getItem(STORAGE_KEYS.attempts)).toBe(raw)
  })

  it('просмотр старого профиля из вводной сохраняет активный черновик и его позицию', () => {
    const storage = memoryStorage()
    createAttemptStorage(() => storage).appendAttempt(realResult(manualSets.demoA.answers, 'previous'))
    createDraftStorage({ ...assessmentModule, getStorage: () => storage }).saveDraft({
      versions: assessmentModule.versions, answers: { Q01: manualSets.demoA.answers.Q01 },
      currentQuestionId: 'Q02', updatedAt: '2026-10-17T01:00:00.000Z',
    })
    const raw = storage.getItem(STORAGE_KEYS.draft)
    render(<MemoryRouter initialEntries={['/intro']}><AppRoutes getStorage={() => storage} /></MemoryRouter>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Открыть сохранённый профиль' }), { target: { value: 'previous' } })
    expect(screen.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe(raw)
    fireEvent.click(screen.getByRole('link', { name: 'Тест' }))
    fireEvent.click(screen.getByRole('link', { name: 'Продолжить тест' }))
    expect(screen.getByRole('heading', { name: 'Ситуация 2 из 15' })).toBeVisible()
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe(raw)
  })

  it.each(['invalid', 'incompatible'])('история не позволяет молча сбросить %s черновик', (kind) => {
    const storage = memoryStorage()
    createAttemptStorage(() => storage).appendAttempt(realResult(manualSets.demoA.answers, 'previous'))
    const raw = kind === 'invalid' ? '{broken' : JSON.stringify({
      versions: { ...assessmentModule.versions, assessment: 'old' }, answers: {},
      currentQuestionId: 'Q01', updatedAt: '2026-10-17T01:00:00.000Z',
    })
    storage.setItem(STORAGE_KEYS.draft, raw)
    render(<MemoryRouter initialEntries={['/intro']}><AppRoutes getStorage={() => storage} /></MemoryRouter>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Открыть сохранённый профиль' }), { target: { value: 'previous' } })
    openTab(/^Поделиться/)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Пройти ещё раз' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe(raw)
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Пройти ещё раз' }))
    expect(screen.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
    expect(storage.getItem(STORAGE_KEYS.draft)).toBeNull()
  })
})
