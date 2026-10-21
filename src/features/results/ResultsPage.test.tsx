import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { demoResult } from '../../../tests/fixtures/contract-demo'
import { ResultsPage } from './ResultsPage'
import { assessmentModule } from '../../app/assessment-module'
import { manualSets } from '../../../tests/fixtures/answer-sets'
import type { Answers, AssessmentResult } from '../../domain/types'
import { asAllStrengths } from '../../../tests/fixtures/high-profile'

function renderReal(answers: Answers, transform: (result: AssessmentResult) => AssessmentResult = (result) => result) {
  const calculated = assessmentModule.calculateProfile(answers, { ...assessmentModule, attemptId: 'result-view', completedAt: '2026-10-17T00:00:00.000Z' })
  if (!calculated.ok) throw new Error(calculated.error.message)
  const result = transform(calculated.result)
  render(<MemoryRouter><ResultsPage result={result} questions={assessmentModule.questions}
    plan={assessmentModule.buildRecommendations?.(result) ?? null} /></MemoryRouter>)
}

describe('ResultsPage', () => {
  it('shows the four supplied contract percentages without recalculating them', () => {
    render(<MemoryRouter><ResultsPage result={demoResult} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: /^Подробно/ }))
    expect(screen.getByRole('img', { name: 'Критическое мышление: 83%' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Уверенность в себе: 67%' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Дисциплина: 92%' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Вовлечённость: 44%' })).toBeInTheDocument()
  })

  it('показывает рабочий архетип, его код и радар четырёх качеств', () => {
    renderReal(manualSets.demoA.answers)
    const hero = screen.getByRole('region', { name: 'Рабочий архетип' })
    expect(within(hero).getByRole('heading', { name: 'Контролёр качества' })).toBeVisible()
    expect(within(hero).getByLabelText('Код архетипа АДСН')).toBeVisible()
    expect(within(hero).getByText('Сильные стороны типа')).toBeVisible()
    expect(within(hero).getByText('На что обратить внимание')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Радар профиля: Критическое мышление 75%, Уверенность в себе 57%, Дисциплина 76%, Вовлечённость 46%' })).toBeInTheDocument()
  })

  it('shows a truthful empty state when no result is supplied', () => {
    render(<MemoryRouter><ResultsPage result={null} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Сначала пройдите тест' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /%/ })).not.toBeInTheDocument()
  })

  it('раскрывает обоснования: каждая из 15 ситуаций влияет на два качества', () => {
    renderReal(manualSets.demoA.answers)
    fireEvent.click(screen.getByRole('tab', { name: /^Подробно/ }))
    const summary = screen.getByLabelText('Почему такой результат: Вовлечённость')
    fireEvent.click(summary)
    const details = summary.closest('details')
    if (!details) throw new Error('Missing details')
    const question = assessmentModule.questions.find((item) => item.id === 'Q13')
    const option = question?.options.find((item) => item.id === manualSets.demoA.answers.Q13)
    if (!option) throw new Error('Missing option')
    expect(within(details).getByText(option.text)).toBeVisible()
    expect(within(details).getByText('Свой простой сокращён, но общая задержка остаётся.')).toBeVisible()
    expect(within(details).getAllByText(/Ситуация \d+ · \d из 3 баллов/)).toHaveLength(8)
    expect(screen.getAllByText(/Ситуация \d+ · \d из 3 баллов/)).toHaveLength(30)
  })

  it('отделяет сильные стороны и приоритеты по настоящим уровням/плану C', () => {
    renderReal(manualSets.demoA.answers)
    const strengths = screen.getByRole('heading', { name: 'Сильные стороны' }).closest('section')
    if (!strengths) throw new Error('Missing strengths')
    expect(within(strengths).getByText('Критическое мышление')).toBeVisible()
    expect(within(strengths).getByText('Дисциплина')).toBeVisible()
    expect(within(strengths).queryByText('Вовлечённость')).not.toBeInTheDocument()
    const focus = screen.getByRole('heading', { name: 'Зоны роста' }).closest('section')
    if (!focus) throw new Error('Missing focus')
    expect(within(focus).getByText('Вовлечённость')).toBeVisible()
    expect(within(focus).getByText('Уверенность в себе')).toBeVisible()
    expect(within(focus).getByRole('link', { name: 'Мой маршрут развития' })).toHaveAttribute('href', '/development')
  })

  it('не выдумывает слабости, если все качества — сильные стороны', () => {
    renderReal(manualSets.demoA.answers, asAllStrengths)
    expect(screen.queryByText('Приоритет развития')).not.toBeInTheDocument()
    expect(screen.getByText(/По ответам нет выраженного приоритета развития/)).toBeVisible()
  })

  it('при ровном профиле явно говорит об отсутствии относительной опоры', () => {
    renderReal(manualSets.balanced.answers)
    expect(screen.getByText(/Показатели равны: выраженной относительной опоры/)).toBeVisible()
    expect(screen.queryByText('Сильная сторона')).not.toBeInTheDocument()
  })

  it('в среднем профиле называет относительные опоры без ярлыка сильных сторон', () => {
    renderReal(manualSets.primary.answers)
    expect(screen.getByText(/Относительные опоры — направления/)).toBeVisible()
    expect(screen.getByText(/пока не находятся в зоне сильных сторон/)).toBeVisible()
    expect(screen.queryByText('Сильная сторона')).not.toBeInTheDocument()
  })
})
