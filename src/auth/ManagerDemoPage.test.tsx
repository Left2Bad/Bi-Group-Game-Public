import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagerDemoPage } from './ManagerDemoPage'

const show = () => render(<MemoryRouter initialEntries={['/team/demo']}><ManagerDemoPage /></MemoryRouter>)

describe('пример кабинета руководителя по действующей методике', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('лист команды: пропуск, состояния участников и без кнопок, которые обращаются к серверу', () => {
    const request = vi.spyOn(globalThis, 'fetch')
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Мои команды' })).toBeVisible()
    expect(screen.getByText('Тест прошли: 5 из 7')).toBeInTheDocument()
    expect(screen.getByLabelText('Код приглашения')).toHaveTextContent('ПРИМЕР-0003')
    expect(screen.getByText('Ожидает согласия сотрудника')).toBeInTheDocument()
    expect(screen.getByText('Тест ещё не пройден')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Скопировать код' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Убрать / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Обновить результаты' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Создать кабинет руководителя' })).toHaveAttribute('href', '/register?role=manager')
    expect(screen.getByText(/Пример: команда «Участок № 3, жилой комплекс \(пример\)» и её участники вымышленные/)).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  })

  it('карточка развития: динамика к входной оценке и комментарий руководителя только в памяти', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Результат Алексей В.' }))
    const card = screen.getByRole('region', { name: 'Карточка развития сотрудника' })
    expect(within(card).getByRole('img', { name: 'Уверенность в себе: входная 40%, последняя 52%' })).toBeInTheDocument()
    const route = within(card).getByRole('region', { name: 'Маршрут на 30 дней' })
    expect(within(route).getByText('Отмечено сотрудником: 1 из 4')).toBeInTheDocument()
    const week1 = within(route).getAllByRole('button', { name: '＋ Добавить комментарий' })[0]!
    fireEvent.click(week1)
    fireEvent.change(within(route).getByLabelText('Комментарий к неделе 1'), { target: { value: 'Отличный старт, продолжай' } })
    fireEvent.click(within(route).getByRole('button', { name: 'Добавить комментарий' }))
    await waitFor(() => expect(within(route).getByRole('list', { name: 'Комментарии руководителя к неделе 1' })).toHaveTextContent('Отличный старт, продолжай'))
    fireEvent.click(within(route).getByRole('button', { name: 'Удалить комментарий к неделе 1' }))
    await waitFor(() => expect(within(route).queryByRole('list', { name: 'Комментарии руководителя к неделе 1' })).toBeNull())
  })

  it('беседы: назначенная беседа впереди, новое приглашение появляется в списке встреч', async () => {
    show()
    fireEvent.click(screen.getByRole('tab', { name: /Качества сотрудников/ }))
    const meetings = screen.getByRole('region', { name: 'Встречи с сотрудниками' })
    expect(within(meetings).getByText('Сергей М.')).toBeInTheDocument()
    expect(within(meetings).getByText('Ждёт ответа')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Назначить беседу: Нурлан О.' }))
    fireEvent.click(within(screen.getByRole('form', { name: 'Беседа с Нурлан О.' })).getByRole('button', { name: 'Отправить приглашение' }))
    await waitFor(() => expect(within(meetings).getByText('Нурлан О.')).toBeInTheDocument())
  })
})
