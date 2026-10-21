import { useEffect, useRef } from 'react'
import styles from './TechText.module.css'

/**
 * Надпись-чертёж на canvas по мотивам TechText из React Bits (reactbits.dev), урезанная под код архетипа:
 * вход «metrics» (сначала линии шрифта, затем буквы заливаются между ними) и пунктирный контур с жёлтой рамкой
 * у буквы под курсором. Без перетаскивания, толчков, подписей и анимации в покое: кадры рисуются, только пока что-то меняется.
 *
 * Цвета берутся из CSS-переменных `--tech-ink` и `--tech-accent` контейнера. Текст всегда лежит в разметке:
 * его видно без canvas (тесты, печать), а canvas скрыт от читалки — подпись даёт родитель.
 */

type Box = { x1: number; y1: number; x2: number; y2: number }
type Sprite = { image: HTMLCanvasElement; left: number; top: number }
type Glyph = { char: string; x: number; box: Box; outline: number; fill: Sprite; dashes: Sprite }
type Band = { y0: number; y1: number; up: boolean; order: number }
type View = { size: number; baseline: number; left: number; right: number; top: number; bottom: number; lines: number[]; bands: Band[] }

const INTRO_DELAY = 0.15
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
const approach = (current: number, target: number, dt: number, seconds: number) => current + (target - current) * (1 - Math.exp(-dt / seconds))

export function TechText({ text, fontWeight = 700, fontSize = 40, letterSpacing = 0.1, dashLength = 3, dashGap = 2, strokeWidth = 1.2, introDuration = 1.6, className }: {
  readonly text: string
  readonly fontWeight?: number
  readonly fontSize?: number
  /** Межбуквенный интервал в em. */
  readonly letterSpacing?: number
  readonly dashLength?: number
  readonly dashGap?: number
  readonly strokeWidth?: number
  readonly introDuration?: number
  readonly className?: string | undefined
}) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const probe = document.createElement('canvas').getContext('2d')
    if (!container || !canvas || !ctx || !probe || typeof ResizeObserver === 'undefined' || typeof IntersectionObserver === 'undefined') return
    container.dataset.ready = 'true'

    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 1, height = 1, dpr = 1, raf = 0, last = performance.now()
    let visible = false, alive = true, layoutKey = '', fontsReady = !document.fonts
    let view: View | null = null
    let glyphs: Glyph[] = []
    let introClock = 0
    const pointer = { x: 0, y: 0, inside: false }
    const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 }

    const colors = () => {
      const style = getComputedStyle(container)
      return { ink: style.getPropertyValue('--tech-ink').trim() || style.color, accent: style.getPropertyValue('--tech-accent').trim() || style.color }
    }
    const fontFor = (size: number) => `${fontWeight} ${size}px ${getComputedStyle(container).fontFamily || 'sans-serif'}`
    const setFont = (target: CanvasRenderingContext2D, size: number) => {
      target.font = fontFor(size)
      if ('letterSpacing' in target) target.letterSpacing = `${letterSpacing * size}px`
      target.textAlign = 'left'
      target.textBaseline = 'alphabetic'
    }

    const sprite = (layout: View, glyph: Pick<Glyph, 'char' | 'x' | 'box'>, stroke: boolean, ink: string): Sprite => {
      const pad = Math.ceil(strokeWidth * 2 + 4)
      const left = glyph.box.x1 - pad
      const top = glyph.box.y1 - pad
      const image = document.createElement('canvas')
      image.width = Math.max(1, Math.ceil((glyph.box.x2 - glyph.box.x1 + pad * 2) * dpr))
      image.height = Math.max(1, Math.ceil((glyph.box.y2 - glyph.box.y1 + pad * 2) * dpr))
      const c = image.getContext('2d')
      if (!c) return { image, left, top }
      c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr)
      setFont(c, layout.size)
      if (stroke) {
        // Обводим силуэт двойной толщиной и вырезаем заливку: остаётся только внешний пунктир.
        c.lineJoin = 'round'
        c.lineWidth = strokeWidth * 2
        c.strokeStyle = ink
        c.setLineDash([dashLength, dashGap])
        c.strokeText(glyph.char, glyph.x, layout.baseline)
        c.globalCompositeOperation = 'destination-out'
        c.fillText(glyph.char, glyph.x, layout.baseline)
      } else {
        c.fillStyle = ink
        c.fillText(glyph.char, glyph.x, layout.baseline)
      }
      return { image, left, top }
    }

    const ensureLayout = (ink: string): View => {
      const key = [text, fontFor(1), ink, width, height, dpr].join('|')
      if (key === layoutKey && view) return view
      layoutKey = key
      setFont(probe, fontSize)
      let m = probe.measureText(text)
      const fit = Math.min(1, (width * 0.96) / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1), (height * 0.66) / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1))
      const size = fontSize * fit
      setFont(probe, size)
      m = probe.measureText(text)
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
      const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
      const x = (width - inkWidth) / 2 + m.actualBoundingBoxLeft
      const baseline = (height - inkHeight) / 2 + m.actualBoundingBoxAscent
      // Код пишется заглавными: направляющие — базовая линия, высота строчных и высота прописных.
      const xHeight = baseline - probe.measureText('х').actualBoundingBoxAscent
      const capHeight = baseline - probe.measureText('Н').actualBoundingBoxAscent
      const top = baseline - m.actualBoundingBoxAscent
      const bottom = baseline + m.actualBoundingBoxDescent
      const next: View = {
        size, baseline, top, bottom, left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight,
        lines: [baseline, xHeight, capHeight],
        bands: [
          { y0: xHeight, y1: baseline, up: true, order: 0 },
          { y0: capHeight, y1: xHeight, up: true, order: 1 },
          { y0: Math.min(top, capHeight) - 2, y1: capHeight, up: true, order: 2 },
          { y0: baseline, y1: Math.max(bottom, baseline) + 2, up: false, order: 1 },
        ].filter((band) => band.y1 - band.y0 > 0.5),
      }
      view = next
      let prefix = ''
      glyphs = []
      for (const char of Array.from(text)) {
        prefix += char
        const own = probe.measureText(char)
        const gx = x + probe.measureText(prefix).width - own.width
        if (!char.trim()) continue
        const base = { char, x: gx, box: { x1: gx - own.actualBoundingBoxLeft, y1: baseline - own.actualBoundingBoxAscent, x2: gx + own.actualBoundingBoxRight, y2: baseline + own.actualBoundingBoxDescent } }
        glyphs.push({ ...base, outline: 0, fill: sprite(next, base, false, ink), dashes: sprite(next, base, true, ink) })
      }
      frame.index = -1
      return next
    }

    const glyphAt = (x: number, y: number) => {
      if (!view || y < view.top - 16 || y > view.bottom + 16) return -1
      let best = -1, bestDistance = Infinity
      glyphs.forEach((glyph, i) => {
        const d = x < glyph.box.x1 ? glyph.box.x1 - x : x > glyph.box.x2 ? x - glyph.box.x2 : 0
        if (d < bestDistance) { bestDistance = d; best = i }
      })
      return bestDistance < 12 ? best : -1
    }

    const blit = (art: Sprite) => ctx.drawImage(art.image, Math.round(art.left * dpr), Math.round(art.top * dpr))
    const crisp = (value: number) => (Math.round(value * dpr) + 0.5) / dpr

    const drawLines = (layout: View, accent: string, alpha: number, progress: number) => {
      const pad = Math.max(8, layout.size * 0.12)
      const x1 = Math.round(layout.left - pad)
      const x2 = Math.round(layout.right + pad)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.strokeStyle = accent
      ctx.fillStyle = accent
      ctx.lineWidth = 1
      layout.lines.forEach((lineY, k) => {
        const grow = smoothstep(0.02 + 0.04 * k, 0.2 + 0.04 * k, progress)
        if (grow <= 0.001) return
        const y = crisp(lineY)
        const end = x1 + (x2 - x1) * grow
        ctx.globalAlpha = alpha * 0.4
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(end, y); ctx.stroke()
        ctx.globalAlpha = alpha * 0.9
        ctx.fillRect(x1 - 1, Math.round(lineY) - 1, 3, 3)
        ctx.fillRect(Math.round(end) - 1, Math.round(lineY) - 1, 3, 3)
      })
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
    }

    // Вход «metrics»: сначала пунктирный контур, затем буква заливается полосами между направляющими.
    const drawFilling = (glyph: Glyph, lead: number, progress: number, layout: View) => {
      const art = glyph.fill
      const left = Math.floor(art.left * dpr)
      const top = Math.floor(art.top * dpr)
      const w = art.image.width + 2
      const h = art.image.height + 2
      const fill = clamp01((progress - 0.24 - 0.28 * lead) / 0.48)
      const rects: [number, number][] = []
      for (const band of layout.bands) {
        const amount = smoothstep(0.3 * band.order, 0.3 * band.order + 0.4, fill)
        if (amount <= 0) continue
        const span = (band.y1 - band.y0) * amount
        const y0 = Math.round((band.up ? band.y1 - span : band.y0) * dpr)
        const y1 = Math.round((band.up ? band.y1 : band.y0 + span) * dpr)
        if (y1 > y0) rects.push([y0, y1 - y0])
      }
      const outline = smoothstep(0.08 + 0.2 * lead, 0.22 + 0.2 * lead, progress)
      if (outline > 0.001) {
        ctx.save(); ctx.beginPath()
        ctx.rect(left - 2, top - 2, w + 2, h + 2)
        for (const [y, span] of rects) ctx.rect(left - 2, y, w + 2, span)
        ctx.clip('evenodd')
        ctx.globalAlpha = outline
        blit(glyph.dashes)
        ctx.restore()
      }
      if (rects.length) {
        ctx.save(); ctx.beginPath()
        for (const [y, span] of rects) ctx.rect(left - 2, y, w + 2, span)
        ctx.clip()
        blit(glyph.fill)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }

    const drawFrame = (accent: string) => {
      if (frame.index < 0 || frame.alpha < 0.01) return
      const x1 = crisp(frame.x1), y1 = crisp(frame.y1), x2 = crisp(frame.x2), y2 = crisp(frame.y2)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = accent
      ctx.strokeStyle = accent
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.6 * frame.alpha
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      ctx.globalAlpha = frame.alpha
      for (const [cx, cy] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as const) ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 4, 4)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
    }

    const tick = (now: number) => {
      raf = 0
      // Без анимаций всё встаёт сразу: dt большой, приближения схлопываются за один кадр.
      const dt = reducedMotion ? 10 : Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const { ink, accent } = colors()
      const layout = ensureLayout(ink)
      if (!reducedMotion && fontsReady) introClock += dt
      const progress = reducedMotion ? 1 : clamp01((introClock - INTRO_DELAY) / introDuration)
      const introducing = progress < 1

      const focus = !introducing && pointer.inside ? glyphAt(pointer.x, pointer.y) : -1
      let settling = introducing
      const target = glyphs[focus]
      if (target) {
        const box = { x1: target.box.x1 - 5, y1: target.box.y1 - 5, x2: target.box.x2 + 5, y2: target.box.y2 + 5 }
        if (frame.index < 0 || frame.alpha < 0.02) Object.assign(frame, box)
        for (const side of ['x1', 'y1', 'x2', 'y2'] as const) {
          frame[side] = approach(frame[side], box[side], dt, 0.08)
          if (Math.abs(frame[side] - box[side]) > 0.1) settling = true
        }
        frame.index = focus
      }
      const alphaTarget = target ? 1 : 0
      frame.alpha = approach(frame.alpha, alphaTarget, dt, 0.1)
      if (Math.abs(frame.alpha - alphaTarget) > 0.01) settling = true
      else frame.alpha = alphaTarget
      glyphs.forEach((glyph, i) => {
        const goal = i === focus ? 1 : 0
        glyph.outline = approach(glyph.outline, goal, dt, 0.09)
        if (Math.abs(glyph.outline - goal) > 0.002) settling = true
        else glyph.outline = goal
      })

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (introducing) drawLines(layout, accent, 1 - smoothstep(0.84, 1, progress), progress)
      glyphs.forEach((glyph, i) => {
        const lead = glyphs.length > 1 ? i / (glyphs.length - 1) : 0
        if (introducing && progress < 0.72 + 0.28 * lead) { drawFilling(glyph, lead, progress, layout); return }
        if (glyph.outline < 0.999) { ctx.globalAlpha = 1 - glyph.outline; blit(glyph.fill) }
        if (glyph.outline > 0.001) { ctx.globalAlpha = glyph.outline; blit(glyph.dashes) }
        ctx.globalAlpha = 1
      })
      drawFrame(accent)
      if (settling && visible && alive) raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (raf || !visible || !alive) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const refresh = () => { fontsReady = true; layoutKey = ''; wake() }
    const resize = () => {
      width = Math.max(1, container.clientWidth)
      height = Math.max(1, container.clientHeight)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      layoutKey = ''
      wake()
    }
    const onMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.inside = true
      wake()
    }
    const onLeave = () => { pointer.inside = false; wake() }

    container.addEventListener('pointermove', onMove, { passive: true })
    container.addEventListener('pointerenter', onMove, { passive: true })
    container.addEventListener('pointerdown', onMove, { passive: true })
    container.addEventListener('pointerleave', onLeave, { passive: true })
    container.addEventListener('pointercancel', onLeave, { passive: true })
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; wake() })
    intersectionObserver.observe(container)
    // Смена темы меняет цвета из CSS-переменных: перерисовываем буквы.
    const themeObserver = new MutationObserver(() => { layoutKey = ''; wake() })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    document.fonts?.load(fontFor(64), text).then(refresh, refresh)
    resize()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      themeObserver.disconnect()
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerenter', onMove)
      container.removeEventListener('pointerdown', onMove)
      container.removeEventListener('pointerleave', onLeave)
      container.removeEventListener('pointercancel', onLeave)
      delete container.dataset.ready
    }
  }, [text, fontWeight, fontSize, letterSpacing, dashLength, dashGap, strokeWidth, introDuration])

  return <span ref={containerRef} className={`${styles.techText} ${className ?? ''}`.trim()}>
    <span className={styles.fallback}>{text}</span>
    <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
  </span>
}
