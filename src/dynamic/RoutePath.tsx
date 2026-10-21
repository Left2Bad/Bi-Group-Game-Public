import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { STICKER_COLORS } from '../ui/figure-geometry'
import styles from './RoutePath.module.css'
import { useI18n } from '../i18n/context'

interface Point { readonly x: number; readonly y: number }
interface Segment { readonly key: string; readonly d: string; readonly from: Point; readonly to: Point; readonly cone: Point; readonly built: boolean; readonly blocked: boolean; readonly colors: readonly [string, string] }

const AMPLITUDE = 20
const RADIUS = 22

/** Извилистый участок между двумя точками на одной вертикали: чередующиеся изгибы влево и вправо. */
function winding(from: Point, to: Point): { d: string; middle: Point } {
  const top = from.y + RADIUS
  const bottom = to.y - RADIUS
  const length = Math.max(bottom - top, 1)
  const halves = Math.max(2, Math.round(length / 190))
  const step = length / halves
  let d = `M${from.x} ${top}`
  for (let index = 0; index < halves; index++) {
    const y = top + step * index
    const side = index % 2 === 0 ? 1 : -1
    const bend = from.x + side * AMPLITUDE * 1.3
    d += ` C${bend} ${y + step * 0.2} ${bend} ${y + step * 0.8} ${from.x} ${y + step}`
  }
  return { d, middle: { x: from.x, y: top + step * Math.floor(halves / 2) } }
}

/** Те же изгибы, что у основной дороги, но без начальной точки: продолжение уже начатого пути по вертикали x. */
function waves(x: number, top: number, bottom: number): string {
  const length = Math.max(bottom - top, 1)
  const halves = Math.max(2, Math.round(length / 190))
  const step = length / halves
  let d = ''
  for (let index = 0; index < halves; index++) {
    const y = top + step * index
    const bend = x + (index % 2 === 0 ? 1 : -1) * AMPLITUDE * 1.3
    d += ` C${bend} ${y + step * 0.2} ${bend} ${y + step * 0.8} ${x} ${y + step}`
  }
  return d
}

/**
 * Дорога маршрута слева от недель. Участок между неделями «строится» (рисуется цветом наклеек),
 * когда отмечены обе недели; если отмечена только одна, на участке стоит конус — дорожные работы.
 * Последний участок ведёт к финишу дня 30 и достраивается, когда отмечены все недели.
 */
export function RoutePath({ listRef, weeks, completed }: {
  readonly listRef: RefObject<HTMLOListElement | null>
  readonly weeks: readonly number[]
  readonly completed: readonly number[]
}) {
  const { t } = useI18n()
  const [layout, setLayout] = useState<{ points: Point[]; tops: number[]; height: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const box = list.getBoundingClientRect()
      const points = [...list.querySelectorAll<HTMLElement>('[data-route-marker]')].map((marker) => {
        const rect = marker.getBoundingClientRect()
        return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 }
      })
      const tops = [...list.children].map((item) => item.getBoundingClientRect().top - box.top)
      setLayout({ points, tops, height: box.height, width: box.width })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [listRef, weeks.length])

  if (!layout || layout.points.length !== weeks.length || weeks.length === 0) return null
  const done = weeks.map((week) => completed.includes(week))
  const color = (index: number) => STICKER_COLORS[index % STICKER_COLORS.length]!
  const finish: Point = { x: layout.points.at(-1)!.x, y: layout.height - 10 }
  const segments: Segment[] = layout.points.map((from, index) => {
    const last = index === layout.points.length - 1
    const to = last ? { x: finish.x, y: finish.y + RADIUS } : layout.points[index + 1]!
    const { d, middle } = winding(from, to)
    const built = last ? done.every(Boolean) : done[index]! && done[index + 1]!
    const blocked = !built && (last ? done[index]! : done[index] !== done[index + 1])
    return { key: `segment-${weeks[index]}`, d, from, to, cone: middle, built, blocked, colors: [color(index), last ? '#ffd166' : color(index + 1)] }
  })
  // Объезд: неделя отмечена, а предыдущая — нет. Дорога выходит из точки ближайшей отмеченной недели
  // (или из точки недели 1), по просвету уходит вправо, извилисто идёт по полосе справа от карточек
  // и возвращается к нужной неделе сверху.
  const lane = layout.width - 34
  const turn = 14
  const detours = layout.points.flatMap((to, index) => {
    if (index === 0 || !done[index] || done[index - 1]) return []
    const back = done.slice(0, index).lastIndexOf(true)
    const first = layout.points[0]!
    // Без отмеченных недель дорога выходит вверх из точки недели 1, иначе — вниз из точки отмеченной недели.
    const top = back >= 0 ? layout.tops[back + 1]! - 13 : first.y - RADIUS - turn
    const start = back >= 0
      ? `M${layout.points[back]!.x} ${layout.points[back]!.y + RADIUS} L${layout.points[back]!.x} ${top - turn} Q${layout.points[back]!.x} ${top} ${layout.points[back]!.x + turn} ${top}`
      : `M${first.x} ${first.y - RADIUS} Q${first.x} ${top} ${first.x + turn} ${top}`
    const bottom = layout.tops[index]! - 13
    const d = `${start} L${lane - turn} ${top} Q${lane} ${top} ${lane} ${top + turn}${waves(lane, top + turn, bottom - turn)}`
      + ` Q${lane} ${bottom} ${lane - turn} ${bottom} L${to.x + turn} ${bottom} Q${to.x} ${bottom} ${to.x} ${bottom + turn} L${to.x} ${to.y - RADIUS}`
    return [{ key: `detour-${weeks[index]}`, d, sign: { x: lane, y: (top + bottom) / 2 } }]
  })
  const built = segments.filter((segment) => segment.built).length
  return <svg className={styles.road} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" focusable="false"
    data-complete={built === segments.length ? '' : undefined}>
    <defs>{segments.map((segment) => <linearGradient key={segment.key} id={`route-${segment.key}`} gradientUnits="userSpaceOnUse"
      x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y}>
      <stop offset="0" stopColor={segment.colors[0]} /><stop offset="1" stopColor={segment.colors[1]} /></linearGradient>)}</defs>
    {segments.map((segment) => <g key={segment.key} data-built={segment.built ? '' : undefined}>
      <path className={styles.plan} d={segment.d} />
      <path className={styles.paved} d={segment.d} pathLength={1} stroke={`url(#route-${segment.key})`} />
      <path className={styles.dashes} d={segment.d} />
      {segment.blocked && <g className={styles.cone} transform={`translate(${segment.cone.x} ${segment.cone.y})`}>
        <path d="M-7 7 L-2 -9 L2 -9 L7 7 Z" /><path className={styles.coneStripe} d="M-4.4 0 L4.4 0 L5.3 3 L-5.3 3 Z" /><rect x="-10" y="7" width="20" height="3" rx="1.5" /></g>}
    </g>)}
    {detours.map((detour) => <g key={detour.key} className={styles.detour} data-detour>
      <path className={styles.detourRoad} d={detour.d} pathLength={1} />
      <path className={styles.detourDashes} d={detour.d} />
      <g className={styles.car}><rect x="-7" y="-5" width="14" height="10" rx="3" /><rect className={styles.carGlass} x="1" y="-3.5" width="4" height="7" rx="1" />
        <animateMotion dur="3.2s" begin="1.2s" repeatCount="indefinite" rotate="auto" path={detour.d} keyPoints="0;1" keyTimes="0;1" calcMode="linear" /></g>
      <g transform={`translate(${detour.sign.x} ${detour.sign.y})`}><g className={styles.sign}>
        <path d="M0 6 V16" /><rect x="-17" y="-6" width="34" height="12" rx="2" /><text y="3">{t('ОБЪЕЗД')}</text></g></g>
    </g>)}
    <g className={styles.finish} transform={`translate(${finish.x} ${finish.y})`}>
      <path d="M-1 0 V-26" /><path className={styles.flag} d="M0 -26 H16 L12 -21 L16 -16 H0 Z" />
    </g>
  </svg>
}
