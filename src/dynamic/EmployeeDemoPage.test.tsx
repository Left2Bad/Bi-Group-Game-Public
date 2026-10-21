import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmployeeDemoPage } from './EmployeeDemoPage'

const show = (path = '/demo') => render(<MemoryRouter initialEntries={[path]}><EmployeeDemoPage /></MemoryRouter>)

describe('пример кабинета сотрудника по действующей методике', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('показывает профиль сотрудника, как его видит сам сотрудник, без смены аватара и выгрузки', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    show()
    expect(screen.getByRole('note', { name: 'Пример с вымышленными ответами' })).toHaveTextContent('Алексей В. (прораб) — вымышленный сотрудник')
    expect(screen.getByRole('heading', { level: 1, name: 'Ваш профиль' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('tab', { name: /Управление результатами/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Сменить аватар' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Показатели профиля' })).getAllByRole('listitem')).toHaveLength(4)
    expect(within(screen.getByRole('region', { name: 'Динамика навыков' })).getByRole('button', { name: /во вкладке «Прогресс»/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /План развития на 30 дней/ })).toHaveAttribute('href', '/demo?view=route')
    fireEvent.click(screen.getByRole('tab', { name: /^Подробно/ }))
    expect(screen.getByText('Самое сильное качество —', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/^К входной оценке:/)).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  it('прогресс: «до и после» к первому прохождению, разбор ответов без кнопки запроса к модели', () => {
    show()
    fireEvent.click(screen.getByRole('tab', { name: /^Прогресс/ }))
    expect(screen.getByRole('heading', { name: 'Ваш прогресс за 31 день' })).toBeVisible()
    expect(within(screen.getByRole('list', { name: 'Сравниваемые прохождения' })).getAllByRole('listitem')).toHaveLength(2)
    expect(within(screen.getByRole('list', { name: 'Изменение качеств к первому прохождению' })).getAllByRole('listitem')).toHaveLength(4)
    const skills = screen.getByRole('list', { name: 'Изменения по навыкам' })
    expect(within(skills).getByText('Было 75% → стало 100%')).toBeInTheDocument()
    expect(within(skills).getByText('новое')).toBeInTheDocument()
    expect(screen.getByText('Ответы стали профессиональнее')).toBeInTheDocument()
    expect(screen.getByText('«Потом узнаю, что решили.»', { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Проанализировать/ })).toBeNull()
  })

  it('маршрут: отметки и наклейки меняются только в памяти, комментарий руководителя виден под неделей', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    show('/demo?view=route')
    expect(screen.getByRole('heading', { level: 1, name: 'Ваш путь на 30 дней' })).toBeVisible()
    expect(screen.getByText('Наклеек: 1 из 4')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Комментарии руководителя к неделе 2' })).getByText(/Ерлан Б\./)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Отметить выполнение' })[0]!)
    expect(screen.getByText('Наклеек: 2 из 4')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Отменить отметку' })[0]!)
    expect(screen.getByText('Наклеек: 1 из 4')).toBeInTheDocument()
    expect(screen.getByText(/В примере отметка видна только на этой странице/)).toBeInTheDocument()
    expect(write).not.toHaveBeenCalled()
  })

  it('моя команда: экран сотрудника с бригадой, руководителем и влиянием на команду', () => {
    show('/demo?view=team')
    expect(screen.getByText('Экран сотрудника')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Бригада: 5 человек' })).toBeVisible()
    expect(screen.getByText('Руководитель: Ерлан Б.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Как я влияю на бригаду' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Данные команды для системы обучения' })).toBeNull()
  })
})
