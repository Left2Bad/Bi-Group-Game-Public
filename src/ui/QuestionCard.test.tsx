import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { demoQuestions } from '../../tests/fixtures/contract-demo'
import { QuestionCard } from './QuestionCard'
import { Button } from './primitives'

describe('QuestionCard', () => {
  it('keeps long Russian copy available and exposes the selected radio answer', () => {
    const question = demoQuestions[0]
    if (!question) throw new Error('Fixture question missing')
    const onSelect = vi.fn()
    render(<QuestionCard question={{ ...question,
      text: `${question.text} ${'Подробное описание строительной ситуации с длинным пояснением. '.repeat(8)}`,
      options: [
        { ...question.options[0], text: `${'Согласовать последовательность действий с коллегами до начала работ. '.repeat(4)}` },
        question.options[1], question.options[2], question.options[3],
      ] }} selectedOptionId={question.options[0].id} onSelect={onSelect} />)

    expect(screen.getByText(/Подробное описание строительной ситуации/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Согласовать последовательность действий/)).toBeChecked()
    fireEvent.click(screen.getByLabelText(/Демонстрационный вариант B/))
    expect(onSelect).toHaveBeenCalledWith(question.options[1].id)
  })

  it('supports keyboard focus and a visible disabled control state', () => {
    const question = demoQuestions[0]
    if (!question) throw new Error('Fixture question missing')
    render(<><QuestionCard question={question} selectedOptionId={null} onSelect={() => {}} />
      <Button disabled>Далее</Button></>)
    const firstOption = screen.getByLabelText(/Демонстрационный вариант A/)
    firstOption.focus()
    expect(firstOption).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()
  })
})
