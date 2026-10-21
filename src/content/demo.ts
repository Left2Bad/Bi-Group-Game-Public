import type { Answers } from '../domain/types'

/** Вымышленные ответы для /demo. Проценты рассчитываются общей формулой, а не хранятся здесь. */
const answersA = Object.freeze({
  Q01: 'Q01-A', Q02: 'Q02-C', Q03: 'Q03-D', Q04: 'Q04-C',
  Q05: 'Q05-B', Q06: 'Q06-A', Q07: 'Q07-B', Q08: 'Q08-C',
  Q09: 'Q09-C', Q10: 'Q10-C', Q11: 'Q11-B', Q12: 'Q12-D',
  Q13: 'Q13-A', Q14: 'Q14-A', Q15: 'Q15-A',
} satisfies Answers)

export const demoAnswers = Object.freeze({
  A: answersA,
  B: Object.freeze({ ...answersA, Q13: 'Q13-B' }),
})

export type DemoScenario = keyof typeof demoAnswers

/** Фиксированная дата примера; не является временем прохождения пользователя. */
export const DEMO_COMPLETED_AT = '2026-10-16T09:00:00.000Z'
