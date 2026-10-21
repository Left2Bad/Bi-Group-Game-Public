import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { demoDevelopmentPlan, demoResult } from '../../tests/fixtures/contract-demo'
import { PrintableReport } from './PrintableReport'

it('печатает те же четыре процента, дату, действие, срок и критерий', () => {
  render(<PrintableReport result={demoResult} plan={demoDevelopmentPlan} />)
  const table = screen.getByRole('table', { name: 'Четыре независимых показателя' })
  for (const value of ['83%', '67%', '92%', '44%']) expect(within(table).getByText(value)).toBeVisible()
  expect(screen.getByText(/16 октября 2026/)).toBeVisible()
  expect(screen.getByText(demoDevelopmentPlan.recommendations[0]?.action ?? '')).toBeVisible()
  expect(screen.getByText(/7 дней/)).toBeVisible()
  expect(screen.getByText(demoDevelopmentPlan.recommendations[0]?.successCriterion ?? '')).toBeVisible()
})

it('явно сообщает, если рекомендации недоступны', () => {
  render(<PrintableReport result={demoResult} plan={null} />)
  expect(screen.getByText(/План действий пока недоступен/)).toBeVisible()
})
