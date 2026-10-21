import { useEffect, useLayoutEffect, useRef } from 'react'

/** Человек попросил систему уменьшить движение: тогда ничего не прячем и не двигаем. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Блоки с атрибутом `data-reveal` появляются, когда до них докручивают.
 *
 * Постепенное улучшение: по умолчанию всё видно (без JS, без IntersectionObserver, при «уменьшить движение»
 * и при печати). Прячем только то, что в момент открытия лежит ниже экрана, и сразу, до первой отрисовки,
 * поэтому ничего не мигает. Состояния: `hidden` → `shown`; стили лежат в HomePage.module.css.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return
    const below = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
      .filter((element) => element.getBoundingClientRect().top > window.innerHeight * 0.9)
    if (below.length === 0) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue
        entry.target.dataset.reveal = 'shown'
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' })
    for (const element of below) {
      element.dataset.reveal = 'hidden'
      observer.observe(element)
    }
    return () => {
      observer.disconnect()
      for (const element of below) element.dataset.reveal = ''
    }
  }, [])
  return ref
}

/**
 * Лёгкий параллакс первого экрана: здание и подпись чуть смещаются за курсором.
 * Записывает `--px` и `--py` (от −1 до 1) в элемент; сами смещения описаны в CSS.
 * Только для мыши и тачпада, не для касаний.
 */
export function usePointerParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof window.matchMedia !== 'function' || prefersReducedMotion()) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let frame = 0
    let pointerX = 0
    let pointerY = 0
    const apply = () => {
      frame = 0
      const box = element.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, ((pointerX - box.left) / box.width - 0.5) * 2))
      const y = Math.max(-1, Math.min(1, ((pointerY - box.top) / box.height - 0.5) * 2))
      element.style.setProperty('--px', x.toFixed(3))
      element.style.setProperty('--py', y.toFixed(3))
    }
    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX
      pointerY = event.clientY
      if (frame === 0) frame = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      element.style.setProperty('--px', '0')
      element.style.setProperty('--py', '0')
    }
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerleave', onLeave)
    return () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerleave', onLeave)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}

/**
 * Подсветка под курсором («spotlight», как у карточек 21st.dev): на ближайший элемент с `data-spot`
 * записываются `--mx` и `--my` в пикселях внутри его рамки. Сам градиент описан в CSS.
 * Подходит как обработчик `onPointerMove` на общем родителе: один слушатель на все карточки.
 */
export function trackSpotlight(event: { readonly target: EventTarget; readonly clientX: number; readonly clientY: number; readonly pointerType?: string }): void {
  if (event.pointerType === 'touch' || !(event.target instanceof Element)) return
  const spot = event.target.closest<HTMLElement>('[data-spot]')
  if (!spot) return
  const box = spot.getBoundingClientRect()
  spot.style.setProperty('--mx', `${Math.round(event.clientX - box.left)}px`)
  spot.style.setProperty('--my', `${Math.round(event.clientY - box.top)}px`)
}

/**
 * Магнитная кнопка на пружине (приём из Motion: `useSpring` с жёсткостью 200 и затуханием 18).
 * Пока курсор рядом, кнопка тянется к нему и пружинит обратно, когда он уходит.
 * Смещение пишется в `translate`, поэтому не мешает `transform` наведения. Только мышь, без «уменьшить движение».
 */
export function useMagnetic<T extends HTMLElement>(strength = 0.28, reach = 90) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof window.matchMedia !== 'function' || prefersReducedMotion()) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const stiffness = 200
    const damping = 18
    let x = 0, y = 0, vx = 0, vy = 0, targetX = 0, targetY = 0
    let frame = 0
    let last = 0
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000 || 0.016)
      last = now
      vx += (stiffness * (targetX - x) - damping * vx) * dt
      vy += (stiffness * (targetY - y) - damping * vy) * dt
      x += vx * dt
      y += vy * dt
      element.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`
      const resting = Math.abs(vx) + Math.abs(vy) < 0.05 && Math.abs(targetX - x) + Math.abs(targetY - y) < 0.05
      if (resting) { frame = 0; if (targetX === 0 && targetY === 0) element.style.translate = '' } else frame = requestAnimationFrame(step)
    }
    const wake = () => { if (frame === 0) { last = performance.now(); frame = requestAnimationFrame(step) } }
    const onMove = (event: PointerEvent) => {
      const box = element.getBoundingClientRect()
      const dx = event.clientX - (box.left + box.width / 2)
      const dy = event.clientY - (box.top + box.height / 2)
      const near = Math.abs(dx) < box.width / 2 + reach && Math.abs(dy) < box.height / 2 + reach
      targetX = near ? dx * strength : 0
      targetY = near ? dy * strength : 0
      wake()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame !== 0) cancelAnimationFrame(frame)
      element.style.translate = ''
    }
  }, [strength, reach])
  return ref
}

/** Полоса прокрутки страницы (аналог `useScroll` из Motion): пишет долю прокрутки 0–1 в `--p` элемента. */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let frame = 0
    const apply = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      element.style.setProperty('--p', (max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0).toFixed(4))
    }
    const onScroll = () => { if (frame === 0) frame = requestAnimationFrame(apply) }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}
