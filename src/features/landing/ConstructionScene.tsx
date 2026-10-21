import { useId } from 'react'
import type { CSSProperties } from 'react'
import styles from './ConstructionScene.module.css'

/** Окна, в которых периодически зажигается свет: «строка-столбец» → задержка первого включения, с. */
const blinking = new Map([['1-0', 3.2], ['4-2', 4.9], ['2-1', 6.3], ['5-0', 7.6]])

/** Собственный декоративный чертёж. Не добавляет содержание или шаги в тест. */
export function ConstructionScene({ className }: { readonly className: string }) {
  const id = useId()
  const facade = `${id}-facade`
  const side = `${id}-side`
  return <svg className={className} viewBox="0 0 560 520" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={facade} x1="130" y1="140" x2="310" y2="450" gradientUnits="userSpaceOnUse">
        <stop stopColor="#e7f4ff" stopOpacity=".3" /><stop offset="1" stopColor="#83c5ff" stopOpacity=".07" />
      </linearGradient>
      <linearGradient id={side} x1="288" y1="180" x2="360" y2="430" gradientUnits="userSpaceOnUse">
        <stop stopColor="#59adf6" stopOpacity=".45" /><stop offset="1" stopColor="#4a98e0" stopOpacity=".08" />
      </linearGradient>
    </defs>
    <g stroke="#a9d7ff" strokeWidth="1" opacity=".18">
      <path d="M24 84H540M24 156H540M24 228H540M24 300H540M24 372H540M24 444H540" />
      <path d="M60 48V470M132 48V470M204 48V470M276 48V470M348 48V470M420 48V470M492 48V470" />
      <path d="M22 496L180 432H462L542 496H22ZM100 496L224 432M230 496L290 432M360 496L356 432M490 496L422 432M60 480H522M106 461H498" />
    </g>
    <g stroke="#b6dcff" strokeWidth="1.5" opacity=".4">
      <path d="M36 428V246H102V428M36 284H102M36 322H102M36 360H102M36 398H102M58 246V428M80 246V428" />
      <path d="M344 428V294H390V428M344 330H390M344 366H390M344 402H390M367 294V428" />
    </g>
    <path d="M132 146H288V432H132V146Z" fill={`url(#${facade})`} stroke="#d3eaff" strokeWidth="2" />
    <path d="M288 146L350 188V432H288V146Z" fill={`url(#${side})`} stroke="#9bceff" strokeWidth="1.5" />
    <path d="M132 146L190 112H260L288 146" stroke="#c5e4ff" strokeWidth="2" />
    <path d="M132 218H288M132 278H288M132 338H288M132 398H288M288 218L350 250M288 278L350 304M288 338L350 358M288 398L350 412" stroke="#c5e4ff" strokeOpacity=".45" />
    {Array.from({ length: 6 }, (_, row) => <g key={row} className={styles.floor} style={{ animationDelay: `${0.25 + (5 - row) * 0.13}s` }}>
      {Array.from({ length: 3 }, (_, column) => {
        const current = row === 3 && column === 1
        const blinkDelay = blinking.get(`${row}-${column}`)
        return <rect
          key={column} x={151 + column * 43} y={168 + row * 40} width="22" height="25"
          fill={current ? '#ffd166' : '#b5dcff'} fillOpacity={current ? '.9' : '.16'}
          stroke="#cce6ff" strokeOpacity=".6"
          className={current ? styles.lit : blinkDelay === undefined ? undefined : styles.blink}
          style={blinkDelay === undefined ? undefined : { '--blink-delay': `${blinkDelay}s` } as CSSProperties} />
      })}
    </g>)}
    <g stroke="#d4eaff" strokeWidth="2" strokeLinejoin="round">
      <path d="M406 432V70H430V432M406 104L430 136L406 168L430 200L406 232L430 264L406 296L430 328L406 360L430 392L406 424" />
      <path d="M316 94H532V110H316V94ZM418 46V70M418 46L316 94M418 46L532 94M430 110H454V134H430" />
      <path d="M334 94L350 110L366 94L382 110L398 94M446 94L462 110L478 94L494 110L510 94L526 110" strokeWidth="1" />
      <g className={styles.trolley}>
        <rect x="491" y="108" width="14" height="9" rx="1.5" fill="#082e60" stroke="#ffd166" strokeWidth="1.5" />
        <g className={styles.hook}>
          <path d="M498 117V224" stroke="#ffd166" />
          <path d="M498 224V237C498 246 484 246 484 237" stroke="#ffd166" strokeWidth="3" strokeLinecap="round" />
        </g>
      </g>
      <circle cx="418" cy="41" r="3.2" fill="#e7f4ff" stroke="none" className={styles.beacon} />
      <circle cx="418" cy="41" r="3.2" fill="none" stroke="#e7f4ff" strokeWidth="1.5" className={styles.beaconRing} />
    </g>
    <path d="M96 434H464" stroke="#d4eaff" strokeWidth="2" />
    <path d="M132 434H288" stroke="#ffd166" strokeWidth="4" />
    <g stroke="#c4e2ff" strokeWidth="1" opacity=".65">
      <path d="M112 146H98M112 432H98M104 146V432M99 151L109 141M99 437L109 427" />
      <path d="M132 452V466M288 452V466M132 460H288M127 465L137 455M283 465L293 455" />
      <path d="M40 60H60M50 50V70M494 288H514M504 278V298" />
    </g>
  </svg>
}
