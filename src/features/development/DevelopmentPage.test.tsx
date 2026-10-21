import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DevelopmentPage } from './DevelopmentPage'
import { manualSets } from '../../../tests/fixtures/answer-sets'
import { assessmentModule } from '../../app/assessment-module'
import type { Answers, AssessmentResult } from '../../domain/types'
import { asAllStrengths } from '../../../tests/fixtures/high-profile'

function planFor(answers: Answers, transform: (result: AssessmentResult) => AssessmentResult = (result) => result) {
  const calculated = assessmentModule.calculateProfile(answers, { ...assessmentModule, attemptId: 'view-test', completedAt: '2026-10-17T00:00:00.000Z' })
  if (!calculated.ok || !assessmentModule.buildRecommendations) throw new Error('No plan')
  return assessmentModule.buildRecommendations(transform(calculated.result))
}

describe('DevelopmentPage', () => {
  it('показывает настоящий план и передаёт изменение чекбокса контроллеру', () => {
    const plan = planFor(manualSets.demoA.answers)
    const onChange = vi.fn()
    const view = render(<MemoryRouter><DevelopmentPage plan={plan} completedIds={[]} onCompletedChange={onChange} /></MemoryRouter>)
    expect(within(screen.getByRole('region', { name: 'Практика: Вовлечённость' })).getByText('На ближайшей встрече предложите смежной бригаде одну конкретную помощь.')).toBeVisible()
    expect(screen.getAllByText('7 дней')).toHaveLength(2)
    expect(screen.getAllByText('Критерий выполнения')).toHaveLength(2)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Выполнено: Вовлечённость' }))
    expect(onChange).toHaveBeenCalledWith(plan.recommendations[0]?.id, true)
    view.rerender(<MemoryRouter><DevelopmentPage plan={plan} completedIds={[plan.recommendations[0]?.id ?? '']} onCompletedChange={onChange} /></MemoryRouter>)
    expect(screen.getByRole('checkbox', { name: 'Выполнено: Вовлечённость' })).toBeChecked()
    expect(screen.getByText('1 из 2')).toBeVisible()
  })

  it('при четырёх низких качествах показывает только два приоритета C', () => {
    render(<MemoryRouter><DevelopmentPage plan={planFor(manualSets.minimum.answers)} completedIds={[]} onCompletedChange={() => {}} /></MemoryRouter>)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Критическое мышление' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Вовлечённость' })).toBeVisible()
  })

  it('высокие показатели дают поддержание, без выдуманной слабости', () => {
    render(<MemoryRouter><DevelopmentPage plan={planFor(manualSets.demoA.answers, asAllStrengths)} completedIds={[]} onCompletedChange={() => {}} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Поддержите сильные стороны' })).toBeVisible()
    expect(screen.getAllByText('Поддерживающая практика')).toHaveLength(2)
    expect(screen.queryByText('Направление развития')).not.toBeInTheDocument()
  })

  it('показывает план на 30 дней с уроками и контрольной точкой', () => {
    const plan = planFor(manualSets.demoA.answers)
    render(<MemoryRouter><DevelopmentPage plan={plan} completedIds={[]} onCompletedChange={() => {}} /></MemoryRouter>)
    const roadmap = screen.getByRole('region', { name: 'План на 30 дней' })
    expect(within(roadmap).getAllByRole('listitem')).toHaveLength(4)
    expect(within(roadmap).getByText(/Урок на 5 мин: Помощь без подмены ответственности/)).toBeVisible()
    expect(within(roadmap).getByText('Контрольная точка — день 30')).toBeVisible()
    expect(within(roadmap).getByRole('link', { name: 'Пройти тест повторно' })).toHaveAttribute('href', '/intro')
  })

  it('показывает понятный возврат при недоступном плане', () => {
    render(<MemoryRouter><DevelopmentPage plan={null} completedIds={[]} onCompletedChange={() => {}} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Маршрут пока недоступен' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Вернуться к профилю' })).toHaveAttribute('href', '/results')
  })
})
