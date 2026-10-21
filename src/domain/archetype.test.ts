import { describe, expect, it } from 'vitest'
import { questions, scoring } from '../content/questions'
import { ARCHETYPES, POLES } from '../content/archetypes'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { getArchetype, POLE_THRESHOLD } from './archetype'
import { calculateProfile } from './score'
import { DATA_VERSIONS, TRAIT_IDS } from './types'
import type { Answers } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, attemptId: 'archetype', completedAt: '2026-10-17T00:00:00.000Z' }
function resultFor(answers: Answers) {
  const output = calculateProfile(answers, context)
  if (!output.ok) throw new Error(output.error.message)
  return output.result
}

describe('рабочие архетипы', () => {
  it('содержат все 16 сочетаний полюсов с полным описанием', () => {
    const codes = [''].flatMap((a) => TRAIT_IDS.reduce((acc, trait) =>
      acc.flatMap((prefix) => [prefix + POLES[trait].high.letter, prefix + POLES[trait].low.letter]), [a]))
    expect(new Set(codes).size).toBe(16)
    expect(Object.keys(ARCHETYPES).sort()).toEqual([...codes].sort())
    expect(new Set(Object.values(ARCHETYPES).map((item) => item.name)).size).toBe(16)
    for (const item of Object.values(ARCHETYPES)) {
      for (const text of [item.name, item.tagline, item.description, item.bestAt, ...item.strengths, ...item.risks]) expect(text.trim()).not.toBe('')
    }
  })

  it('буквы полюсов внутри качества различаются, а коды однозначны', () => {
    for (const trait of TRAIT_IDS) expect(POLES[trait].high.letter).not.toBe(POLES[trait].low.letter)
  })

  it('порог полюса — ровный профиль 2/3: везде компромисс даёт «Главного инженера»', () => {
    expect(POLE_THRESHOLD).toBeCloseTo(2 / 3)
    const profile = getArchetype(resultFor(manualSets.balanced.answers))
    expect(profile.code).toBe('АРСК')
    expect(profile.archetype.name).toBe('Главный инженер')
  })

  it('демо A — «Контролёр качества»: сильные мышление и дисциплина', () => {
    const profile = getArchetype(resultFor(manualSets.demoA.answers))
    expect(profile.code).toBe('АДСН')
    expect(TRAIT_IDS.map((id) => profile.poles[id].high)).toEqual([true, false, true, false])
  })

  it('минимальный набор даёт архетип без сильных полюсов и не падает', () => {
    expect(getArchetype(resultFor(manualSets.minimum.answers)).code).toBe('ПДГН')
  })
})
