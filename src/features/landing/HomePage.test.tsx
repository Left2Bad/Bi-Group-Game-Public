import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('открывается реальной ситуацией и показывает четыре качества и 16 архетипов', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /бетон уже выехал/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Начать знакомство/ })).toHaveAttribute('href', '/intro')
    expect(screen.getByRole('heading', { name: 'Критическое мышление' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Уверенность в себе' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Дисциплина' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Вовлечённость' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Матрица архетипов по полюсам качеств' })).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Матрица архетипов по полюсам качеств' })).getByText('Главный инженер')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Посмотреть пример профиля' })).toHaveAttribute('href', '/demo')
  })

  it('без IntersectionObserver ничего не прячет: содержимое видно сразу', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<MemoryRouter><HomePage /></MemoryRouter>)
    const blocks = container.querySelectorAll<HTMLElement>('[data-reveal]')
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) expect(block.dataset.reveal).toBe('')
  })

  it('блоки ниже экрана прячутся до прокрутки и показываются, когда до них доходят', () => {
    // Счётчики тоже наблюдают за экраном, поэтому запоминаем, какой наблюдатель следит за каким блоком.
    const observed = new Map<Element, IntersectionObserverCallback>()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) { observed.set(target, this.callback) }
      unobserve() { /* ничего */ }
      disconnect() { /* ничего */ }
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000, bottom: 5200, left: 0, right: 100, width: 100, height: 200, x: 0, y: 5000, toJSON: () => ({}) })
    const { container } = render(<MemoryRouter><HomePage /></MemoryRouter>)
    const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-reveal]'))
    expect(blocks.every((block) => observed.has(block))).toBe(true)
    for (const block of blocks) expect(block.dataset.reveal).toBe('hidden')
    // Текст остаётся в разметке и доступен читалке экрана, даже пока блок визуально скрыт.
    expect(screen.getByRole('table', { name: 'Матрица архетипов по полюсам качеств' })).toBeInTheDocument()
    const [first] = blocks
    expect(first).toBeDefined()
    act(() => { observed.get(first!)?.([{ isIntersecting: true, target: first } as unknown as IntersectionObserverEntry], {} as IntersectionObserver) })
    expect(first?.dataset.reveal).toBe('shown')
    expect(blocks.slice(1).every((block) => block.dataset.reveal === 'hidden')).toBe(true)
  })

  it('при «уменьшить движение» блоки не прячутся', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() { /* ничего */ } unobserve() { /* ничего */ } disconnect() { /* ничего */ } })
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined }))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000, bottom: 5200, left: 0, right: 100, width: 100, height: 200, x: 0, y: 5000, toJSON: () => ({}) })
    const { container } = render(<MemoryRouter><HomePage /></MemoryRouter>)
    for (const block of container.querySelectorAll<HTMLElement>('[data-reveal]')) expect(block.dataset.reveal).toBe('')
  })
})
