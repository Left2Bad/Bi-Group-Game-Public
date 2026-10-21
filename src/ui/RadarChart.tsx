import { useId } from 'react'
import type { TraitId } from '../domain/types'
import { TRAIT_IDS } from '../domain/types'
import { useI18n } from '../i18n/context'
import styles from './RadarChart.module.css'

// Широкий viewBox: по бокам нужно место для подписей «Уверенность» и «Вовлечённость».
const WIDTH = 500
const HEIGHT = 380
const CX = WIDTH / 2
const CY = HEIGHT / 2
const RADIUS = 125
/** Ровный профиль: верхняя граница, доступная всем четырём качествам сразу (методика v2). */
const BALANCED = 200 / 3

// Порядок осей по часовой стрелке с верхней: мышление, уверенность, дисциплина, вовлечённость.
const angleOf = (index: number) => -Math.PI / 2 + index * (Math.PI / 2)
const point = (index: number, value: number) => {
  const r = (RADIUS * Math.max(0, Math.min(100, value))) / 100
  return [CX + r * Math.cos(angleOf(index)), CY + r * Math.sin(angleOf(index))] as const
}
const ring = (value: number) => TRAIT_IDS.map((_, i) => point(i, value).join(',')).join(' ')

/** Однорядный радар: одна серия бренд-цвета, подписи текстовыми токенами, значения у вершин. */
export function RadarChart({ values, labels, shortLabels, tone = 'light', seriesLabel, colors, showBalanced = true, overlay, overlayLabel, overlayKey }: {
  readonly values: Readonly<Record<TraitId, number>>
  readonly labels: Readonly<Record<TraitId, string>>
  readonly shortLabels?: Readonly<Record<TraitId, string>>
  /** dark — для тёмного фона листа-чертежа. */
  readonly tone?: 'light' | 'dark'
  readonly seriesLabel?: string
  /** Цвет каждого качества: сектора фигуры, точки и значения окрашиваются, а не остаются одним оттенком. */
  readonly colors?: Readonly<Record<TraitId, string>>
  readonly showBalanced?: boolean
  /** Вторая серия поверх основной: основная затемняется, у вершин подписываются значения этой серии. */
  readonly overlay?: Readonly<Record<TraitId, number>> | null | undefined
  readonly overlayLabel?: string | undefined
  /** Смена ключа заново проигрывает появление второй серии, например при выборе другого сотрудника. */
  readonly overlayKey?: string | undefined
}) {
  const { t } = useI18n()
  const gradientId = useId()
  const summary = TRAIT_IDS.map((id) => `${labels[id]} ${Math.round(values[id])}%`).join(', ')
  const polygon = TRAIT_IDS.map((id, i) => point(i, values[id]).join(',')).join(' ')
  const shown = overlay ?? values
  return <figure className={`${styles.figure} ${tone === 'dark' ? styles.dark : ''}`} data-overlay={overlay ? '' : undefined}>
    <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={overlay && overlayLabel
      ? t('Радар профиля: {summary}', { summary }) + '. ' + `${overlayLabel}: ${TRAIT_IDS.map((id) => `${labels[id]} ${Math.round(overlay[id])}%`).join(', ')}`
      : t('Радар профиля: {summary}', { summary })}>
      <g aria-hidden="true">
        <g className={styles.base}>
        {[25, 50, 75, 100].map((value) => <polygon key={value} className={styles.grid} points={ring(value)} />)}
        {TRAIT_IDS.map((id, i) => { const [x, y] = point(i, 100); return <line key={id} className={styles.axis} x1={CX} y1={CY} x2={x} y2={y} /> })}
        {showBalanced && <polygon className={styles.balanced} points={ring(BALANCED)} />}
        {colors && <defs>{TRAIT_IDS.map((id, i) => {
          const next = (i + 1) % TRAIT_IDS.length
          const [x1, y1] = point(i, values[id])
          const [x2, y2] = point(next, values[TRAIT_IDS[next]!])
          return <linearGradient key={id} id={`${gradientId}-${i}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0" stopColor={colors[id]} stopOpacity=".62" /><stop offset="1" stopColor={colors[TRAIT_IDS[next]!]} stopOpacity=".62" />
          </linearGradient>
        })}</defs>}
        {colors ? <>
          {TRAIT_IDS.map((id, i) => {
            const next = (i + 1) % TRAIT_IDS.length
            return <polygon key={id} className={styles.wedge} fill={`url(#${gradientId}-${i})`}
              points={[[CX, CY], point(i, values[id]), point(next, values[TRAIT_IDS[next]!])].map((pair) => pair.join(',')).join(' ')} />
          })}
          <polygon className={styles.outline} points={polygon} />
        </> : <polygon className={styles.shape} points={polygon} />}
        {TRAIT_IDS.map((id, i) => {
          const [x, y] = point(i, values[id])
          return <g key={id} className={styles.vertex}>
            <circle className={styles.hit} cx={x} cy={y} r={16}><title>{`${labels[id]}: ${Math.round(values[id])}%`}</title></circle>
            {colors && <circle className={styles.halo} cx={x} cy={y} r={11} fill={colors[id]} />}
            <circle className={styles.dot} cx={x} cy={y} r={colors ? 6 : 5} style={colors ? { fill: colors[id] } : undefined} />
          </g>
        })}
        </g>
        {overlay && <g key={overlayKey} className={styles.overlay}>
          <polygon className={styles.overlayShape} points={TRAIT_IDS.map((id, i) => point(i, overlay[id]).join(',')).join(' ')} />
          {TRAIT_IDS.map((id, i) => {
            const [x, y] = point(i, overlay[id])
            const sign = Math.sign(Math.round(overlay[id]) - Math.round(values[id]))
            return <circle key={id} className={styles.overlayDot} data-sign={sign} cx={x} cy={y} r={6.5}><title>{`${labels[id]}: ${Math.round(overlay[id])}%`}</title></circle>
          })}
        </g>}
        {TRAIT_IDS.map((id, i) => {
          const [x, y] = point(i, 100)
          const dx = i === 1 ? 10 : i === 3 ? -10 : 0
          // Со второй серией у каждой подписи третья строка «команда N%», поэтому верхняя и боковые поднимаются выше.
          const dy = i === 0 ? (overlay ? -44 : -26) : i === 2 ? 22 : overlay ? -16 : -6
          const anchor = i === 1 ? 'start' : i === 3 ? 'end' : 'middle'
          return <text key={id} className={styles.label} x={x + dx} y={y + dy} textAnchor={anchor}>
            <tspan className={styles.labelName}>{(shortLabels ?? labels)[id]}</tspan>
            <tspan className={styles.labelValue} x={x + dx} dy="1.25em" style={colors && !overlay ? { fill: colors[id] } : undefined}>{Math.round(shown[id])}%</tspan>
            {overlay && <tspan className={styles.labelBase} x={x + dx} dy="1.35em">{t('команда {value}%', { value: Math.round(values[id]) })}</tspan>}
          </text>
        })}
      </g>
    </svg>
    <figcaption className={styles.legend}><span className={styles.legendShape} aria-hidden="true" />{seriesLabel}
      {overlay && overlayLabel && <><span className={styles.legendOverlay} aria-hidden="true" />{overlayLabel}</>}
      {showBalanced && <><span className={styles.legendBalanced} aria-hidden="true" />{t('ровный профиль 67%')}</>}</figcaption>
  </figure>
}
