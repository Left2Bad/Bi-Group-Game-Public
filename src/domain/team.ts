import { LESSONS } from '../content/lessons'
import type { TeamPersona } from '../content/team'
import { getArchetype } from './archetype'
import type { ArchetypeProfile } from './archetype'
import { assessConsistency } from './consistency'
import type { ConsistencyReport } from './consistency'
import { calculateProfile } from './score'
import { TRAIT_IDS } from './types'
import type { Answers, AssessmentResult, CalculationContext, MicroLesson, Question, ScoringRule, TraitId } from './types'

export interface TeamMember {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly result: AssessmentResult
  readonly archetype: ArchetypeProfile
  /** Индикатор согласованности ответов; null, если по результату его нельзя вычислить. */
  readonly consistency: ConsistencyReport | null
}

export interface TeamReport {
  readonly members: readonly TeamMember[]
  /** Средний процент команды по качеству. */
  readonly average: Readonly<Record<TraitId, number>>
  readonly weakest: TraitId
  readonly strongest: TraitId
  /** Сколько человек имеют качество в зоне приоритета развития. */
  readonly priorityCount: Readonly<Record<TraitId, number>>
  readonly workshop: MicroLesson
  readonly archetypeCounts: readonly { readonly code: string; readonly name: string; readonly count: number }[]
  /** Сотрудники, чьи ответы стоит обсудить: уровень индикатора согласованности не «согласованы». */
  readonly attention: readonly TeamMember[]
}

const pointsOf = (scoring: readonly ScoringRule[], questionId: string, optionId: string, trait: TraitId) =>
  scoring.find((rule) => rule.questionId === questionId && rule.optionId === optionId && rule.trait === trait)?.points ?? 0

/** Выбирает в каждой ситуации вариант с наибольшей взвешенной суммой баллов; при ничьей — сбалансированный. */
export function answersForPersona(persona: TeamPersona, questions: readonly Question[], scoring: readonly ScoringRule[]): Answers {
  return Object.fromEntries(questions.map((question) => {
    const scored = question.options.map((option) => {
      const total = pointsOf(scoring, question.id, option.id, question.trait) + pointsOf(scoring, question.id, option.id, question.secondaryTrait)
      const weighted = persona.weights[question.trait] * pointsOf(scoring, question.id, option.id, question.trait)
        + persona.weights[question.secondaryTrait] * pointsOf(scoring, question.id, option.id, question.secondaryTrait)
      const balance = Math.abs(pointsOf(scoring, question.id, option.id, question.trait) - pointsOf(scoring, question.id, option.id, question.secondaryTrait))
      return { option, total, weighted, balance }
    })
    const pick = persona.avoids?.includes(question.id)
      ? [...scored].sort((a, b) => a.total - b.total)[0]!
      : [...scored].sort((a, b) => b.weighted - a.weighted || a.balance - b.balance)[0]!
    return [question.id, pick.option.id]
  }))
}

export function memberFromResult(
  id: string, name: string, role: string, result: AssessmentResult, questions: readonly Question[] = [],
): TeamMember {
  return { id, name, role, result, archetype: getArchetype(result), consistency: assessConsistency(result, questions) }
}

export function buildTeamMembers(team: readonly TeamPersona[], context: Omit<CalculationContext, 'attemptId'>): TeamMember[] {
  return team.map((persona) => {
    const output = calculateProfile(answersForPersona(persona, context.questions, context.scoring), { ...context, attemptId: `team-${persona.id}` })
    if (!output.ok) throw new Error(output.error.message)
    return memberFromResult(persona.id, persona.name, persona.role, output.result, context.questions)
  })
}

const ratio = (member: TeamMember, trait: TraitId) => member.result.traits[trait].points / member.result.traits[trait].maxPoints

export function buildTeamReport(members: readonly TeamMember[]): TeamReport {
  if (members.length === 0) throw new Error('Команда пуста')
  const average = Object.fromEntries(TRAIT_IDS.map((trait) =>
    [trait, Math.round(members.reduce((sum, member) => sum + 100 * ratio(member, trait), 0) / members.length)])) as Record<TraitId, number>
  const byAverage = [...TRAIT_IDS].sort((a, b) => average[a] - average[b] || TRAIT_IDS.indexOf(a) - TRAIT_IDS.indexOf(b))
  const weakest = byAverage[0]!
  const strongest = byAverage[byAverage.length - 1]!
  const priorityCount = Object.fromEntries(TRAIT_IDS.map((trait) =>
    [trait, members.filter((member) => member.result.traits[trait].level === 'priority').length])) as Record<TraitId, number>

  const counts = new Map<string, { code: string; name: string; count: number }>()
  for (const member of members) {
    const entry = counts.get(member.archetype.code) ?? { code: member.archetype.code, name: member.archetype.archetype.name, count: 0 }
    counts.set(member.archetype.code, { ...entry, count: entry.count + 1 })
  }
  const archetypeCounts = [...counts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
  const attention = members.filter((member) => member.consistency !== null && member.consistency.level !== 'consistent')
  return { members, average, weakest, strongest, priorityCount, workshop: LESSONS[weakest][0], archetypeCounts, attention }
}
