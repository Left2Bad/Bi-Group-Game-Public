import type { AvatarParams } from '../domain/avatar'
import { animalOf } from '../domain/avatar'
import { Brows, Eyes, Figure, FlatMouth, Glasses, Smile } from './figure'
import motion from './figure.module.css'
import { diamond, LINE } from './figure-geometry'

const INK = '#1d2733'

/** Четыре палитры вместо свободного цвета: герои команды не спорят друг с другом по цвету. */
const PALETTES = {
  'Яркий': { vest: '#f2842b', stripe: '#e6ecf3', shirt: '#2f6fb8', pants: '#4a5d75', badge: '#ffd166', aura: '#ffd166', auraSoft: 'rgb(255 209 102 / 12%)', anime: '#e0563b', hat: '#6c4bd1', cape: '#c2412e', boots: '#6b4426' },
  'Строгий': { vest: '#24364f', stripe: '#c9d6e5', shirt: '#e6ecf3', pants: '#2b3440', badge: '#9bceff', aura: '#c9d6e5', auraSoft: 'rgb(201 214 229 / 10%)', anime: '#1d2733', hat: '#24364f', cape: '#1a2638', boots: '#1d2733' },
  'Спокойный': { vest: '#8db59a', stripe: '#f3efe6', shirt: '#d9c7a8', pants: '#6b7a6e', badge: '#f3efe6', aura: '#cfe3c9', auraSoft: 'rgb(207 227 201 / 12%)', anime: '#8a6a4b', hat: '#6b8f78', cape: '#6b8f78', boots: '#7a5a3e' },
  'Технологичный': { vest: '#2a3644', stripe: '#3fe0d0', shirt: '#3a4d63', pants: '#1f2833', badge: '#3fe0d0', aura: '#3fe0d0', auraSoft: 'rgb(63 224 208 / 10%)', anime: '#3fe0d0', hat: '#2a3644', cape: '#15202c', boots: '#111a24' },
} as const

const FUR = { 'Лис': '#e8742a', 'Лев': '#e9a94f', 'Бобр': '#8a5a33', 'Сова': '#8c7a66' } as const
const ARMS = { 'Лидер': [8, -152], 'Стратег': [16, -16], 'Мастер': [16, -16], 'Наставник': [30, -30] } as const
/** Движения по роли: лидер машет поднятой рукой, мастер стучит молотком, наставник открыто разводит руками. */
const ARM_MOTION = { 'Лидер': [null, 'wave'], 'Стратег': [null, null], 'Мастер': [null, 'tap'], 'Наставник': ['sway', 'sway'] } as const

/** Аватар, созданный сотрудником: те же пропорции, спецовка BI, обводка и правила, что у 16 персонажей по тесту. */
export function AvatarFigure({ params, size = 320, label, x, y }: { readonly params: AvatarParams; readonly size?: number | undefined; readonly label?: string | undefined; readonly x?: number | undefined; readonly y?: number | undefined }) {
  const palette = PALETTES[params.palette]
  const animal = params.universe === 'Животные' ? animalOf(params) : null
  const human = animal === null
  const owl = animal === 'Сова'
  const skin = animal ? FUR[animal] : params.skin
  const hair = params.universe === 'Аниме' ? palette.anime : '#3a2a20'
  const female = params.gender === 'Женский'
  const [armLeft, armRight] = ARMS[params.role]
  const [armLeftMotion, armRightMotion] = ARM_MOTION[params.role]
  const aura = palette.aura

  const behind = <>
    {params.power === 'Точность' && <g fill="none" stroke={aura} strokeWidth={2}>
      <circle cx={90} cy={140} r={69} strokeDasharray="6 4" className={motion.spin} /><circle cx={90} cy={140} r={44} opacity={0.5} className={motion.pulse} />
    </g>}
    {params.power === 'Скорость' && <g fill={aura} className={motion.streak}>
      <rect x={0} y={150} width={34} height={4} rx={2} /><rect x={10} y={170} width={26} height={4} rx={2} /><rect x={2} y={190} width={36} height={4} rx={2} />
      <rect x={146} y={160} width={30} height={4} rx={2} /><rect x={150} y={180} width={22} height={4} rx={2} />
    </g>}
    {params.power === 'Надёжность' && <path d="M28 116a24 24 0 0 1 24-24h76a24 24 0 0 1 24 24v84a62 62 0 0 1-124 0z" fill={palette.auraSoft} stroke={aura} strokeWidth={2} className={motion.pulse} />}
    {params.power === 'Креатив' && <g fill={aura} className={motion.twinkle}>
      <polygon points={diamond(33, 83, 8)} /><polygon points={diamond(150, 100, 6)} /><polygon points={diamond(24, 176, 6)} /><polygon points={diamond(158, 196, 8.5)} />
    </g>}
    {params.action === 'Ищу нестандарт' && <g>
      <circle cx={137} cy={23} r={14} fill="rgb(255 209 102 / 25%)" className={motion.glow} /><circle cx={137} cy={23} r={9} fill="#ffd166" />
      <rect x={133} y={32} width={8} height={6} rx={1} fill="#9aa7b6" />
    </g>}
    {params.universe === 'Фэнтези' && <rect x={44} y={104} width={92} height={160} rx={18} fill={palette.cape} {...LINE} />}
  </>

  const chest = <g fill={palette.badge}>
    {params.motivation === 'Результат' && <><circle cx={69} cy={115} r={6.5} fill="none" stroke={palette.badge} strokeWidth={3} /><circle cx={69} cy={115} r={2} /></>}
    {params.motivation === 'Признание' && <polygon points={diamond(69, 115, 8.5)} />}
    {params.motivation === 'Развитие' && <polygon points="61,122 77,122 69,108" />}
    {params.motivation === 'Команда' && <><circle cx={65} cy={115} r={5} /><circle cx={73} cy={115} r={5} opacity={0.7} /></>}
  </g>

  const gender = params.gender
  const male = gender === 'Мужской', neutral = gender === 'Нейтральный'
  const look = human ? `${params.universe}:${gender}` : null
  const cap = <path d="M64 66V60q0-14 26-14t26 14v6z" fill={hair} {...LINE} />
  // Ресницы — короткие штрихи у внешних уголков глаз.
  const lashes = (y: number, spread: number) => <path d={`M${90 - spread} ${y}l-3.6-1.2M${90 - spread} ${y}l-2.4-3.2M${90 + spread} ${y}l3.6-1.2M${90 + spread} ${y}l2.4-3.2`} stroke={INK} strokeWidth={1.5} strokeLinecap="round" />

  // За головой: длинные волосы, хвосты, уши. Своя причёска на каждое сочетание вселенной и пола.
  const backHead = <>
    {look === 'Кино:Женский' && <path d="M63 58q-9 40-2 60q8 4 18 0l3-24h16l3 24q10 4 18 0q7-20-2-60z" fill={hair} {...LINE} />}
    {look === 'Аниме:Женский' && <>
      <g transform="rotate(16 62 60)"><rect x={48} y={58} width={16} height={60} rx={8} fill={hair} {...LINE} /></g>
      <g transform="rotate(-16 118 60)"><rect x={116} y={58} width={16} height={60} rx={8} fill={hair} {...LINE} /></g>
    </>}
    {look === 'Спорт:Женский' && <g transform="rotate(-38 110 50)"><rect x={102} y={14} width={17} height={42} rx={8.5} fill={hair} {...LINE} /></g>}
    {look === 'Спорт:Нейтральный' && <g transform="rotate(18 116 52)"><rect x={104} y={48} width={30} height={7} rx={3.5} fill={palette.vest} {...LINE} /></g>}
    {look === 'Фэнтези:Женский' && <g fill={hair} {...LINE}><rect x={59} y={58} width={14} height={64} rx={7} /><rect x={107} y={58} width={14} height={64} rx={7} /></g>}
    {look === 'Фэнтези:Нейтральный' && <g fill={skin} {...LINE}><path d="M68 70L52 58l8 22z" /><path d="M112 70l16-12-8 22z" /></g>}
    {animal === 'Лев' && !female && <ellipse cx={90} cy={75} rx={neutral ? 34 : 40} ry={neutral ? 35 : 41} fill="#b8681f" {...LINE} />}
    {(animal === 'Лев' || animal === 'Бобр') && <g fill={animal === 'Лев' ? '#d99a3e' : '#6e4426'} {...LINE}><circle cx={71} cy={55} r={7} /><circle cx={109} cy={55} r={7} /></g>}
    {animal === 'Лис' && <g fill={skin} {...LINE}><polygon points="66,56 84,56 75,36" /><polygon points="96,56 114,56 105,36" className={motion.twitch} /></g>}
  </>

  const face = <>
    {animal && !owl && <><ellipse cx={90} cy={88} rx={14} ry={9} fill={animal === 'Лис' ? '#fff6ec' : animal === 'Лев' ? '#f6d9a0' : '#c9a27e'} /><rect x={87} y={80} width={7} height={5} rx={2.5} fill={INK} /></>}
    {animal === 'Бобр' && <rect x={86} y={95} width={9} height={7} rx={1} fill="#fff" />}
    {owl && <>
      <g fill="#f5f8fc"><circle cx={79.5} cy={70.5} r={9.5} /><circle cx={100.5} cy={70.5} r={9.5} /></g>
      <g fill={INK} className={motion.blink}><circle cx={79.5} cy={70.5} r={3.5} /><circle cx={100.5} cy={70.5} r={3.5} /></g>
      <polygon points={diamond(90, 86, 5.7)} fill="#f2842b" />
    </>}
    {look === 'Фэнтези:Мужской' && <path d="M68 82q2 34 22 50q20-16 22-50q-8 10-22 10t-22-10z" fill="#d6dbe2" {...LINE} />}
    {params.universe === 'Аниме' && <g className={motion.blink}>
      <ellipse cx={81} cy={71.5} rx={6} ry={7.5} fill={INK} /><ellipse cx={99} cy={71.5} rx={6} ry={7.5} fill={INK} />
      <circle cx={79.5} cy={68.5} r={2.5} fill="#fff" /><circle cx={97.5} cy={68.5} r={2.5} fill="#fff" />
    </g>}
    {human && params.universe !== 'Кино' && <Brows y={66.5} color={look === 'Фэнтези:Мужской' ? '#9aa3ae' : hair} />}
    {params.universe !== 'Аниме' && params.universe !== 'Кино' && !owl && <Eyes y={72.5} />}
    {female && params.universe !== 'Кино' && (owl ? lashes(65, 19) : params.universe === 'Аниме' ? lashes(68, 14.5) : lashes(72, 10))}
    {!owl && (params.role === 'Лидер' ? <FlatMouth /> : <Smile />)}
    {params.action === 'Анализирую' && params.universe !== 'Кино' && !owl && <Glasses y={72.5} />}
    {params.action === 'Анализирую' && owl && <g fill="none" stroke={INK} strokeWidth={2}><circle cx={79.5} cy={70.5} r={11.5} /><circle cx={100.5} cy={70.5} r={11.5} /></g>}
    {params.universe === 'Кино' && <g fill="#111a24"><rect x={74} y={67} width={15} height={10} rx={3} /><rect x={91} y={67} width={15} height={10} rx={3} /><rect x={88} y={69} width={4} height={2} /></g>}
    {animal && male && <polygon points="76,97 104,97 90,112" fill={palette.stripe} {...LINE} />}
  </>

  const top = <>
    {look === 'Кино:Мужской' && <>{cap}<rect x={82} y={38} width={32} height={16} rx={8} fill={hair} transform="rotate(-12 98 46)" {...LINE} /></>}
    {look === 'Кино:Женский' && <>{cap}<path d="M64 64q8-22 40-14q-20 2-30 20z" fill={hair} {...LINE} /></>}
    {look === 'Кино:Нейтральный' && <>{cap}<path d="M62 60q-4 22 2 34h10q-4-16-2-34zM118 60q4 22-2 34h-10q4-16 2-34z" fill={hair} {...LINE} /><path d="M64 66q4-16 26-16q-6 6-8 16z" fill={hair} {...LINE} /></>}
    {look === 'Аниме:Мужской' && <g fill={hair} {...LINE}>
      <polygon points="62,54 82,54 72,30" transform="rotate(-18 72 42)" /><polygon points="80,50 100,50 90,24" /><polygon points="98,54 118,54 108,30" transform="rotate(18 108 42)" />
    </g>}
    {look === 'Аниме:Женский' && <>{cap}<g fill={hair} {...LINE}><polygon points="66,62 82,58 72,72" /><polygon points="80,58 98,58 88,74" /><polygon points="96,58 114,62 106,72" /></g>
      <g fill={palette.badge} {...LINE} strokeWidth={1.6}><circle cx={64} cy={58} r={5} /><circle cx={116} cy={58} r={5} /></g></>}
    {look === 'Аниме:Нейтральный' && <g fill={hair} {...LINE}>
      <polygon points="60,62 74,50 66,34" /><polygon points="70,54 88,50 80,30" /><polygon points="84,50 102,50 96,28" /><polygon points="98,52 116,56 114,34" />
      <path d="M64 66V58q0-12 26-12t26 12v8z" /><path d="M110 58q8 16 2 36l-6-30z" />
    </g>}
    {look === 'Спорт:Мужской' && <path d="M66 64V60q0-12 24-12t24 12v4z" fill={hair} {...LINE} />}
    {look === 'Спорт:Женский' && cap}
    {params.universe === 'Спорт' && !neutral && <rect x={65} y={58} width={50} height={7} rx={3} fill={palette.stripe} {...LINE} />}
    {look === 'Спорт:Нейтральный' && <><path d="M64 64q0-20 26-20t26 20z" fill={palette.vest} {...LINE} /><rect x={83} y={56} width={14} height={6} rx={3} fill={skin} /><path d="M90 44v12" stroke="rgb(0 0 0 / 25%)" strokeWidth={2} /></>}
    {(look === 'Фэнтези:Мужской' || look === 'Фэнтези:Женский') && cap}
    {look === 'Фэнтези:Нейтральный' && <>{cap}<g fill={hair} {...LINE}><rect x={63} y={58} width={8} height={30} rx={4} /><rect x={109} y={58} width={8} height={30} rx={4} /></g></>}
    {owl && <g fill={skin} {...LINE}><polygon points="66,56 80,56 73,40" transform="rotate(-20 73 48)" /><polygon points="100,56 114,56 107,40" transform="rotate(20 107 48)" /></g>}
    {params.universe === 'Фэнтези' && <g>
      <polygon points="60,54 120,54 90,-8" fill={palette.hat} {...LINE} /><rect x={54} y={50} width={72} height={9} rx={4.5} fill={palette.hat} {...LINE} />
      <g className={motion.twinkle}><polygon points={diamond(89, 31, 7)} fill="#ffd166" /></g>
      {female && <g {...LINE} strokeWidth={1.4}>
        {[0, 72, 144, 216, 288].map((turn) => <circle key={turn} cx={112 + 5 * Math.cos(turn * Math.PI / 180)} cy={52 + 5 * Math.sin(turn * Math.PI / 180)} r={3.6} fill="#ff8fab" />)}
        <circle cx={112} cy={52} r={2.6} fill="#ffd166" />
      </g>}
    </g>}
    {animal && female && <g transform="translate(108 46) rotate(15)" {...LINE} strokeWidth={1.6}>
      <polygon points="0,0 -11,-7 -11,7" fill={palette.badge} /><polygon points="0,0 11,-7 11,7" fill={palette.badge} /><circle r={3.4} fill={palette.badge} />
    </g>}
  </>

  return <Figure size={size} label={label} x={x} y={y} spec={{
    skin, female, shirt: palette.shirt, pants: palette.pants, boots: palette.boots, vest: palette.vest, stripe: palette.stripe,
    stripes: params.universe !== 'Спорт', sportNumber: params.universe === 'Спорт', wide: params.action === 'Сразу в бой',
    armLeft, armRight, armLeftMotion, armRightMotion, propLeft: params.role === 'Наставник' ? 'book' : null,
    propRight: params.role === 'Стратег' ? 'tablet' : params.role === 'Мастер' ? 'hammer' : null, propColor: palette.badge,
    pouch: params.role === 'Мастер', radio: params.action === 'Советуюсь',
    behind, chest, backHead, face, top,
  }} />
}
