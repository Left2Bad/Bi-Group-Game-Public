/** Контурные значки профиля сотрудника: 24×24, цвет берут из currentColor, для читалок скрыты. */
const PATHS = {
  strength: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  growth: 'M4 20h16M7 16v-3M12 16V9M17 16V5M14.5 7.5 17 5l2.5 2.5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12l7-7M16 5h3v3',
  chart: 'M4 4v16h16M8 15l3-4 3 2 5-6',
  answers: 'M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4M12 8v4l3 2',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  repeat: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
  book: 'M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5zM12 6v13.5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  quote: 'M9 7H5v5h4v-1c0 2-1 3.5-3 4M19 7h-4v5h4v-1c0 2-1 3.5-3 4',
  chevron: 'M9 6l6 6-6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowBack: 'M19 12H5M11 6l-6 6 6 6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6zM12 15v2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
} as const

export type ProfileIconName = keyof typeof PATHS

export function ProfileIcon({ name, className }: { readonly name: ProfileIconName; readonly className?: string | undefined }) {
  return <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[name]} /></svg>
}

/** Чертёж дома с краном для карточки «Фокус развития»: линии как на кальке, одно окно горит жёлтым. */
export function FocusBuilding({ className }: { readonly className?: string | undefined }) {
  return <svg className={className} viewBox="0 0 220 170" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M6 164h208" />
    <path d="M40 164V70h64v94M104 96h40v68" />
    {[0, 1, 2, 3].map((row) => [0, 1, 2].map((col) => <rect key={`${row}-${col}`} x={50 + col * 18} y={82 + row * 20} width="10" height="12" rx="1"
      fill={row === 2 && col === 1 ? 'var(--construction-accent)' : 'none'} stroke={row === 2 && col === 1 ? 'var(--construction-accent)' : 'currentColor'} />))}
    {[0, 1].map((row) => <path key={row} d={`M114 ${108 + row * 22}h20`} />)}
    <path d="M176 164V22M170 164V22M170 34l6-12M176 46l-6-12M170 58l6-12M176 70l-6-12M170 82l6-12M176 94l-6-12M170 106l6-12M176 118l-6-12M170 130l6-12M176 142l-6-12M170 154l6-12" opacity=".7" />
    <path d="M118 22h96M118 22l55-12 41 12M118 22v8M208 22v14" />
    <path d="M128 30v26" strokeDasharray="3 3" />
    <rect x="121" y="56" width="14" height="10" rx="1" />
    <circle cx="190" cy="140" r="2" fill="currentColor" stroke="none" opacity=".6" />
  </svg>
}
