/** Точки ромба для <polygon>: искры, значок «признание», клюв совы. */
export const diamond = (cx: number, cy: number, half: number) => `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`

/** Цвета наклеек на каске за выполненные практики плана. */
export const STICKER_COLORS = ['#ffd166', '#2993ed', '#3fb27f', '#e0563b'] as const

/** Обводка деталей персонажа. */
export const LINE = { stroke: '#0b1f3a', strokeWidth: 2.6, strokeLinejoin: 'round' } as const
