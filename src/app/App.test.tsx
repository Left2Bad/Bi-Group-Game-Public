import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { App } from './App'

it('показывает точку входа BI Academy', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ user: null }), { status: 200 }))
  render(<App />)
  expect(await screen.findByRole('heading', { name: /бетон уже выехал/ })).toBeVisible()
})
