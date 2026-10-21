import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { assessmentModule } from '../../app/assessment-module'
import { manualSets } from '../../../tests/fixtures/answer-sets'
import { completed } from '../../../tests/fixtures/dynamic-attempts'
import { memberFromResult } from '../../domain/team'
import { teamMemberFromDynamic } from '../../dynamic/team-member'
import type { MeetingsControl } from '../../meetings/MeetingPlanner'
import type { Meeting } from '../../meetings/meetings'
import { TeamPage } from './TeamPage'

const TABLE = 'Проценты четырёх качеств и архетип каждого сотрудника'
const openEmployees = () => fireEvent.click(screen.getByRole('tab', { name: /Качества сотрудников/ }))

describe('TeamPage', () => {
  it('показывает сводку и радар в обзоре, а таблицу «Качества сотрудников» — в отдельном подразделе', () => {
    render(<MemoryRouter><TeamPage ownResult={null} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Профиль команды' })).toBeVisible()
    expect(screen.getByText('Зона роста команды')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Средний профиль: 8 человек' })).toBeVisible()
    expect(screen.queryByText('Пары наставничества')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: TABLE })).not.toBeInTheDocument()
    expect(screen.queryByText('Качества по сотрудникам')).not.toBeInTheDocument()
    openEmployees()
    expect(screen.getByRole('heading', { name: 'Качества сотрудников' })).toBeVisible()
    expect(within(screen.getByRole('table', { name: TABLE })).getAllByRole('row')).toHaveLength(9)
    // В примере команды нет бесед.
    expect(screen.queryByRole('columnheader', { name: 'Беседа' })).not.toBeInTheDocument()
    expect(screen.queryByText('Зона роста команды')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Добавить мой результат в команду')).not.toBeInTheDocument()
  })

  it('добавляет и убирает собственный результат', () => {
    const output = assessmentModule.calculateProfile(manualSets.demoA.answers, { ...assessmentModule, attemptId: 'own', completedAt: '2026-10-17T00:00:00.000Z' })
    if (!output.ok) throw new Error('bad')
    render(<MemoryRouter><TeamPage ownResult={output.result} /></MemoryRouter>)
    openEmployees()
    expect(within(screen.getByRole('table', { name: TABLE })).getAllByRole('row')).toHaveLength(10)
    fireEvent.click(screen.getByRole('tab', { name: /Обзор команды/ }))
    fireEvent.click(screen.getByLabelText('Добавить мой результат в команду'))
    openEmployees()
    expect(within(screen.getByRole('table', { name: TABLE })).getAllByRole('row')).toHaveLength(9)
  })

  describe('беседы с сотрудниками', () => {
    const low = teamMemberFromDynamic('low', 'Иван Низкий', completed('a1', 1, { percent: 40 }))
    const high = teamMemberFromDynamic('high', 'Анна Высокая', completed('a2', 1, { percent: 80 }))
    const old = memberFromResult('old', 'Пётр Прежний', 'Сотрудник', (() => {
      const calculated = assessmentModule.calculateProfile(manualSets.demoA.answers, { ...assessmentModule, attemptId: 'old', completedAt: '2026-09-01T00:00:00.000Z' })
      if (!calculated.ok) throw new Error('bad')
      return calculated.result
    })())
    const meeting = (over: Partial<Meeting>): Meeting => ({ id: 'm1', teamId: 't', teamName: 'Команда', employeeId: 'low', employeeName: 'Иван Низкий', managerName: 'Анна',
      at: new Date(Date.now() + 3 * 86_400_000).toISOString(), message: '', status: 'pending', createdAt: new Date().toISOString(), respondedAt: null, unseen: false, ...over })
    const control = (list: Meeting[] = [], schedule = vi.fn().mockResolvedValue(undefined)): MeetingsControl & { schedule: typeof schedule; cancel: ReturnType<typeof vi.fn> } =>
      ({ list, schedule, cancel: vi.fn().mockResolvedValue(undefined) })
    const show = (meetings: MeetingsControl) => {
      render(<MemoryRouter><TeamPage ownResult={null} actualMembers={[low, high, old]} teamName="Участок" meetings={meetings} /></MemoryRouter>)
      openEmployees()
    }

    it('кнопка назначения беседы только у сотрудников с показателем ниже нормы', () => {
      show(control())
      expect(screen.getByRole('columnheader', { name: 'Беседа' })).toBeVisible()
      expect(screen.getByRole('button', { name: 'Назначить беседу: Иван Низкий' })).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Назначить беседу: Анна Высокая' })).not.toBeInTheDocument()
    })

    it('отправляет приглашение с датой и сообщением и проверяет дату', async () => {
      const handlers = control()
      show(handlers)
      fireEvent.click(screen.getByRole('button', { name: 'Назначить беседу: Иван Низкий' }))
      const form = screen.getByRole('form', { name: 'Беседа с Иван Низкий' })
      expect(within(form).getByText(/Ниже нормы: .*40%/)).toBeInTheDocument()
      fireEvent.change(within(form).getByLabelText('Дата и время встречи'), { target: { value: '2020-01-01T10:00' } })
      fireEvent.click(within(form).getByRole('button', { name: 'Отправить приглашение' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Укажите дату и время встречи в будущем.')
      expect(handlers.schedule).not.toHaveBeenCalled()
      const future = new Date(Date.now() + 2 * 86_400_000)
      const value = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}T15:30`
      fireEvent.change(within(form).getByLabelText('Дата и время встречи'), { target: { value } })
      fireEvent.change(within(form).getByLabelText(/Сообщение сотруднику/), { target: { value: 'Обсудим дисциплину' } })
      fireEvent.click(within(form).getByRole('button', { name: 'Отправить приглашение' }))
      await waitFor(() => expect(handlers.schedule).toHaveBeenCalledWith('low', new Date(value).toISOString(), 'Обсудим дисциплину'))
      await waitFor(() => expect(screen.queryByRole('form', { name: 'Беседа с Иван Низкий' })).not.toBeInTheDocument())
    })

    it('показывает ошибку сервера и сохраняет введённое', async () => {
      const handlers = control([], vi.fn().mockRejectedValue(new Error('У сотрудника уже есть неотвеченные приглашения.')))
      show(handlers)
      fireEvent.click(screen.getByRole('button', { name: 'Назначить беседу: Иван Низкий' }))
      const form = screen.getByRole('form', { name: 'Беседа с Иван Низкий' })
      fireEvent.change(within(form).getByLabelText(/Сообщение сотруднику/), { target: { value: 'Текст' } })
      fireEvent.click(within(form).getByRole('button', { name: 'Отправить приглашение' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('У сотрудника уже есть неотвеченные приглашения.'))
      expect(within(form).getByLabelText(/Сообщение сотруднику/)).toHaveValue('Текст')
    })

    it('при действующей беседе вместо кнопки — статус, а список встреч показывает ответы и позволяет отменить', async () => {
      const handlers = control([meeting({ status: 'accepted', message: 'Обсудим результаты' }), meeting({ id: 'm2', employeeId: 'old', employeeName: 'Пётр Прежний', status: 'declined' })])
      show(handlers)
      expect(screen.queryByRole('button', { name: 'Назначить беседу: Иван Низкий' })).not.toBeInTheDocument()
      const list = screen.getByRole('region', { name: 'Встречи с сотрудниками' })
      expect(within(list).getByText('Обсудим результаты')).toBeInTheDocument()
      expect(within(list).getAllByText('Принято').length).toBeGreaterThan(0)
      expect(within(list).getByText('Отклонено')).toBeInTheDocument()
      fireEvent.click(within(list).getByRole('button', { name: 'Отменить встречу с Иван Низкий' }))
      await waitFor(() => expect(handlers.cancel).toHaveBeenCalledWith('m1'))
    })
  })
})
