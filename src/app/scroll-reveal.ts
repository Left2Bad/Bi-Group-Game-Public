import { useEffect, type RefObject } from 'react'

/**
 * Появление блоков при прокрутке на всех страницах, по мотивам AnimatedContent из React Bits
 * (distance 100, vertical, duration 0.8, power3.out, stagger 0.08, threshold 0.1), но без gsap и без обёрток:
 * эффект ставится прямо на блоки страницы, поэтому разметка и сетки страниц не меняются.
 *
 * Прячем только то, что ниже экрана, и сразу, поэтому видимое не мигает. Без IntersectionObserver
 * и при «уменьшить движение» ничего не прячется. Новые блоки (загрузка данных, смена вкладки) подхватываются наблюдателем.
 */
const DISTANCE = 100
const DURATION = 800
const STAGGER = 80
const THRESHOLD = 0.1
// Кривая, близкая к power3.out из gsap.
const EASE = 'cubic-bezier(.215, .61, .355, 1)'

/** Сетка или список из нескольких карточек: их показываем по одной, как stagger у AnimatedContent. */
function isCollection(element: Element) {
  if (element.children.length < 3) return false
  if (element.tagName === 'UL' || element.tagName === 'OL') return true
  const display = getComputedStyle(element).display
  return display === 'grid' || display === 'inline-grid'
}

/**
 * Блоки страницы: дети корня страницы (сами корни, если детей нет); у сеток и списков — их элементы.
 * Закреплённые панели (data-no-reveal) не участвуют: у края экрана наблюдатель их никогда не «увидит», и они остались бы скрытыми.
 */
export function revealTargets(main: HTMLElement): HTMLElement[] {
  return Array.from(main.children).flatMap((root) => root.children.length ? Array.from(root.children) : [root])
    .filter((block) => !block.hasAttribute('data-no-reveal'))
    .flatMap((block) => isCollection(block) ? Array.from(block.children) : [block])
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
}

export function useScrollReveal(mainRef: RefObject<HTMLElement | null>, pathname: string, enabled: boolean) {
  useEffect(() => {
    const main = mainRef.current
    if (!main || !enabled || typeof IntersectionObserver === 'undefined') return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const seen = new WeakSet<Element>()
    const hidden = new Set<HTMLElement>()
    let queue = 0
    let queueReset = 0
    const show = (element: HTMLElement) => {
      // Блоки, вошедшие в экран вместе, появляются по очереди с шагом STAGGER.
      const delay = queue++ * STAGGER
      window.clearTimeout(queueReset)
      queueReset = window.setTimeout(() => { queue = 0 }, 120)
      element.style.transition = `opacity ${DURATION}ms ${EASE} ${delay}ms, transform ${DURATION}ms ${EASE} ${delay}ms`
      element.style.opacity = ''
      element.style.transform = ''
      hidden.delete(element)
      window.setTimeout(() => { element.style.transition = '' }, DURATION + delay + 50)
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue
        observer.unobserve(entry.target)
        show(entry.target)
      }
    }, { threshold: 0, rootMargin: `0px 0px -${THRESHOLD * 100}% 0px` })

    const scan = () => {
      for (const element of revealTargets(main)) {
        if (seen.has(element)) continue
        seen.add(element)
        if (element.getBoundingClientRect().top <= window.innerHeight * (1 - THRESHOLD)) continue
        element.style.opacity = '0'
        element.style.transform = `translate3d(0, ${DISTANCE}px, 0)`
        hidden.add(element)
        observer.observe(element)
      }
    }
    scan()
    const mutations = new MutationObserver(scan)
    mutations.observe(main, { childList: true, subtree: true })
    // При печати всё должно быть видно.
    const beforePrint = () => { for (const element of [...hidden]) { observer.unobserve(element); show(element) } }
    window.addEventListener('beforeprint', beforePrint)

    return () => {
      observer.disconnect()
      mutations.disconnect()
      window.removeEventListener('beforeprint', beforePrint)
      window.clearTimeout(queueReset)
      for (const element of hidden) { element.style.opacity = ''; element.style.transform = '' }
    }
  }, [mainRef, pathname, enabled])
}
