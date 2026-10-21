import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEMO_VERSIONS, demoDraft } from '../../../tests/fixtures/contract-demo'
import { memoryStorage } from '../../storage/test-storage'
import { STORAGE_KEYS } from '../../storage/shared'
import { AssessmentFlow } from './AssessmentFlow'
import { createAssessmentSession } from './session'
import { createTestModule } from './test-module'

describe('контроллер вопроса A (синтетический каталог, без формулы C)', () => {
  it('использует radio-группу, отключает пропуск и сохраняет выбор при возврате', () => {
    const storage = memoryStorage()
    const session = createAssessmentSession({ module: createTestModule(), getStorage: () => storage })
    render(<AssessmentFlow session={session} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getByRole('heading', { name: 'Ситуация 2 из 15' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('radio', { name: 'Демонстрационный вариант B' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант C' }))
    expect(session.getSnapshot().draft.answers.Q01).toBe('Q01-C')
  })

  it('показывает восстановленный седьмой вопрос и статус сохранения', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.draft, JSON.stringify(demoDraft))
    const session = createAssessmentSession({ module: createTestModule(), getStorage: () => storage })
    render(<AssessmentFlow session={session} onComplete={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Ситуация 7 из 15' })).toBeVisible()
    expect(screen.getByText('Ответов: 6 из 15')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Черновик сохранён')
  })

  it('не сбрасывает несовместимую версию при отмене подтверждения', () => {
    const storage = memoryStorage()
    const raw = JSON.stringify({ ...demoDraft, versions: { ...DEMO_VERSIONS, assessment: 'old' } })
    storage.setItem(STORAGE_KEYS.draft, raw)
    const session = createAssessmentSession({ module: createTestModule(), getStorage: () => storage })
    render(<AssessmentFlow session={session} onComplete={vi.fn()} />)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }))
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe(raw)
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Начать заново' }))
    expect(screen.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
  })

  it('показывает явное предупреждение о работе в памяти', () => {
    const session = createAssessmentSession({ module: createTestModule(),
      getStorage: () => { throw new Error('blocked') } })
    render(<AssessmentFlow session={session} onComplete={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Ответы остаются в памяти')
    fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант A' }))
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()
  })
})
