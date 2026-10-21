import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AVATAR } from '../domain/avatar'
import { assessmentModule } from '../app/assessment-module'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { completed, skill } from '../../tests/fixtures/dynamic-attempts'
import type { MemberCard } from './api'
import { ManagerEmployeeCard } from './ManagerEmployeeCard'

const member = { id: 'employee-1', name: 'Иван Сотрудник' }
const legacyResult = (() => {
  const calculated = assessmentModule.calculateProfile(manualSets.demoA.answers, { ...assessmentModule, attemptId: 'legacy-1', completedAt: '2026-09-01T08:00:00.000Z' })
  if (!calculated.ok) throw new Error(calculated.error.message)
  return calculated.result
})()
const show = (card: MemberCard) => render(<ManagerEmployeeCard card={card} />)

describe('карточка развития сотрудника для руководителя', () => {
  it('новая диагностика с одной попыткой: качества, навыки без данных, отметки и следующий шаг', () => {
    const latest = completed('a1', 1, { skills: [skill('work-planning', 'Планирование работ', 50)] })
    show({ member, avatar: DEFAULT_AVATAR, legacy: null, dynamic: { latest, history: [latest], marks: [{ week: 1, completedAt: '2026-10-05T10:00:00.000Z' }], comments: [] } })
    const card = screen.getByRole('region', { name: 'Карточка развития сотрудника' })
    expect(within(card).getByText('Прораб')).toBeInTheDocument()
    expect(within(card).getAllByText('Лис-стратег').length).toBeGreaterThan(0)
    expect(within(card).getByRole('img', { name: 'Критическое мышление: 60%' })).toBeInTheDocument()
    expect(within(card).getAllByText('Динамика появится после повторной диагностики.')).toHaveLength(2)
    expect(within(card).queryByText(/Общий процент/)).toBeNull()
    expect(within(card).queryByText(/Среднее четырёх качеств/)).toBeNull()
    // Навыки: оценённый — в процентах, ожидаемые для должности без свидетельства — «Недостаточно данных», а не 0%.
    const skills = within(card).getByRole('region', { name: 'Профессиональные навыки' })
    expect(within(skills).getByText('50%')).toBeInTheDocument()
    expect(within(skills).getAllByText('Недостаточно данных').length).toBeGreaterThanOrEqual(4)
    expect(within(skills).queryByText('0%')).toBeNull()
    expect(within(skills).getByText(/Проверка чтения чертежей и работы в BIG Engineering в тесте не проводилась/)).toBeInTheDocument()
    expect(within(skills).getByText(/не подтверждение квалификации/)).toBeInTheDocument()
    // Маршрут: отметка сотрудника, ближайшее действие и повторная диагностика.
    const route = within(card).getByRole('region', { name: 'Маршрут на 30 дней' })
    expect(within(route).getByText('Отмечено сотрудником: 1 из 4')).toBeInTheDocument()
    expect(within(route).getByText(/^Отмечено сотрудником 5 октября 2026/)).toBeInTheDocument()
    expect(within(route).getByText('Ближайшее невыполненное действие')).toBeInTheDocument()
    expect(within(route).getByText('Повторная диагностика')).toBeInTheDocument()
    // Ближайшая практика — и в маршруте, и как следующее действие в шапке карточки.
    expect(within(card).getAllByText('Практика 2')).toHaveLength(2)
    // Внешние этапы не получают вымышленных статусов.
    const academy = within(card).getByRole('region', { name: 'Ориентир BI Academy' })
    expect(within(academy).getAllByText(/не подключена/)).toHaveLength(2)
    expect(within(academy).getByText(/KPI в приложении не ведутся/)).toBeInTheDocument()
    // Мотивация и портрет по анкете аватара в карточке руководителя больше не показываются.
    expect(within(card).queryByText(/портрет по анкете аватара/i)).toBeNull()
    expect(within(card).queryByText('Лидерство')).toBeNull()
  })
  it('несколько сопоставимых попыток показывают входную и последнюю оценку с изменением в п.п.', () => {
    const first = completed('a1', 1, { percent: 50, skills: [skill('work-planning', 'Планирование работ', 25)] })
    const latest = completed('a2', 20, { percent: 58, skills: [skill('work-planning', 'Планирование работ', 75)] })
    show({ member, avatar: null, legacy: null, dynamic: { latest, history: [first, latest], marks: [], comments: [] } })
    expect(screen.getByRole('img', { name: 'Критическое мышление: входная 50%, последняя 58%' })).toBeInTheDocument()
    expect(screen.getAllByText('+8 п.п.')).toHaveLength(4)
    expect(screen.getByText('+50 п.п.')).toBeInTheDocument()
    expect(screen.getByText(/Входная оценка — 1 октября 2026 г., последняя — 20 октября 2026 г./)).toBeInTheDocument()
    expect(screen.getByText(/а не доказанный рост на рабочем месте/)).toBeInTheDocument()
    expect(screen.getByText('Не создан — показан персонаж по тесту')).toBeInTheDocument()
  })
  it('несопоставимые попытки не сравниваются и объясняется причина', () => {
    const latest = completed('a2', 20)
    show({ member, avatar: null, legacy: null, dynamic: { latest, history: [completed('a1', 1, { model: 'gpt-4o-mini' }), latest], marks: [], comments: [] } })
    expect(screen.queryByText(/п\.п\./)).toBeNull()
    expect(screen.getAllByText(/Сравнение невозможно: прежние попытки проведены по другой методике/)).toHaveLength(2)
  })
  it('старый результат без ID навыков показан как есть, без динамики навыков', () => {
    const latest = completed('a1', 1, { catalog: false, skills: [skill(undefined, 'Проверка документации', 75)] })
    show({ member, avatar: null, legacy: null, dynamic: { latest, history: [latest], marks: [], comments: [] } })
    expect(screen.getByText('Проверка документации')).toBeInTheDocument()
    expect(screen.queryByText('Недостаточно данных')).toBeNull()
    expect(screen.getByText(/до введения устойчивых идентификаторов навыков/)).toBeInTheDocument()
  })
  it('только прежняя методика: качества без пересчёта, без навыков и маршрута', () => {
    show({ member, avatar: DEFAULT_AVATAR, dynamic: null, legacy: { latest: legacyResult, baseline: legacyResult, count: 1 } })
    expect(screen.getByRole('note')).toHaveTextContent('Сотрудник проходил только прежнюю методику')
    expect(screen.getByRole('img', { name: `Вовлечённость: ${legacyResult.traits.engagement.percent}%` })).toBeInTheDocument()
    expect(screen.getByText('Должность не указана')).toBeInTheDocument()
    expect(screen.getByText(/Профессиональные навыки оцениваются только в новой методике/)).toBeInTheDocument()
    expect(screen.getByText('Маршрут появится после диагностики по новой методике.')).toBeInTheDocument()
    expect(screen.queryByText(/Отмечено сотрудником/)).toBeNull()
  })
  it('комментарии к неделям: показывает существующие, добавляет и удаляет свои, сообщает об ошибке', async () => {
    const latest = completed('a1', 1)
    const comments = [{ id: 'c1', week: 2, text: 'Обсудим в пятницу', managerName: 'Анна Руководитель', createdAt: '2026-10-05T10:00:00.000Z', mine: true },
      { id: 'c2', week: 2, text: 'Чужой комментарий', managerName: 'Пётр', createdAt: '2026-10-06T10:00:00.000Z', mine: false }]
    const onAdd = vi.fn().mockRejectedValueOnce(new Error('Сервер недоступен')).mockResolvedValue(undefined)
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<ManagerEmployeeCard card={{ member, avatar: null, legacy: null, dynamic: { latest, history: [latest], marks: [], comments } }} onAddComment={onAdd} onDeleteComment={onDelete} />)
    const list = screen.getByRole('list', { name: 'Комментарии руководителя к неделе 2' })
    expect(within(list).getByText('Обсудим в пятницу')).toBeInTheDocument()
    expect(within(list).getAllByRole('button', { name: 'Удалить комментарий к неделе 2' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Добавить комментарий/ })).toHaveLength(4)
    fireEvent.click(screen.getAllByRole('button', { name: /Добавить комментарий/ })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Добавить комментарий' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите текст комментария.')
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Комментарий к неделе 1/), { target: { value: 'Проверьте результат' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить комментарий' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Сервер недоступен'))
    expect(screen.getByLabelText(/Комментарий к неделе 1/)).toHaveValue('Проверьте результат')
    fireEvent.click(screen.getByRole('button', { name: 'Добавить комментарий' }))
    await waitFor(() => expect(onAdd).toHaveBeenLastCalledWith(1, 'Проверьте результат'))
    await waitFor(() => expect(screen.queryByLabelText(/Комментарий к неделе 1/)).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Удалить комментарий к неделе 2' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c1'))
  })
  it('без обработчиков форма комментария не показывается, но комментарии видны', () => {
    const latest = completed('a1', 1)
    render(<ManagerEmployeeCard card={{ member, avatar: null, legacy: null, dynamic: { latest, history: [latest], marks: [],
      comments: [{ id: 'c1', week: 1, text: 'Только чтение', managerName: 'Анна', createdAt: '2026-10-05T10:00:00.000Z', mine: true }] } }} />)
    expect(screen.getByText('Только чтение')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Добавить комментарий/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Удалить комментарий/ })).toBeNull()
  })
})
