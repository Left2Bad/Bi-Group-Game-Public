import { useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useI18n } from '../i18n/context'
import styles from './BuildingProgress.module.css'

/** Дом собирается из 15 этапов: каждый ответ добавляет следующий. Порядок совпадает с порядком в PIECES. */
const STAGES = 15

type PieceState = 'empty' | 'current' | 'done'

/** Комиссия на приёмке: каждый ходит туда-обратно на своём отрезке перед домом и со своей скоростью. */
const WALKERS = [
  { from: 14, to: 62, time: 7, delay: 0, clipboard: true },
  { from: 120, to: 76, time: 6, delay: -2, clipboard: false },
  { from: 44, to: 104, time: 9, delay: -5, clipboard: false },
] as const

/**
 * Прогресс теста в виде стройки. До старта — пустой участок с чертежом дома; пока AI подбирает вопросы,
 * грузовик возит материалы; дальше каждый ответ достраивает дом, и после последнего в окнах загорается свет.
 * Чисто визуальный слой: текстовый прогресс и <progress> остаются в форме для чтения экраном.
 */
export function BuildingProgress({ total, answered, current, delivering = false }: {
  readonly total: number
  /** Индексы (с нуля) ситуаций, на которые уже есть ответ. */
  readonly answered: ReadonlySet<number>
  /** Индекс текущей ситуации или null на экране проверки / до старта. */
  readonly current: number | null
  /** Идёт генерация (вопросы или результат): на участок ездит грузовик с материалами или бригадой. */
  readonly delivering?: boolean
}) {
  const { t } = useI18n()
  const id = useId().replace(/:/g, '')
  const done = answered.size
  const built = total > 0 ? Math.min(STAGES, Math.round(done / total * STAGES)) : 0
  const complete = built >= STAGES
  const started = done > 0 || current !== null
  const [trips, setTrips] = useState(0)
  // Каждое новое ожидание начинается с первого рейса.
  const [wasDelivering, setWasDelivering] = useState(delivering)
  if (wasDelivering !== delivering) { setWasDelivering(delivering); if (delivering) setTrips(0) }

  // Новые этапы встают по очереди: если после загрузки сразу готово несколько, они появляются с задержкой друг за другом.
  const [stages, setStages] = useState({ last: 0, base: 0 })
  const base = stages.last !== built ? Math.min(stages.last, built) : stages.base
  if (stages.last !== built) setStages({ last: built, base })

  const stageNames = [t('Фундамент'), t('Первые ряды кладки'), t('Стены первого этажа'), t('Перекрытие'), t('Кладка второго этажа'),
    t('Стены второго этажа'), t('Стропила'), t('Кровля'), t('Входная дверь'), t('Окна первого этажа'), t('Окна второго этажа'),
    t('Дымоход'), t('Крыльцо'), t('Благоустройство'), t('Свет и новоселье')]

  const piece = (index: number, children: ReactNode) => {
    const state: PieceState = index < built ? 'done' : index === built && started ? 'current' : 'empty'
    const delay = state === 'done' && index >= base ? (index - base) * 110 : 0
    return <g className={styles.piece} data-state={state} data-piece={index} style={{ '--delay': `${delay}ms` } as CSSProperties}>{children}</g>
  }

  // Пока идёт стройка, куча материалов у участка тает; во время доставки растёт с каждым рейсом.
  const buildingPile = started && !complete ? Math.max(1, Math.ceil(3 * (1 - built / STAGES))) : 0
  const pile = delivering && !complete ? Math.max(buildingPile, Math.min(3, trips)) : buildingPile
  // Рейсы чередуются: кирпичи, потом бригада. Когда дом готов и считается результат, грузовик не нужен: вокруг ходит комиссия.
  const crew = trips % 2 === 1
  const inspecting = complete && delivering
  const phase = complete ? 'complete' : delivering ? 'delivering' : started ? 'building' : 'idle'

  const caption = complete ? delivering ? t('Комиссия принимает дом…') : t('Дом построен!')
    : delivering ? crew ? t('Везём бригаду…') : t('Везём материалы…') : started ? null : t('Участок ждёт материалы')
  return <div className={styles.building} data-phase={phase} aria-hidden="true">
    <p className={styles.title}>{t('Ваша стройка')}</p>
    <svg className={styles.scene} viewBox="0 6 150 148" focusable="false">
      <defs>
        <pattern id={`${id}-brick`} width="10" height="6" patternUnits="userSpaceOnUse">
          <rect width="10" height="6" fill="#5db5ff" />
          <path d="M0 .5H10M0 3.5H10M5 .5V3.5M0 3.5V6M10 3.5V6" stroke="#2384d8" strokeWidth="1" />
        </pattern>
        <linearGradient id={`${id}-roof`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd166" /><stop offset="1" stopColor="#f2a541" /></linearGradient>
      </defs>

      <line className={styles.groundLine} x1="0" y1="150.5" x2="150" y2="150.5" />

      {/* Дымоход стоит раньше кровли в разметке, чтобы кровля закрывала его основание. */}
      {piece(11, <><rect className={`${styles.shape} ${styles.chimney}`} x="102" y="34" width="9" height="20" /><rect className={`${styles.shape} ${styles.trim}`} x="100" y="32" width="13" height="3" /></>)}
      {piece(0, <rect className={`${styles.shape} ${styles.concrete}`} x="38" y="140" width="88" height="10" rx="1" />)}
      {piece(1, <rect className={`${styles.shape} ${styles.wall}`} x="42" y="122" width="80" height="18" fill={`url(#${id}-brick)`} />)}
      {piece(2, <rect className={`${styles.shape} ${styles.wall}`} x="42" y="104" width="80" height="18" fill={`url(#${id}-brick)`} />)}
      {piece(3, <rect className={`${styles.shape} ${styles.concrete}`} x="38" y="99" width="88" height="5" rx="1" />)}
      {piece(4, <rect className={`${styles.shape} ${styles.wall}`} x="42" y="82" width="80" height="17" fill={`url(#${id}-brick)`} />)}
      {piece(5, <rect className={`${styles.shape} ${styles.wall}`} x="42" y="65" width="80" height="17" fill={`url(#${id}-brick)`} />)}
      {piece(6, <path className={`${styles.shape} ${styles.frame}`} d="M34 65L82 30L130 65ZM58 65L82 47.5L106 65M82 30V65" />)}
      {piece(7, <><path className={`${styles.shape} ${styles.roof}`} d="M30 66L82 28L134 66Z" fill={`url(#${id}-roof)`} /><circle className={`${styles.shape} ${styles.atticWindow}`} cx="82" cy="52" r="5" /></>)}
      {piece(8, <><rect className={`${styles.shape} ${styles.door}`} x="74" y="117" width="16" height="23" rx="1.5" /><circle className={styles.knob} cx="86.5" cy="129" r="1.2" /></>)}
      {piece(9, <>{[50, 100].map((x) => <rect key={x} className={`${styles.shape} ${styles.window}`} x={x} y="110" width="14" height="14" rx="1" />)}</>)}
      {piece(10, <>{[50, 75, 100].map((x) => <rect key={x} className={`${styles.shape} ${styles.window}`} x={x} y="72" width="14" height="14" rx="1" />)}</>)}
      {piece(12, <><rect className={`${styles.shape} ${styles.concrete}`} x="68" y="140" width="28" height="5" /><rect className={`${styles.shape} ${styles.concrete}`} x="64" y="145" width="36" height="5" /></>)}
      {piece(13, <><rect className={`${styles.shape} ${styles.trunk}`} x="138" y="132" width="4" height="18" /><circle className={`${styles.shape} ${styles.leaf}`} cx="140" cy="126" r="9" />
        <circle className={`${styles.shape} ${styles.leaf}`} cx="30" cy="146" r="5" /><circle className={`${styles.shape} ${styles.leaf}`} cx="22" cy="147" r="4" /></>)}
      {piece(14, <><path className={`${styles.shape} ${styles.pole}`} d="M82 28V12" /><path className={`${styles.shape} ${styles.flag}`} d="M82 12L95 16L82 20Z" /></>)}

      {/* Финал: свет в окнах и дым из трубы. */}
      {complete && <g className={styles.finale}>
        {[[50, 110], [100, 110], [50, 72], [75, 72], [100, 72]].map(([x, y], index) =>
          <rect key={index} className={styles.light} x={x} y={y} width="14" height="14" rx="1" style={{ '--i': index } as CSSProperties} />)}
        {[0, 1, 2].map((index) => <circle key={index} className={styles.smoke} cx="106" cy="28" r="3.5" style={{ '--i': index } as CSSProperties} />)}
      </g>}

      {/* Куча материалов у края участка. */}
      <g className={styles.pile}>
        {pile >= 1 && <g className={styles.stack}><rect x="4" y="144" width="26" height="6" className={styles.pallet} /><rect x="6" y="138" width="22" height="6" fill={`url(#${id}-brick)`} /></g>}
        {pile >= 2 && <g className={styles.stack}><rect x="7" y="132" width="20" height="6" fill={`url(#${id}-brick)`} /></g>}
        {pile >= 3 && <g className={styles.stack}><rect x="2" y="128" width="30" height="3" className={styles.plank} /><rect x="4" y="125" width="26" height="3" className={styles.plank} /></g>}
      </g>

      {/* Приёмка: люди в касках прохаживаются перед готовым домом, у одного планшет. */}
      {inspecting && WALKERS.map((walker, index) => <g key={index} transform="translate(0 150)">
        <g className={styles.walker} style={{ '--from': `${walker.from}px`, '--to': `${walker.to}px`, '--time': `${walker.time}s`, '--delay': `${walker.delay}s`, '--face': walker.to > walker.from ? 1 : -1 } as CSSProperties}>
          <g className={styles.figure}>
            <path d="M-1 -5L-1.5 0" className={`${styles.leg} ${styles.legA}`} /><path d="M1 -5L1.5 0" className={`${styles.leg} ${styles.legB}`} />
            <rect x="-2.5" y="-12" width="5" height="7.5" rx="1.2" className={styles.vest} /><circle cy="-14.5" r="2.4" className={styles.face} />
            <path d="M-3.2 -15.2A3.2 3.2 0 0 1 3.2 -15.2Z" className={styles.helmet} />
            {walker.clipboard && <rect x="2.2" y="-10.5" width="2.6" height="3.6" rx=".4" className={styles.clipboard} />}
          </g>
        </g>
      </g>)}

      {/* Грузовик: въезжает слева, поднимает кузов у кучи и уезжает за новым рейсом. */}
      {delivering && !complete && <g transform="translate(34 150)">
        <g className={styles.truck} onAnimationIteration={() => setTrips((value) => value + 1)}>
          <g className={styles.bed}>
            <rect x="0" y="-21" width="29" height="12" rx="1" className={styles.bedBody} />
            {crew
              ? <g className={styles.cargo}>{[7, 18].map((x) => <g key={x} className={styles.worker} transform={`translate(${x} -21)`}>
                <rect x="-2.5" y="-8" width="5" height="8" rx="1.2" className={styles.vest} /><circle cy="-10.5" r="2.4" className={styles.face} />
                <path d="M-3.2 -11.2A3.2 3.2 0 0 1 3.2 -11.2Z" className={styles.helmet} /></g>)}</g>
              : <g className={styles.cargo}><rect x="3" y="-26" width="10" height="5" fill={`url(#${id}-brick)`} /><rect x="15" y="-26" width="10" height="5" fill={`url(#${id}-brick)`} /></g>}
          </g>
          <rect x="0" y="-9" width="47" height="4" rx="1" className={styles.chassis} />
          <path d="M31 -9V-20Q31 -23 34 -23H40L47 -15V-9Z" className={styles.cab} />
          <path d="M36 -21H40L44 -16H36Z" className={styles.glass} />
          {[8, 38].map((x) => <g key={x} transform={`translate(${x} -4)`}><circle r="4.5" className={styles.wheel} /><path d="M-2.5 0H2.5M0 -2.5V2.5" className={styles.spoke} /></g>)}
        </g>
      </g>}
    </svg>
    <p className={styles.caption}>
      <span>{caption ?? <><strong>{built}</strong> {t('из {total} этапов', { total: STAGES })}</>}</span>
      {!complete && started && <span className={styles.stage}>{t('Сейчас: {stage}', { stage: stageNames[Math.min(built, STAGES - 1)] ?? "" })}</span>}
      {/* Полоса видна только в узкой закреплённой версии, где сцена слишком мала, чтобы читать прогресс по дому. */}
      <span className={styles.meter}><i style={{ width: `${Math.round(built / STAGES * 100)}%` }} /></span>
    </p>
  </div>
}
