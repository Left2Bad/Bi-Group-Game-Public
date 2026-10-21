import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import type { AnimationPlaybackControls } from 'motion/react'
import { useI18n } from '../i18n/context'
import styles from './FlipCard.module.css'

/**
 * Переворачиваемая карточка по мотивам FlipCard из React Bits (motion).
 * Отличия от оригинала: высота подстраивается под большую из сторон, корень не является кнопкой —
 * переворачивают явные кнопки-ярлыки на каждой стороне, щелчок по свободному месту карточки и перетаскивание вбок.
 * Ссылки, кнопки и раскрывающиеся блоки внутри сторон работают как обычно и карточку не переворачивают.
 */
const SLOP = { fine: 4, coarse: 8 }
const TILT_SPRING = { stiffness: 240, damping: 24, mass: 0.6 }
const LIFT_SPRING = { stiffness: 320, damping: 26 }
const FLING = 0.16
const HISTORY_MS = 90
const INTERACTIVE = 'a, button, summary, details, input, select, textarea, label'

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const snap = (deg: number) => Math.round(deg / 180) * 180
const isBack = (deg: number) => Math.abs(Math.round(deg / 180)) % 2 === 1

interface Grip { id: number; x: number; base: number; moved: boolean; slop: number; hist: { t: number; v: number }[] }

export function FlipCard({ front, back, toBackLabel, toFrontLabel, label, hintDelay, tiltMax = 6, hoverScale = 1.015, className = '', style }: {
  readonly front: ReactNode
  readonly back: ReactNode
  /** Подпись ярлыка на лицевой стороне: что откроется на обороте. */
  readonly toBackLabel: string
  readonly toFrontLabel?: string
  /** Имя карточки для читалок экрана. */
  readonly label: string
  /** Через сколько миллисекунд после появления на экране карточка «подмигнёт» — чуть повернётся и вернётся. */
  readonly hintDelay?: number | undefined
  readonly tiltMax?: number
  readonly hoverScale?: number
  readonly className?: string | undefined
  readonly style?: CSSProperties | undefined
}) {
  const { t } = useI18n()
  const backLabel = toFrontLabel ?? t('Назад')
  const reduce = useReducedMotion() ?? false
  const [shown, setShown] = useState(false)
  const [dragging, setDragging] = useState(false)
  const shownRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const frontButton = useRef<HTMLButtonElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const grip = useRef<Grip | null>(null)
  const spin = useRef<AnimationPlaybackControls | null>(null)
  const target = useRef(0)

  const turn = useMotionValue(0)
  const tiltX = useSpring(0, TILT_SPRING)
  const tiltY = useSpring(0, TILT_SPRING)
  const lift = useSpring(1, LIFT_SPRING)
  const sheen = useSpring(0, LIFT_SPRING)
  const gx = useMotionValue(50)
  const gy = useMotionValue(50)
  const sumY = useTransform([turn, tiltY], ([t, y]: number[]) => t! + y!)
  const transform = useMotionTemplate`perspective(1400px) scale(${lift}) rotateX(${tiltX}deg) rotateY(${sumY}deg)`
  const facing = useTransform(turn, (t) => Math.abs(Math.cos((t * Math.PI) / 180)))
  const spread = useTransform(facing, (f) => 0.08 + 0.92 * f)
  const shade = useTransform(facing, (f) => 0.1 + 0.9 * f * f)
  const gxPct = useMotionTemplate`${gx}%`
  const gyPct = useMotionTemplate`${gy}%`

  const settle = (to: number, velocity: number, focus: boolean) => {
    spin.current?.stop()
    target.current = to
    if (reduce) turn.jump(to)
    else spin.current = animate(turn, to, { type: 'spring', stiffness: 170, damping: 20, velocity, restDelta: 0.05 })
    const next = isBack(to)
    if (next === shownRef.current) return
    shownRef.current = next
    setShown(next)
    // Кнопка, которой перевернули, ушла на скрытую сторону: фокус переходит на ярлык новой стороны.
    if (focus) requestAnimationFrame(() => (next ? backButton : frontButton).current?.focus({ preventScroll: true }))
  }
  const flip = (focus: boolean) => {
    const base = snap(turn.get())
    settle(isBack(base) ? base - 180 : base + 180, 0, focus)
  }
  const rest = () => { tiltX.set(0); tiltY.set(0); sheen.set(0); lift.set(1) }

  useEffect(() => () => spin.current?.stop(), [])
  // Подсказка «меня можно перевернуть»: один раз, когда карточка впервые видна.
  useEffect(() => {
    const node = rootRef.current
    if (hintDelay === undefined || reduce || !node || typeof IntersectionObserver === 'undefined') return
    let timer = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      timer = window.setTimeout(() => {
        if (grip.current || target.current !== 0 || turn.get() !== 0) return
        spin.current = animate(turn, [0, 26, -6, 0], { duration: 1.1, ease: 'easeInOut' })
      }, hintDelay)
    }, { threshold: 0.6 })
    observer.observe(node)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [hintDelay, reduce, turn])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || grip.current || (event.target as Element).closest(INTERACTIVE)) return
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* указатель уже отпущен */ }
    spin.current?.stop()
    grip.current = { id: event.pointerId, x: event.clientX, base: target.current, moved: false, slop: event.pointerType === 'touch' ? SLOP.coarse : SLOP.fine, hist: [] }
    if (!reduce) lift.set(hoverScale)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = grip.current
    if (g && g.id === event.pointerId) {
      const distance = event.clientX - g.x
      if (!g.moved) {
        if (Math.abs(distance) < g.slop || reduce) return
        g.moved = true
        setDragging(true)
        tiltX.set(0); tiltY.set(0); sheen.set(0)
      }
      const deg = g.base + (distance / event.currentTarget.getBoundingClientRect().width) * 180
      turn.set(deg)
      const now = performance.now()
      g.hist.push({ t: now, v: deg })
      while (g.hist.length > 2 && now - g.hist[0]!.t > HISTORY_MS) g.hist.shift()
      return
    }
    if (reduce || event.pointerType === 'touch') return
    const box = event.currentTarget.getBoundingClientRect()
    const px = clamp((event.clientX - box.left) / box.width, 0, 1)
    const py = clamp((event.clientY - box.top) / box.height, 0, 1)
    tiltX.set((0.5 - py) * 2 * tiltMax)
    tiltY.set((px - 0.5) * 2 * tiltMax)
    gx.set(px * 100); gy.set(py * 100); sheen.set(1)
  }
  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = grip.current
    if (!g || g.id !== event.pointerId) return
    grip.current = null
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* уже отпущен */ }
    setDragging(false)
    if (event.pointerType === 'touch' || !rootRef.current?.matches(':hover')) rest()
    // Выделение текста мышью — не повод переворачивать карточку.
    if (!g.moved) {
      if (!cancelled && !window.getSelection()?.toString()) flip(false)
      else settle(target.current, 0, false)
      return
    }
    const here = turn.get()
    const first = g.hist[0]
    const last = g.hist.at(-1)
    const velocity = !cancelled && first && last && last.t > first.t && performance.now() - last.t < 60 ? ((last.v - first.v) / (last.t - first.t)) * 1000 : 0
    settle(cancelled ? snap(g.base) : clamp(snap(here + velocity * FLING), snap(here) - 180, snap(here) + 180), velocity, false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (!event.repeat) flip(true)
  }

  const chip = (side: 'front' | 'back') => <button ref={side === 'front' ? frontButton : backButton} type="button" className={styles.chip} data-side={side}
    aria-pressed={shown} aria-label={`${label}: ${side === 'front' ? toBackLabel : backLabel}`}
    onClick={(event) => { if (event.detail === 0) return; flip(true) }} onKeyDown={onKeyDown}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></svg>
    <span>{side === 'front' ? toBackLabel : backLabel}</span>
  </button>

  return <div ref={rootRef} className={`${styles.root} ${className}`} style={style} data-flipped={shown ? '' : undefined} data-dragging={dragging ? '' : undefined}
    data-fade={reduce ? (shown ? 'back' : 'front') : undefined}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(event) => release(event, false)}
    onPointerCancel={(event) => release(event, true)} onLostPointerCapture={(event) => release(event, true)}
    onPointerEnter={(event) => { if (!reduce && event.pointerType !== 'touch') lift.set(hoverScale) }}
    onPointerLeave={() => { if (!grip.current) rest() }}>
    <motion.span className={styles.shadow} aria-hidden="true" style={{ scaleX: spread, opacity: shade }} />
    <motion.div className={styles.rotor} style={(reduce ? {} : { transform, '--fc-gx': gxPct, '--fc-gy': gyPct, '--fc-sheen': sheen }) as never}>
      <div className={styles.face} data-side="front" aria-hidden={shown} inert={shown}>{front}{chip('front')}<span className={styles.glare} aria-hidden="true" /></div>
      <div className={styles.face} data-side="back" aria-hidden={!shown} inert={!shown}>{back}{chip('back')}<span className={styles.glare} aria-hidden="true" /></div>
    </motion.div>
  </div>
}
