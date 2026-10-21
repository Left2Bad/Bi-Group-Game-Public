import { ARCHETYPES } from '../content/archetypes'
import { Brows, Eyes, Figure, FlatMouth, Glasses, Helmet, Smile } from './figure'
import motion from './figure.module.css'
import { LINE, STICKER_COLORS } from './figure-geometry'

const CODES = Object.keys(ARCHETYPES)
const SKIN_TONES = ['#edbe94', '#c68a5c', '#f3d0ac', '#a56c45', '#dda77b'] as const

/**
 * Один из 16 персонажей по коду теста. Каждая буква — своя деталь:
 * А/П — белая каска, очки и планшет / жёлтая каска, молоток и подсумок;
 * Р/Д — поднятая рука и широкая стойка / открытая поза и улыбка;
 * С/Г — застёгнутый жилет с молнией и карманом, каска ровно / жилет нараспашку, каска набок;
 * К/Н — рация и силуэты бригады / защитные наушники.
 * Анимации повторяют те же черты: Р машет поднятой рукой, П постукивает молотком, Д открыто покачивает руками,
 * А — блик на очках и мерцающий планшет, Г покачивает головой, К — огонёк рации и бригада «на марше», Н кивает в такт наушникам.
 */
export function ArchetypeCharacter({ code, size = 320, stickers = 0, label, x, y, ghost = 'rgb(155 206 255 / 45%)' }: {
  readonly code: string
  readonly size?: number | undefined
  /** Сколько наклеек на каске: выполненные практики плана. */
  readonly stickers?: number | undefined
  readonly label?: string | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly ghost?: string | undefined
}) {
  const [thinking, confidence, discipline, engagement] = [...code]
  const analyst = thinking === 'А', decisive = confidence === 'Р', systematic = discipline === 'С', team = engagement === 'К'
  const prop = analyst ? 'tablet' : 'hammer'
  const index = Math.max(0, CODES.indexOf(code))
  const propMotion = analyst ? (decisive ? null : 'sway') : 'tap'
  return <Figure size={size} label={label} x={x} y={y} delay={index * 0.37} spec={{
    skin: SKIN_TONES[index % SKIN_TONES.length]!, shirt: '#2f6fb8', pants: '#4a5d75', boots: '#6b4426', vest: '#f2842b', stripe: '#e6ecf3',
    vestOpen: !systematic, stripes: true, wide: decisive,
    armLeft: decisive ? 8 : 16, armRight: decisive ? -152 : -16,
    propLeft: decisive ? prop : null, propRight: decisive ? null : prop,
    armLeftMotion: decisive ? propMotion : 'sway', armRightMotion: decisive ? 'wave' : propMotion,
    headTilt: !systematic, headNod: !team,
    pouch: !analyst, radio: team,
    behind: team && <g className={motion.march} fill="none" stroke={ghost} strokeWidth={2} strokeDasharray="5 4">
      <circle cx={27} cy={113} r={15} /><rect x={4} y={132} width={46} height={120} rx={18} />
      <circle cx={153} cy={113} r={15} /><rect x={130} y={132} width={46} height={120} rx={18} />
    </g>,
    face: <><Brows /><Eyes />{analyst && <Glasses />}{decisive ? <FlatMouth /> : <Smile />}</>,
    top: <>
      {!team && <g fill="#e0563b" {...LINE}><rect x={58} y={66} width={14} height={22} rx={7} /><rect x={108} y={66} width={14} height={22} rx={7} /></g>}
      <Helmet color={analyst ? '#f5f8fc' : '#ffd166'} tilt={systematic ? 0 : -9} stickers={STICKER_COLORS.slice(0, Math.max(0, Math.min(4, stickers)))} />
    </>,
  }} />
}
