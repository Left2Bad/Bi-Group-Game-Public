import { describe, expect, it } from 'vitest'
import { completed, skill } from '../../tests/fixtures/dynamic-attempts'
import { planWeeks, routeProgress, skillCard, traitDynamics } from './manager-card'
import { expectedSkills } from './skills'

describe('карточка развития: динамика четырёх качеств', () => {
  it('при одной попытке не придумывает динамику', () => {
    const latest = completed('a1', 1)
    const result = traitDynamics(latest, [latest])
    expect(result.gap).toBe('single')
    expect(result.baseline).toBeNull()
    expect(Object.values(result.rows).every((row) => row === null)).toBe(true)
  })
  it('сравнивает последнюю с первой сопоставимой попыткой в процентных пунктах', () => {
    const first = completed('a1', 1, { percent: 50 })
    const latest = completed('a3', 20, { percent: 58 })
    const result = traitDynamics(latest, [latest, completed('a2', 10, { percent: 70 }), first])
    expect(result.baseline?.id).toBe('a1')
    expect(result.rows.criticalThinking).toEqual({ baseline: 50, current: 58, delta: 8 })
    expect(result.skippedEarlier).toBe(false)
  })
  it('не сравнивает попытки с другой моделью и объясняет причину', () => {
    const latest = completed('a2', 10)
    const result = traitDynamics(latest, [completed('a1', 1, { model: 'gpt-4o-mini' }), latest])
    expect(result.gap).toBe('incompatible')
    expect(result.rows.engagement).toBeNull()
  })
  it('пропускает несопоставимую первую попытку и отмечает это', () => {
    const latest = completed('a3', 20)
    const result = traitDynamics(latest, [completed('a1', 1, { model: 'old' }), completed('a2', 10, { percent: 40 }), latest])
    expect(result.baseline?.id).toBe('a2')
    expect(result.skippedEarlier).toBe(true)
  })
})

describe('карточка развития: профессиональные навыки', () => {
  it('ожидаемые навыки зависят от должности, а не одинаковы для всех', () => {
    const foreman = expectedSkills('Прораб').map((item) => item.id)
    expect(foreman).toEqual(expect.arrayContaining(['duties', 'practice-monolith', 'practice-masonry', 'drawings-big-engineering', 'work-planning', 'contractor-management']))
    const pto = expectedSkills('Инженер ПТО').map((item) => item.id)
    expect(pto).toContain('drawings-big-engineering')
    expect(pto).not.toContain('practice-monolith')
    expect(expectedSkills('Кладовщик').map((item) => item.id)).toEqual(['duties'])
  })
  it('показывает «Недостаточно данных» для неоценённых ожидаемых навыков вместо 0%', () => {
    const latest = completed('a1', 1)
    const card = skillCard(latest, [latest])
    const planning = card.rows.find((row) => row.key === 'work-planning')!
    expect(planning).toMatchObject({ state: 'assessed', expected: true })
    const drawings = card.rows.find((row) => row.key === 'drawings-big-engineering')!
    expect(drawings).toMatchObject({ state: 'insufficient', skill: null })
    expect(drawings.definition?.notChecked).toMatch(/не проводилась/)
    expect(card.gap).toBe('single')
  })
  it('сравнивает навык только по одинаковому ID и версии каталога', () => {
    const first = completed('a1', 1, { skills: [skill('work-planning', 'Планирование работ', 25), skill('other', 'Учёт материалов', 50)] })
    const latest = completed('a2', 10, { skills: [skill('work-planning', 'Планирование работ', 75), skill('quality-control', 'Контроль качества', 50), skill('other', 'Учёт материалов', 75)] })
    const card = skillCard(latest, [first, latest])
    expect(card.baseline?.id).toBe('a1')
    expect(card.rows.find((row) => row.key === 'work-planning')!.change).toEqual({ baseline: 25, current: 75, delta: 50 })
    expect(card.rows.find((row) => row.key === 'quality-control')!).toMatchObject({ change: null, changeGap: 'not-in-baseline' })
    // Совпадение свободного названия «other» не даёт сравнения.
    expect(card.rows.find((row) => row.name === 'Учёт материалов')!.change).toBeNull()
  })
  it('старый результат без ID показывает как есть, без ожидаемых навыков и динамики', () => {
    const old = completed('a1', 1, { catalog: false, skills: [skill(undefined, 'Проверка документации', 75)] })
    const card = skillCard(old, [old])
    expect(card.legacy).toBe(true)
    expect(card.gap).toBe('no-skill-ids')
    expect(card.rows).toHaveLength(1)
    expect(card.rows[0]).toMatchObject({ name: 'Проверка документации', state: 'assessed', change: null })
  })
  it('не сравнивает новый результат с прежним без ID навыков', () => {
    const latest = completed('a2', 10)
    const card = skillCard(latest, [completed('a1', 1, { catalog: false, skills: [skill(undefined, 'Планирование работ', 25)] }), latest])
    expect(card.gap).toBe('baseline-without-ids')
    expect(card.rows[0]!.change).toBeNull()
  })
})

describe('карточка развития: маршрут на 30 дней', () => {
  it('показывает отметки сотрудника, сроки, ближайшее действие и повторную диагностику', () => {
    const latest = completed('a1', 1)
    const route = routeProgress(latest, [{ week: 1, completedAt: '2026-10-05T10:00:00.000Z' }, { week: 3, completedAt: '2026-10-20T10:00:00.000Z' }])
    expect(route.marked).toBe(2)
    expect(route.next?.week).toBe(2)
    expect(route.weeks.map((week) => week.deadline.slice(0, 10))).toEqual(['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-31'])
    expect(route.retestAt.slice(0, 10)).toBe('2026-10-31')
    expect(route.weeks[0]!.markedAt).toBe('2026-10-05T10:00:00.000Z')
  })
  it('для ранних результатов без roadmap использует тот же запасной план, что и сотрудник', () => {
    const weeks = planWeeks(completed('a1', 1, { roadmap: false }))
    expect(weeks).toHaveLength(4)
    expect(weeks.map((week) => week.trait)).toEqual(['criticalThinking', 'confidence', 'criticalThinking', 'confidence'])
    const all = routeProgress(completed('a1', 1), [1, 2, 3, 4].map((week) => ({ week, completedAt: '2026-10-05T10:00:00.000Z' })))
    expect(all.next).toBeNull()
  })
})
