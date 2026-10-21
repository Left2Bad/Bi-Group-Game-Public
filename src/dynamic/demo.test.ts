// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEMO_BANK_VERSION, DEMO_CHOICES, DEMO_PERSONAS } from '../content/dynamic-demo'
import { isAvatarParams } from '../domain/avatar'
import { TRAIT_IDS } from '../domain/types'
import { buildDemoEmployee, buildDemoTeam, demoAttempt, demoMeetings } from './demo'
import { comparableDynamic } from './domain'
import { routeProgress, skillCard, traitDynamics } from './manager-card'
import { SKILL_CATALOG } from './skills'

const percents = (id: string) => DEMO_PERSONAS.find((persona) => persona.id === id)!.attempts
  .map((_, index) => Object.fromEntries(TRAIT_IDS.map((trait) => [trait, demoAttempt(DEMO_PERSONAS.find((persona) => persona.id === id)!, index).evaluation!.traits[trait].finalPercent])))

describe('пример по действующей методике', () => {
  it('берёт десять ситуаций дословно из банка и покрывает каждое качество пять раз', () => {
    const bank = JSON.parse(readFileSync(fileURLToPath(new URL('../../server/bank/field.json', import.meta.url)), 'utf8')) as { id: string; version: string; question: unknown }[]
    for (const question of DEMO_CHOICES) {
      const row = bank.find((item) => item.id === question.id)!
      expect(row.version).toBe(DEMO_BANK_VERSION)
      expect(question).toEqual(row.question)
    }
    for (const trait of TRAIT_IDS) expect(DEMO_CHOICES.filter((item) => item.primaryTrait === trait || item.secondaryTrait === trait)).toHaveLength(5)
  })

  it('считает итог общей формулой: две трети выбора в ситуациях и треть поведения в ответах', () => {
    expect(percents('alexey')).toEqual([{ criticalThinking: 78, confidence: 40, discipline: 52, engagement: 75 }, { criticalThinking: 83, confidence: 52, discipline: 60, engagement: 74 }])
    expect(percents('dinara')).toEqual([{ criticalThinking: 83, confidence: 40, discipline: 83, engagement: 48 }, { criticalThinking: 87, confidence: 48, discipline: 78, engagement: 56 }])
    expect(percents('sergey')).toEqual([{ criticalThinking: 40, confidence: 83, discipline: 40, engagement: 83 }, { criticalThinking: 40, confidence: 87, discipline: 48, engagement: 78 }])
    expect(percents('asel')).toEqual([{ criticalThinking: 87, confidence: 70, discipline: 78, engagement: 35 }])
    expect(percents('nurlan')).toEqual([{ criticalThinking: 52, confidence: 78, discipline: 65, engagement: 65 }, { criticalThinking: 52, confidence: 87, discipline: 65, engagement: 73 }])
  })

  it('цитирует основания дословно, как требует сервер', () => {
    for (const persona of DEMO_PERSONAS) persona.attempts.forEach((spec, index) => {
      const attempt = demoAttempt(persona, index)
      const evaluation = attempt.evaluation!
      expect(evaluation.skills!.length).toBeGreaterThanOrEqual(3)
      expect(evaluation.skills!.length).toBeLessThanOrEqual(5)
      expect(new Set(evaluation.skills!.map((skill) => skill.skillId)).size).toBe(evaluation.skills!.length)
      for (const skill of evaluation.skills!) expect(SKILL_CATALOG.some((item) => item.id === skill.skillId && item.name === skill.name)).toBe(true)
      expect(new Set(evaluation.roadmap!.map((week) => week.action)).size).toBe(4)
      expect(evaluation.roadmap!.map((week) => week.week)).toEqual([1, 2, 3, 4])
      if (!spec.answers) { expect(attempt.openQuestions).toEqual([]); return }
      const answers = [...Object.values(attempt.openAnswers), ...attempt.choices.map((question) => question.options.find((option) => option.id === attempt.choiceAnswers[question.id])!.text)]
      const quotes = [...Object.values(evaluation.criteria!), ...Object.values(evaluation.behavior!), ...evaluation.skills!, ...Object.values(evaluation.traits)].map((item) => item.evidence)
      for (const quote of quotes) {
        expect(quote.length).toBeLessThanOrEqual(240)
        expect(answers.some((answer) => answer.includes(quote)), quote).toBe(true)
      }
      for (const trait of TRAIT_IDS) expect(attempt.openAnswers[evaluation.traits[trait].questionId!]).toContain(evaluation.traits[trait].evidence)
    })
  })

  it('собирает кабинет руководителя: сопоставимая динамика, отметки, состояния участников и беседы впереди', () => {
    const demo = buildDemoTeam('Участок')
    expect(demo.members.map((member) => [member.id, member.consented, Boolean(member.dynamicResult)])).toEqual([
      ['alexey', true, true], ['dinara', true, true], ['sergey', true, true], ['asel', true, true], ['nurlan', true, true], ['madina', true, false], ['timur', false, false]])
    for (const persona of DEMO_PERSONAS) expect(persona.avatar === null || isAvatarParams(persona.avatar)).toBe(true)
    const card = demo.cards.alexey!.dynamic!
    expect(traitDynamics(card.latest, card.history).baseline?.id).toBe('demo-alexey-1')
    expect(card.history[0]!.openAnswers).toEqual({})
    expect(skillCard(card.latest, card.history).rows.filter((row) => row.state === 'insufficient').map((row) => row.name)).toEqual(['Практика: кладка', 'Чертежи и BIG Engineering'])
    expect(routeProgress(card.latest, card.marks).next?.week).toBe(2)
    expect(traitDynamics(demo.cards.asel!.dynamic!.latest, demo.cards.asel!.dynamic!.history).gap).toBe('single')
    const now = Date.parse('2026-10-20T12:00:00.000Z')
    const [upcoming, past] = demoMeetings(demo, now)
    expect(Date.parse(upcoming!.at)).toBeGreaterThan(now)
    expect(Date.parse(past!.at)).toBeLessThan(now)
  })

  it('кабинет сотрудника: входная оценка с ответами сравнима с последней', () => {
    const employee = buildDemoEmployee()
    expect(comparableDynamic(employee.baseline, employee.attempt)).toBe(true)
    expect(Object.keys(employee.baseline.openAnswers)).toHaveLength(5)
    expect(employee.comments.every((comment) => comment.mine === undefined)).toBe(true)
  })
})
