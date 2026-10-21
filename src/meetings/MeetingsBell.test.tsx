import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as apiModule from '../auth/api'
import { AuthContext } from '../auth/context'
import type { AuthValue } from '../auth/context'
import { MeetingsBell } from './MeetingsBell'
import type { Meeting, MeetingsPayload } from './meetings'

const auth = (role: 'employee' | 'manager'): AuthValue => ({ enabled: true, user: { id: 'u1', name: 'Пользователь', email: 'u@example.test', role }, loading: false, error: null,
  refresh: async () => {}, login: async () => { throw new Error('unused') }, register: async () => { throw new Error('unused') }, logout: async () => {} })
const meeting = (over: Partial<Meeting>): Meeting => ({ id: 'm1', teamId: 't', teamName: 'Команда', employeeId: 'e1', employeeName: 'Иван Сотрудник', managerName: 'Анна Руководитель',
  at: new Date(Date.now() + 3 * 86_400_000).toISOString(), message: 'Обсудим результаты', status: 'pending', createdAt: new Date().toISOString(), respondedAt: null, unseen: true, ...over })
const payload = (meetings: Meeting[]): MeetingsPayload => ({ meetings, unread: meetings.filter((item) => item.unseen).length })
const show = (role: 'employee' | 'manager') => render(<AuthContext.Provider value={auth(role)}><MeetingsBell /></AuthContext.Provider>)

describe('кнопка уведомлений о беседах', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('у сотрудника показывает приглашение со счётчиком и позволяет принять его', async () => {
    const calls: string[] = []
    let answered = false
    vi.spyOn(apiModule, 'api').mockImplementation(async (path: string, options?: RequestInit) => {
      calls.push(`${options?.method ?? 'GET'} ${path}`)
      if (path === '/meetings/m1') answered = true
      return payload([meeting(answered ? { status: 'accepted', unseen: false } : {})]) as never
    })
    show('employee')
    const button = await screen.findByRole('button', { name: 'Уведомления: 1' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    const panel = screen.getByRole('region', { name: 'Уведомления' })
    expect(within(panel).getByText('Обсудим результаты')).toBeInTheDocument()
    expect(within(panel).getByText('Анна Руководитель')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /Принять приглашение/ }))
    await waitFor(() => expect(calls).toContain('PUT /meetings/m1'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Уведомления' })).toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Уведомления' })).getByText('Принято')).toBeInTheDocument()
  })

  it('у сотрудника отклонение отправляет ответ «declined», а ошибка сервера показывается', async () => {
    const bodies: unknown[] = []
    vi.spyOn(apiModule, 'api').mockImplementation(async (_path: string, options?: RequestInit) => {
      if (options?.method === 'PUT') { bodies.push(JSON.parse(String(options.body))); throw new Error('Дата встречи уже прошла.') }
      return payload([meeting({})]) as never
    })
    show('employee')
    fireEvent.click(await screen.findByRole('button', { name: 'Уведомления: 1' }))
    fireEvent.click(screen.getByRole('button', { name: /Отклонить приглашение/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Дата встречи уже прошла.'))
    expect(bodies).toEqual([{ response: 'declined' }])
  })

  it('у руководителя показывает, кто принял приглашение, и список встреч; открытие сбрасывает счётчик', async () => {
    const calls: string[] = []
    const list = [meeting({ status: 'accepted' }), meeting({ id: 'm2', employeeName: 'Пётр Другой', status: 'pending', unseen: false })]
    vi.spyOn(apiModule, 'api').mockImplementation(async (path: string, options?: RequestInit) => {
      calls.push(`${options?.method ?? 'GET'} ${path}`)
      return (path.endsWith('/seen') ? payload(list.map((item) => ({ ...item, unseen: false }))) : payload(list)) as never
    })
    show('manager')
    fireEvent.click(await screen.findByRole('button', { name: 'Уведомления: 1' }))
    const panel = screen.getByRole('region', { name: 'Уведомления' })
    const news = within(panel).getByRole('region', { name: 'Новые ответы' })
    expect(within(news).getByText('Иван Сотрудник')).toBeInTheDocument()
    expect(within(news).getByText(/приглашение принято/)).toBeInTheDocument()
    const all = within(panel).getByRole('region', { name: 'Список встреч' })
    expect(within(all).getByText('Пётр Другой')).toBeInTheDocument()
    expect(within(all).getByText('Ждёт ответа')).toBeInTheDocument()
    await waitFor(() => expect(calls).toContain('POST /manager/meetings/seen'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Уведомления' })).toBeInTheDocument())
    // Новые ответы остаются видны, пока панель открыта.
    expect(within(panel).getByRole('region', { name: 'Новые ответы' })).toBeInTheDocument()
  })

  it('без встреч сообщает об этом, а сбой сети не ломает шапку', async () => {
    vi.spyOn(apiModule, 'api').mockRejectedValue(new Error('Нет связи'))
    show('employee')
    fireEvent.click(await screen.findByRole('button', { name: 'Уведомления' }))
    expect(within(screen.getByRole('region', { name: 'Уведомления' })).getByText('Уведомлений нет.')).toBeInTheDocument()
  })
})
