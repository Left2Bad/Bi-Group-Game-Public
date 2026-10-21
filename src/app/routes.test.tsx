import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './routes'
import { createTestModule } from '../features/assessment/test-module'
import { clearAppData, STORAGE_KEYS } from '../storage/shared'
import { memoryStorage } from '../storage/test-storage'

describe('каркас маршрутов A', () => {
  it('переходит из главной во вводную и тест', () => {
    render(<MemoryRouter><AppRoutes /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: /Начать знакомство/ }))
    expect(screen.getByRole('heading', { name: 'Перед началом' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Начать тест' }))
    expect(screen.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
  })

  it.each(['/results', '/development', '/print'])('не показывает результат без попытки: %s', (path) => {
    render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Сначала пройдите тест' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Перейти к началу' })).toHaveAttribute('href', '/intro')
    expect(screen.queryByText('83%')).not.toBeInTheDocument()
  })

  it('обрабатывает неизвестный адрес и даёт возврат', () => {
    render(<MemoryRouter initialEntries={['/unknown']}><AppRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'На главную' }))
    expect(screen.getByRole('heading', { name: /бетон уже выехал/ })).toBeVisible()
  })
})

describe('интеграция состояния и маршрутов A', () => {
  it('продолжает на Q07 после размонтирования/загрузки из jsdom localStorage', () => {
    clearAppData()
    const module = createTestModule()
    const view = render(<MemoryRouter initialEntries={['/assessment']}><AppRoutes module={module} /></MemoryRouter>)
    for (let index = 0; index < 6; index++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант A' }))
      fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    }
    view.unmount()
    render(<MemoryRouter initialEntries={['/assessment']}><AppRoutes module={module} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Ситуация 7 из 15' })).toBeVisible()
    expect(screen.getByText('Ответов: 6 из 15')).toBeVisible()
    clearAppData()
  })

  it('после 15 ответов и явного завершения открывает защищённый маршрут', () => {
    const storage = memoryStorage()
    const module = createTestModule()
    render(<MemoryRouter initialEntries={['/assessment']}><AppRoutes module={module} getStorage={() => storage} /></MemoryRouter>)
    for (let index = 0; index < 15; index++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант A' }))
      fireEvent.click(screen.getByRole('button', { name: index === 14 ? 'Проверить ответы' : 'Далее' }))
    }
    expect(screen.getByRole('heading', { name: 'Проверьте ответы' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Получить профиль' }))
    expect(screen.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
    expect(storage.getItem(STORAGE_KEYS.draft)).toBeNull()
  })

  it('отмена удаления сохраняет данные; подтверждение удаляет только BI Academy', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.draft, 'old')
    storage.setItem('unrelated', 'keep')
    render(<MemoryRouter initialEntries={['/intro']}><AppRoutes module={null} getStorage={() => storage} /></MemoryRouter>)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Удалить мои данные' }))
    expect(storage.getItem(STORAGE_KEYS.draft)).toBe('old')
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Удалить мои данные' }))
    expect(storage.getItem(STORAGE_KEYS.draft)).toBeNull()
    expect(storage.getItem('unrelated')).toBe('keep')
    expect(screen.getByRole('status')).toHaveTextContent('Данные BI Academy удалены')
  })

  it('прямой профиль восстанавливается из завершённой попытки и даёт начать повторно', () => {
    const storage = memoryStorage()
    const module = createTestModule()
    const first = render(<MemoryRouter initialEntries={['/assessment']}><AppRoutes module={module} getStorage={() => storage} /></MemoryRouter>)
    for (let index = 0; index < 15; index++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант A' }))
      fireEvent.click(screen.getByRole('button', { name: index === 14 ? 'Проверить ответы' : 'Далее' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Получить профиль' }))
    first.unmount()
    render(<MemoryRouter initialEntries={['/results']}><AppRoutes module={module} getStorage={() => storage} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /^Поделиться/ }))
    expect(screen.getByText('Попыток в этом браузере: 1 (храним до 10).')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Исправить ответы' }))
    expect(screen.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Демонстрационный вариант A' })).toBeChecked()
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.attempts) ?? '{}').attempts).toHaveLength(1)
  })
})
