import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { completed, skill } from '../../tests/fixtures/dynamic-attempts'
import { DynamicProfile } from './DynamicResultsPage'

const show = (props: Parameters<typeof DynamicProfile>[0]) => render(<MemoryRouter><DynamicProfile {...props} /></MemoryRouter>)

describe('профиль сотрудника: обзор и подробности', () => {
  const first = completed('a1', 1, { percent: 50, skills: [skill('work-planning', 'Планирование работ', 75), skill('contractor-management', 'Работа с подрядчиками', 50)] })
  const latest = completed('a2', 20, { percent: 50, skills: [skill('work-planning', 'Планирование работ', 25), skill('contractor-management', 'Работа с подрядчиками', 75), skill('quality-control', 'Контроль качества', 25)] })
  // Сильнейшее качество получает +30: 80%, слабейшее — 50%.
  it('обзор: сильные стороны и зоны роста, динамика навыков словами, история — в управлении результатами', () => {
    show({ attempt: latest, baseline: first, previous: first, extra: <p>История прохождений</p> })
    const strengths = screen.getByRole('region', { name: /Сильные стороны/ })
    expect(within(strengths).getByText('Вовлечённость')).toBeInTheDocument()
    const growth = screen.getByRole('region', { name: /Зоны роста/ })
    expect(within(growth).getByText('Планирование работ')).toBeInTheDocument()
    expect(within(growth).getByText('Контроль качества')).toBeInTheDocument()
    // Изменения к первому прохождению собраны во вкладке «Прогресс»; в обзоре — только ссылка на неё.
    const skills = screen.getByRole('region', { name: 'Динамика навыков' })
    expect(within(skills).queryByText(/Снизилось на/)).toBeNull()
    fireEvent.click(within(skills).getByRole('button', { name: /во вкладке «Прогресс»/ }))
    expect(screen.getByRole('tab', { name: /^Прогресс/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: /^Обзор/ }))
    expect(screen.queryByText('История прохождений')).toBeNull()
    expect(document.body.textContent).not.toMatch(/п\.п\./)
    fireEvent.click(screen.getByRole('tab', { name: /^Управление результатами/ }))
    expect(screen.getByText('История прохождений')).toBeInTheDocument()
  })
  it('обзор: без повторной диагностики объясняет, что динамики пока нет', () => {
    show({ attempt: latest, baseline: latest })
    expect(within(screen.getByRole('region', { name: 'Динамика навыков' })).getByText('Динамика появится после повторной диагностики.')).toBeInTheDocument()
  })
  it('подробно: главное сверху, недостатки, изменения словами и без истории прохождений', () => {
    show({ attempt: latest, baseline: first, previous: first, extra: <p>История прохождений</p> })
    fireEvent.click(screen.getByRole('tab', { name: /^Подробно/ }))
    expect(screen.queryByText('История прохождений')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Главное' })).toBeInTheDocument()
    expect(screen.getByText(/Самое сильное качество/)).toBeInTheDocument()
    expect(screen.getByText(/Больше всего нужно подтянуть/)).toBeInTheDocument()
    expect(screen.queryByText(/К входной оценке/)).toBeNull()
    expect(screen.getByRole('button', { name: /во вкладке «Прогресс»/ })).toBeInTheDocument()
    expect(screen.getAllByText(/^Что подтянуть:/).length).toBe(4)
    const improve = screen.getByRole('region', { name: 'Что подтянуть' })
    expect(within(improve).getByText('Контроль качества')).toBeInTheDocument()
    expect(within(improve).getAllByText('25%').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/п\.п\./)
  })
  it('прогресс: проценты к первому и серединному прохождению зелёным и красным, «новое» — для неоценённого раньше', () => {
    const middle = completed('a-mid', 10, { percent: 40, skills: [skill('work-planning', 'Планирование работ', 50)] })
    show({ attempt: latest, baseline: first, middle, progressCount: 3, previous: middle })
    fireEvent.click(screen.getByRole('tab', { name: /^Прогресс/ }))
    expect(screen.getByRole('heading', { name: 'Ваш прогресс за 19 дней' })).toBeVisible()
    expect(within(screen.getByRole('list', { name: 'Сравниваемые прохождения' })).getAllByRole('listitem').map((item) => item.querySelector('strong')!.textContent))
      .toEqual(['Первое', 'Серединное · 2-е', 'Последнее · 3-е'])
    const headline = screen.getByRole('list', { name: 'Изменение качеств к первому прохождению' })
    // Качества не изменились к первому (50% → 50%), но выросли на 10% к серединному (40% → 50%).
    expect(within(headline).getAllByText('0%')).toHaveLength(4)
    expect(within(headline).getAllByText('+10%')).toHaveLength(4)
    expect(within(headline).getAllByText('+10%')[0]!.parentElement).toHaveAttribute('data-trend', 'up')
    const skills = screen.getByRole('list', { name: 'Изменения по навыкам' })
    const planning = within(skills).getByText('Планирование работ').closest('li')!
    expect(within(planning).getByText('−50%').parentElement).toHaveAttribute('data-trend', 'down')
    expect(within(planning).getByText('Снизилось на 50 процентов', { exact: false })).toBeInTheDocument()
    expect(within(within(skills).getByText('Работа с подрядчиками').closest('li')!).getByText('+25%')).toBeInTheDocument()
    expect(within(within(skills).getByText('Контроль качества').closest('li')!).getByText('новое')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Проанализировать прогресс' })).toBeInTheDocument()
  })
  it('прогресс: после первого прохождения — точка отсчёта и дата повторного теста', () => {
    show({ attempt: latest, baseline: latest })
    fireEvent.click(screen.getByRole('tab', { name: /^Прогресс/ }))
    expect(screen.getByRole('heading', { name: 'Первое прохождение закреплено как точка отсчёта' })).toBeVisible()
    expect(screen.getByText(/Пройдите тест повторно через 30 дней, 19 ноября 2026 г\./)).toBeInTheDocument()
  })
  it('подробно: внизу тот же «Ориентир BI Academy», что видит руководитель, без вымышленных статусов', () => {
    show({ attempt: latest, baseline: first, previous: first })
    expect(screen.queryByRole('region', { name: 'Ориентир BI Academy' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^Подробно/ }))
    const academy = screen.getByRole('region', { name: 'Ориентир BI Academy' })
    expect(within(academy).getByText(/Диагностика в приложении: пройдена 20 октября 2026 г./)).toBeInTheDocument()
    expect(within(academy).getAllByText(/Внешняя система не подключена/)).toHaveLength(2)
    expect(within(academy).getByText(/KPI в приложении не ведутся/)).toBeInTheDocument()
    expect(within(academy).getAllByText(/Темы для изучения: Планирование работ/).length).toBeGreaterThan(0)
    // Блок — последний на вкладке: после ответов и плана развития.
    const sections = [...document.querySelectorAll('details, section')]
    expect(sections.at(-1)).toBe(academy)
  })
})
