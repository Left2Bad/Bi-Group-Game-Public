import { describe, expect, it } from 'vitest'
import { questions, scoring } from '../content/questions'
import { TEAM } from '../content/team'
import { demoQuestions, demoResult } from '../../tests/fixtures/contract-demo'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { assessConsistency, CONSISTENCY_THRESHOLDS } from './consistency'
import { calculateProfile } from './score'
import { answersForPersona } from './team'
import { DATA_VERSIONS } from './types'
import type { Answers, AssessmentResult } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, completedAt: '2026-10-17T08:00:00.000Z' }

function resultOf(answers: Answers, attemptId = 'consistency'): AssessmentResult {
  const output = calculateProfile(answers, { ...context, attemptId })
  if (!output.ok) throw new Error(output.error.message)
  return output.result
}

/** Детерминированный генератор, чтобы тест не мигал. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sameLetter = (index: number): Answers =>
  Object.fromEntries(questions.map((question) => [question.id, question.options[index]!.id]))

describe('индикатор согласованности ответов', () => {
  it('ловит ответы «как надо»: везде компромиссный вариант', () => {
    const report = assessConsistency(resultOf(manualSets.balanced.answers), questions)!
    expect(report.level).toBe('low')
    const balanced = report.signals.find((signal) => signal.id === 'balanced')!
    expect(balanced.value).toBe(15)
    expect(balanced.severity).toBe('flag')
  })

  it('ловит одну и ту же позицию независимо от текста вариантов', () => {
    for (const index of [0, 1, 2, 3]) {
      const report = assessConsistency(resultOf(sameLetter(index)), questions)!
      expect(report.signals.find((signal) => signal.id === 'position')!.value).toBe(15)
      expect(report.level).toBe('low')
    }
  })

  it('не срабатывает на ответах с выраженными предпочтениями', () => {
    for (const key of ['primary', 'demoA', 'demoB', 'minimum'] as const) {
      expect(assessConsistency(resultOf(manualSets[key].answers), questions)!.level).toBe('consistent')
    }
    const levels = TEAM.map((persona) => assessConsistency(resultOf(answersForPersona(persona, questions, scoring)), questions)!.level)
    // Из восьми вымышленных сотрудников только «ровный» начальник участка отвечает всегда компромиссом.
    expect(levels.filter((level) => level === 'low')).toHaveLength(1)
    expect(levels[0]).toBe('low')
    expect(levels.slice(1).every((level) => level === 'consistent')).toBe(true)
  })

  it('промежуточный уровень «стоит перепроверить» при 9–11 компромиссах', () => {
    const answers: Record<string, string> = { ...manualSets.primary.answers }
    const balancedAnswers: Readonly<Record<string, string>> = manualSets.balanced.answers
    for (const question of questions.slice(0, 9)) answers[question.id] = balancedAnswers[question.id]!
    const report = assessConsistency(resultOf(answers), questions)!
    expect(report.signals.find((signal) => signal.id === 'balanced')!.value).toBe(9)
    expect(report.level).toBe('check')
  })

  it('почти не срабатывает на случайных ответах: «низкая» реже 1%, «перепроверить» реже 15%', () => {
    const random = mulberry32(20261017)
    const runs = 2000
    let low = 0
    let check = 0
    for (let run = 0; run < runs; run++) {
      const answers = Object.fromEntries(questions.map((question) => [question.id, question.options[Math.floor(random() * 4)]!.id]))
      const level = assessConsistency(resultOf(answers, `random-${run}`), questions)!.level
      if (level === 'low') low += 1
      if (level === 'check') check += 1
    }
    expect(low / runs).toBeLessThan(0.01)
    expect(check / runs).toBeLessThan(0.15)
  })

  it('считает варианты с нулём баллов справочно и не меняет уровень', () => {
    const report = assessConsistency(resultOf(manualSets.minimum.answers), questions)!
    expect(report.avoidCount).toBeGreaterThan(0)
    expect(report.level).toBe('consistent')
  })

  it('не меняет результат и проценты профиля', () => {
    const result = resultOf(manualSets.demoA.answers)
    const before = JSON.stringify(result)
    assessConsistency(result, questions)
    expect(JSON.stringify(result)).toBe(before)
    expect(CONSISTENCY_THRESHOLDS.balanced.watch).toBeLessThan(CONSISTENCY_THRESHOLDS.balanced.flag)
    expect(CONSISTENCY_THRESHOLDS.samePosition.watch).toBeLessThan(CONSISTENCY_THRESHOLDS.samePosition.flag)
  })

  it('возвращает null, если по результату нельзя восстановить выбор', () => {
    expect(assessConsistency(demoResult, demoQuestions)).toBeNull()
    expect(assessConsistency(resultOf(manualSets.demoA.answers), [])).toBeNull()
  })
})
