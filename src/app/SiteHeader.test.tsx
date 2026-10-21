import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './routes'
import { createTestModule } from '../features/assessment/test-module'
import { memoryStorage } from '../storage/test-storage'
import { AuthContext } from '../auth/context'
import type { AuthValue } from '../auth/context'
import * as apiModule from '../auth/api'
import { SiteHeader } from './SiteHeader'

const navigation = () => within(screen.getByRole('navigation', { name: 'Основная навигация' }))

describe('шапка сайта', () => {
  it('держит в меню основные пункты, а справочные страницы убирает в «Ещё»', () => {
    render(<MemoryRouter><AppRoutes module={null} /></MemoryRouter>)
    for (const [name, href] of [['Главная', '/'], ['Тест', '/intro']] as const) {
      expect(navigation().getByRole('link', { name })).toHaveAttribute('href', href)
    }
    const more = screen.getByRole('button', { name: 'Ещё' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    for (const [name, href] of [['16 типов', '/types'], ['Пример', '/demo'], ['Команда', '/team']] as const) {
      expect(navigation().getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('закрывает «Ещё» по Escape и возвращает фокус на кнопку, а переход подсвечивает «Ещё»', () => {
    render(<MemoryRouter><AppRoutes module={null} /></MemoryRouter>)
    const more = screen.getByRole('button', { name: 'Ещё' })
    fireEvent.click(more)
    fireEvent.keyDown(navigation().getByRole('link', { name: 'Команда' }), { key: 'Escape' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveFocus()
    fireEvent.click(more)
    fireEvent.click(navigation().getByRole('link', { name: 'Команда' }))
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveAttribute('data-current', 'true')
    expect(navigation().getByRole('link', { name: 'Команда' })).toHaveAttribute('aria-current', 'page')
  })

  it('до прохождения теста показывает «Профиль» и «Маршрут» закрытыми: это не ссылки', () => {
    render(<MemoryRouter><AppRoutes module={null} /></MemoryRouter>)
    for (const name of [/^Профиль/, /^Маршрут/]) {
      const locked = navigation().getByRole('link', { name })
      expect(locked).toHaveAttribute('aria-disabled', 'true')
      expect(locked).toHaveAttribute('title', 'Откроется после прохождения теста')
      expect(locked).not.toHaveAttribute('href')
    }
    expect(navigation().getByRole('link', { name: 'Тест' })).not.toHaveAttribute('aria-disabled')
  })

  it('после завершённого теста открывает «Профиль» и «Маршрут»', () => {
    const storage = memoryStorage()
    render(<MemoryRouter initialEntries={['/assessment']}><AppRoutes module={createTestModule()} getStorage={() => storage} /></MemoryRouter>)
    for (let index = 0; index < 15; index++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант A' }))
      fireEvent.click(screen.getByRole('button', { name: index === 14 ? 'Проверить ответы' : 'Далее' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Получить профиль' }))
    expect(screen.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible()
    expect(navigation().getByRole('link', { name: 'Профиль' })).toHaveAttribute('href', '/results')
    expect(navigation().getByRole('link', { name: 'Маршрут' })).toHaveAttribute('href', '/development')
  })

  const employeeAuth: AuthValue = { enabled: true, loading: false, error: null,
    user: { id: 'server-employee', name: 'Сотрудник', email: 'employee@example.test', role: 'employee' },
    refresh: async () => {}, logout: async () => {}, login: async () => { throw new Error('unused') }, register: async () => { throw new Error('unused') } }

  it('после серверного теста открывает меню без локального результата и восстанавливает его после перезагрузки', async () => {
    const request = vi.spyOn(apiModule, 'api').mockResolvedValue({ total: 0 })
    const show = () => render(<AuthContext value={employeeAuth}><MemoryRouter>
      <SiteHeader /><Link to="/results?attempt=server-result">Завершить серверный тест</Link>
    </MemoryRouter></AuthContext>)
    const view = show()
    await waitFor(() => expect(request).toHaveBeenCalledWith('/dynamic/attempts?status=completed&limit=1&offset=0'))
    expect(navigation().getByRole('link', { name: /^Маршрут/ })).toHaveAttribute('aria-disabled', 'true')
    request.mockResolvedValue({ total: 1 })
    fireEvent.click(screen.getByRole('link', { name: 'Завершить серверный тест' }))
    await waitFor(() => expect(navigation().getByRole('link', { name: 'Маршрут' })).toHaveAttribute('href', '/development'))
    view.unmount()
    show()
    await waitFor(() => expect(navigation().getByRole('link', { name: 'Маршрут' })).toHaveAttribute('href', '/development'))
  })

  it('повторно блокирует меню после удаления серверных результатов', async () => {
    const request = vi.spyOn(apiModule, 'api').mockResolvedValue({ total: 1 })
    render(<AuthContext value={employeeAuth}><MemoryRouter><SiteHeader /></MemoryRouter></AuthContext>)
    await waitFor(() => expect(navigation().getByRole('link', { name: 'Маршрут' })).toHaveAttribute('href', '/development'))
    request.mockResolvedValue({ total: 0 })
    act(() => { window.dispatchEvent(new Event('bi-academy:attempts-changed')) })
    await waitFor(() => expect(navigation().getByRole('link', { name: /^Маршрут/ })).toHaveAttribute('aria-disabled', 'true'))
  })

  it('не переносит открытое меню результатов на другой аккаунт или из запоздавшего запроса', async () => {
    let finishOld!: (value: { total: number }) => void
    const request = vi.spyOn(apiModule, 'api').mockResolvedValue({ total: 1 })
    const tree = (auth: AuthValue) => <AuthContext value={auth}><MemoryRouter><SiteHeader /></MemoryRouter></AuthContext>
    const view = render(tree(employeeAuth))
    await waitFor(() => expect(navigation().getByRole('link', { name: 'Маршрут' })).toHaveAttribute('href', '/development'))
    request.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
    act(() => { window.dispatchEvent(new Event('focus')) })
    request.mockResolvedValue({ total: 0 })
    view.rerender(tree({ ...employeeAuth, user: { ...employeeAuth.user!, id: 'other-employee' } }))
    await act(async () => { finishOld({ total: 1 }) })
    expect(navigation().getByRole('link', { name: /^Маршрут/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('с аккаунтом показывает почту и роль, а почта и «Профиль» ведут в профиль даже до теста', async () => {
    vi.spyOn(apiModule, 'api').mockResolvedValue({ total: 0 })
    render(<AuthContext value={employeeAuth}><MemoryRouter><SiteHeader /></MemoryRouter></AuthContext>)
    expect(screen.getByRole('link', { name: 'employee@example.test' })).toHaveAttribute('href', '/results')
    expect(screen.getByText('для сотрудников')).toBeVisible()
    await waitFor(() => expect(navigation().getByRole('link', { name: 'Профиль' })).toHaveAttribute('href', '/results'))
    expect(navigation().getByRole('link', { name: /^Маршрут/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('во время теста вместо меню оставляет только выход, а после выхода меню возвращается', () => {
    const storage = memoryStorage()
    render(<MemoryRouter initialEntries={['/assessment']}><AppRoutes module={createTestModule()} getStorage={() => storage} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Ситуация 1 из 15' })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Основная навигация' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ещё' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Выйти из теста' }))
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument()
  })

  it('бургер раскрывает и закрывает меню, закрывается по Escape и после перехода', () => {
    render(<MemoryRouter><AppRoutes module={null} /></MemoryRouter>)
    const burger = screen.getByRole('button', { name: 'Открыть меню' })
    expect(burger).toHaveAttribute('aria-expanded', 'false')
    expect(burger).toHaveAttribute('aria-controls', 'site-nav')
    fireEvent.click(burger)
    expect(screen.getByRole('button', { name: 'Закрыть меню' })).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('site-nav')).toHaveAttribute('data-open', 'true')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Закрыть меню' }), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    fireEvent.click(navigation().getByRole('link', { name: 'Тест' }))
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('site-nav')).toHaveAttribute('data-open', 'false')
  })
})
