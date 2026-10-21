import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScrollReveal } from './scroll-reveal'

function Page() {
  const ref = useRef<HTMLElement>(null)
  useScrollReveal(ref, '/x', true)
  return <main ref={ref}><div><section>A</section><section>B</section>
    <nav data-no-reveal><button type="button">1</button><button type="button">2</button><button type="button">3</button></nav></div></main>
}

describe('useScrollReveal', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('прячет блоки ниже экрана и показывает их, когда до них докрутили', () => {
    let notify: IntersectionObserverCallback = () => undefined
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback }
      observe() { /* ничего */ } unobserve() { /* ничего */ } disconnect() { /* ничего */ }
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect)
    const { getByText } = render(<Page />)
    const block = getByText('A')
    expect(block.style.opacity).toBe('0')
    notify([{ isIntersecting: true, target: block } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(block.style.opacity).toBe('')
    expect(getByText('B').style.opacity).toBe('0')
    // Закреплённая панель у нижнего края не прячется: наблюдатель её бы никогда не показал.
    expect(getByText('3').style.opacity).toBe('')
  })

  it('при «уменьшить движение» ничего не прячет', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() { /* ничего */ } unobserve() { /* ничего */ } disconnect() { /* ничего */ } })
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect)
    const { getByText } = render(<Page />)
    expect(getByText('A').style.opacity).toBe('')
  })
})
