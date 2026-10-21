import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { LINE } from './figure-geometry'
import styles from './figure.module.css'

/**
 * Общий «скелет» персонажей BI Academy: сетка 180×320 из простых фигур.
 * На нём собираются и 16 персонажей по тесту, и аватары, созданные сотрудником, поэтому стиль у них общий:
 * тёмная обводка, правая сторона деталей на тон темнее, фирменная спецовка со знаком BI.
 */
export const FIGURE_WIDTH = 180
export const FIGURE_HEIGHT = 320

export type HandProp = 'tablet' | 'hammer' | 'book' | null
/** Движение руки: помахать поднятой рукой, постучать инструментом, открыто покачать. */
export type ArmMotion = 'wave' | 'tap' | 'sway' | null

export interface FigureSpec {
  readonly skin: string
  readonly shirt: string
  readonly pants: string
  readonly boots: string
  readonly vest: string
  readonly stripe: string
  readonly vestOpen?: boolean
  readonly stripes?: boolean
  /** Нашивка BI на груди; по умолчанию есть у всех. */
  readonly badge?: boolean
  /** Карман с ручкой на правой стороне груди; убирается, если там рация или значок. */
  readonly pocket?: boolean
  readonly female?: boolean
  readonly sportNumber?: boolean
  readonly wide?: boolean
  readonly armLeft: number
  readonly armRight: number
  readonly propLeft?: HandProp
  readonly propRight?: HandProp
  readonly propColor?: string
  readonly armLeftMotion?: ArmMotion
  readonly armRightMotion?: ArmMotion
  /** Голова покачивается из стороны в сторону. */
  readonly headTilt?: boolean
  /** Голова кивает в такт. */
  readonly headNod?: boolean
  readonly pouch?: boolean
  readonly radio?: boolean
  /** Слой за фигурой: силуэты бригады, аура суперсилы, плащ. */
  readonly behind?: ReactNode
  readonly chest?: ReactNode
  /** За головой: хвост, грива, уши. */
  readonly backHead?: ReactNode
  readonly face?: ReactNode
  /** Поверх головы: волосы, каска, шляпа. */
  readonly top?: ReactNode
}

const TORSO = 'M52 128a24 24 0 0 1 24-24h28a24 24 0 0 1 24 24v62a10 10 0 0 1-10 10H62a10 10 0 0 1-10-10z'
const TORSO_FEMALE = 'M55 128a23 23 0 0 1 23-24h24a23 23 0 0 1 23 24v18q-5 16 3 44a10 10 0 0 1-10 10H62a10 10 0 0 1-10-10q8-28 3-44z'
const INK = '#1d2733'
/** Тень правой стороны: одна полупрозрачная заливка вместо отдельного тёмного оттенка каждого цвета. */
const SHADE = 'rgb(0 0 0 / 13%)'

/** Знак BI: тёмно-синий квадрат с белыми буквами. */
export function BiMark({ x, y, size, background = '#0a3d7a', color = '#fff' }: { readonly x: number; readonly y: number; readonly size: number; readonly background?: string; readonly color?: string }) {
  const scale = size / 20
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x={-10} y={-10} width={20} height={20} rx={4.5} fill={background} />
    <text x={0} y={4.5} textAnchor="middle" fontFamily="Tektur, Onest, 'Segoe UI', Arial, sans-serif" fontSize={12.5} fontWeight={700} letterSpacing={-0.4} fill={color}>BI</text>
  </g>
}

function Prop({ kind, x, color }: { readonly kind: HandProp; readonly x: number; readonly color: string }) {
  if (kind === 'tablet') return <g>
    <rect x={x - 7} y={180} width={34} height={42} rx={4} fill="#0a4aa0" stroke="#9bceff" strokeWidth={2} />
    <rect x={x - 2} y={188} width={24} height={2} fill="#9bceff" className={styles.scan} /><rect x={x - 2} y={195} width={17} height={2} fill="#9bceff" className={styles.scan} style={{ animationDelay: '.5s' }} />
    <BiMark x={x + 3} y={211} size={10} background="#ffd166" color="#0a3d7a" />
  </g>
  if (kind === 'hammer') return <g>
    <rect x={x + 7} y={170} width={6} height={52} rx={3} fill="#8a5a33" {...LINE} />
    <rect x={x - 6} y={216} width={32} height={12} rx={3} fill="#9aa7b6" {...LINE} />
  </g>
  if (kind === 'book') return <g>
    <rect x={x - 8} y={182} width={30} height={36} rx={3} fill={color} {...LINE} /><rect x={x - 6.7} y={183.3} width={5} height={33.4} fill="rgb(0 0 0 / 20%)" />
  </g>
  return null
}

function Arm({ x, angle, spec, prop, dark, move }: { readonly x: number; readonly angle: number; readonly spec: FigureSpec; readonly prop: HandProp | undefined; readonly dark: boolean; readonly move: ArmMotion | undefined }) {
  // Анимация на внешней группе: CSS-transform заменил бы атрибут transform с поворотом руки. --dir — наружу от тела.
  return <g className={move ? styles[move] : undefined} style={{ transformOrigin: `${x + 10}px 116px`, '--dir': dark ? -1 : 1 } as CSSProperties}><g transform={`rotate(${angle} ${x + 10} 116)`}>
    <rect x={x} y={108} width={20} height={74} rx={10} fill={spec.shirt} {...LINE} />
    <rect x={x + 12} y={112} width={6} height={62} rx={3} fill={SHADE} />
    {dark && <rect x={x + 1.3} y={109.3} width={17.4} height={71.4} rx={8.7} fill="rgb(0 0 0 / 8%)" />}
    <rect x={x + 1.3} y={168} width={17.4} height={8} fill="rgb(0 0 0 / 12%)" />
    <circle cx={x + 10} cy={188} r={10} fill={spec.skin} {...LINE} />
    <Prop kind={prop ?? null} x={x} color={spec.propColor ?? '#ffd166'} />
  </g></g>
}

function Leg({ x, angle, bootShift, spec, dark }: { readonly x: number; readonly angle: number; readonly bootShift: number; readonly spec: FigureSpec; readonly dark: boolean }) {
  return <g transform={`rotate(${angle} ${x + 13} 194)`}>
    <path d={`M${x} 194h26v94a5 5 0 0 1-5 5h-16a5 5 0 0 1-5-5z`} fill={spec.pants} {...LINE} />
    {dark && <path d={`M${x + 1.3} 195.3h23.4v92.7a4 4 0 0 1-4 4h-15.4a4 4 0 0 1-4-4z`} fill={SHADE} />}
    <path d={`M${x + bootShift} 300v-6a10 10 0 0 1 10-10h16a10 10 0 0 1 10 10v6z`} fill={spec.boots} {...LINE} />
    <rect x={x + bootShift} y={296.5} width={36} height={4} rx={2} fill="rgb(0 0 0 / 35%)" />
  </g>
}

export function Helmet({ color, tilt = 0, stickers = [] }: { readonly color: string; readonly tilt?: number; readonly stickers?: readonly string[] }) {
  return <g transform={`rotate(${tilt} 90 68)`}>
    <path d="M62 66V60a28 28 0 0 1 56 0v6z" fill={color} {...LINE} />
    <path d="M90 33.3a26.7 26.7 0 0 1 26.7 26.7v6H90z" fill="rgb(0 0 0 / 10%)" />
    <path d="M70 52q3-11 13-15" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />
    <rect x={58} y={62} width={64} height={8} rx={4} fill={color} {...LINE} />
    <rect x={59.3} y={63.3} width={61.4} height={5.4} rx={2.7} fill="rgb(0 0 0 / 12%)" />
    <BiMark x={90} y={49} size={17} />
    {stickers.map((sticker, index) => {
      const [cx, cy] = STICKER_SPOTS[index]!
      return <circle key={index} cx={cx} cy={cy} r={4} fill={sticker} {...LINE} strokeWidth={1.6} />
    })}
  </g>
}

/** Места наклеек по бокам каски: центр занят знаком BI. */
const STICKER_SPOTS = [[106, 48], [74, 48], [112, 57], [68, 57]] as const

export const Eyes = ({ y = 74.5 }: { readonly y?: number }) => <g fill={INK} className={styles.blink}><circle cx={82.5} cy={y} r={2.5} /><circle cx={97.5} cy={y} r={2.5} /></g>
export const Brows = ({ y = 67, color = '#3a2a20' }: { readonly y?: number; readonly color?: string }) => <g fill={color}>
  <rect x={77.5} y={y} width={10} height={2.6} rx={1.3} /><rect x={92.5} y={y} width={10} height={2.6} rx={1.3} />
</g>
export const Glasses = ({ y = 74.5 }: { readonly y?: number }) => <g fill="none" stroke={INK} strokeWidth={2}>
  <circle cx={82.5} cy={y} r={6.5} /><circle cx={97.5} cy={y} r={6.5} /><path d={`M89 ${y - 1}h2`} />
  <path d={`M79 ${y + 2}l5-5M94 ${y + 2}l5-5`} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" className={styles.glint} />
</g>
export const Smile = () => <path d="M83 83q7 8 14 0" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
export const FlatMouth = () => <rect x={84} y={87} width={12} height={3} rx={1.5} fill={INK} />

export function Figure({ spec, size = 320, label, x, y, className, delay = 0 }: {
  readonly spec: FigureSpec
  readonly size?: number | undefined
  readonly label?: string | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly className?: string | undefined
  /** Сдвиг фазы анимаций в секундах, чтобы соседние персонажи не двигались хором. */
  readonly delay?: number | undefined
}) {
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const clip = `torso-${uid}`, headClip = `head-${uid}`
  const torso = spec.female ? TORSO_FEMALE : TORSO
  const width = Math.round(size * FIGURE_WIDTH / FIGURE_HEIGHT)
  const badge = spec.badge ?? true
  const pocket = (spec.pocket ?? true) && !spec.radio && !spec.vestOpen && !spec.sportNumber
  return <svg viewBox={`0 0 ${FIGURE_WIDTH} ${FIGURE_HEIGHT}`} width={width} height={size} x={x} y={y} className={className ? `${styles.figure} ${className}` : styles.figure}
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false"
    style={{ display: 'block', flex: 'none', overflow: 'visible', '--fig-delay': `${-delay}s` } as CSSProperties}>
    <defs>
      <clipPath id={clip}><path d={torso} /></clipPath>
      <clipPath id={headClip}><ellipse cx={90} cy={75} rx={24} ry={25} /></clipPath>
    </defs>
    {spec.behind}
    <ellipse cx={90} cy={308} rx={48} ry={6} fill="rgb(0 0 0 / 28%)" />
    <Leg x={spec.wide ? 57 : 63} angle={spec.wide ? 5 : 0} bootShift={-6} spec={spec} dark={false} />
    <Leg x={spec.wide ? 97 : 91} angle={spec.wide ? -5 : 0} bootShift={-4} spec={spec} dark />
    <g className={styles.breathe}>
    <rect x={82} y={92} width={16} height={18} fill={spec.skin} {...LINE} />
    <rect x={83.3} y={93.3} width={13.4} height={16} fill="rgb(0 0 0 / 12%)" />
    <g clipPath={`url(#${clip})`}>
      <path d={torso} fill={spec.vestOpen ? spec.shirt : spec.vest} />
      {spec.vestOpen && <><rect x={52} y={104} width={28} height={96} fill={spec.vest} /><rect x={100} y={104} width={28} height={96} fill={spec.vest} /></>}
      {spec.stripes && (spec.vestOpen
        ? <><rect x={52} y={162} width={28} height={7} fill={spec.stripe} /><rect x={100} y={162} width={28} height={7} fill={spec.stripe} /></>
        : <><rect x={52} y={154} width={76} height={7} fill={spec.stripe} /><rect x={52} y={174} width={76} height={7} fill={spec.stripe} /></>)}
      {spec.vestOpen && <path d="M80 104v96M100 104v96" stroke="rgb(0 0 0 / 30%)" strokeWidth={2} />}
      {!spec.vestOpen && !spec.sportNumber && <rect x={89} y={120} width={2} height={72} fill="rgb(0 0 0 / 30%)" />}
      {pocket && <><rect x={104} y={128} width={16} height={14} rx={2} fill="rgb(0 0 0 / 12%)" /><rect x={108} y={124} width={3} height={10} rx={1.5} fill={spec.propColor ?? '#ffd166'} /></>}
      {spec.sportNumber && <>
        <text x={90} y={164} textAnchor="middle" fontFamily="Tektur, Onest, 'Segoe UI', Arial, sans-serif" fontSize={34} fontWeight={700} fill={spec.stripe}>7</text>
        <rect x={52} y={182} width={76} height={6} fill={spec.stripe} />
      </>}
      <rect x={94} y={100} width={40} height={104} fill={SHADE} />
    </g>
    <path d={torso} fill="none" {...LINE} />
    {badge && (spec.vestOpen ? <BiMark x={66} y={135} size={14} background="#fff" color="#0a3d7a" /> : <BiMark x={69} y={135} size={16} background="#fff" color="#0a3d7a" />)}
    {spec.chest}
    <rect x={52} y={192} width={76} height={8} rx={2} fill="#22303f" {...LINE} />
    <rect x={85} y={193} width={10} height={6} rx={1.5} fill={spec.propColor ?? '#ffd166'} />
    {spec.pouch && <rect x={56} y={196} width={20} height={22} rx={4} fill="#8a5a33" {...LINE} />}
    {spec.radio && <><rect x={114} y={108} width={3} height={14} fill="#22303f" /><rect x={106} y={120} width={12} height={22} rx={3} fill="#22303f" {...LINE} /><circle cx={115.5} cy={107} r={2.6} fill="#3fe07a" className={styles.led} /></>}
    <Arm x={38} angle={spec.armLeft} spec={spec} prop={spec.propLeft} dark={false} move={spec.armLeftMotion} />
    <Arm x={122} angle={spec.armRight} spec={spec} prop={spec.propRight} dark move={spec.armRightMotion} />
    <g className={spec.headTilt ? styles.tilt : undefined}><g className={spec.headNod ? styles.nod : undefined}>
    {spec.backHead}
    <ellipse cx={90} cy={75} rx={24} ry={25} fill={spec.skin} {...LINE} />
    <g clipPath={`url(#${headClip})`}><ellipse cx={104} cy={77} rx={20} ry={27} fill="rgb(0 0 0 / 12%)" /></g>
    {spec.face}
    {spec.top}
    </g></g>
    </g>
  </svg>
}
