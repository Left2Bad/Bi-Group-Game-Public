import { writeFileSync } from 'node:fs'
import { initialBank, bundledQuestions, validateBankQuestion } from '../server/question-bank.ts'
import { choicePreference, combinedTraitPercent } from '../src/dynamic/domain.ts'
import { TRAIT_IDS } from '../src/domain/types.ts'
import type { ChoiceQuestion } from '../src/dynamic/domain.ts'

function groupBy<T>(values: readonly T[], key: (value: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const value of values) (result[key(value)] ??= []).push(value)
  return result
}

// Content diagnostics, not a psychometric validation or an automatic scoring correction.
const rows = [...initialBank, ...bundledQuestions()]
for (const row of rows) validateBankQuestion(row)
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()
const duplicateGroups = (entries: { id: string; key: string }[]) => Object.values(groupBy(entries, (entry) => entry.key))
  .filter((group) => group.length > 1).map((group) => group.map((entry) => entry.id))
const template = (question: ChoiceQuestion) => question.options.map((o) => `${o.primary},${o.secondary}`).sort().join(';')
const balanced = (question: ChoiceQuestion) => {
  const option = question.options.filter((o) => o.primary === o.secondary).sort((a, b) => b.primary - a.primary)[0]
  if (!option) throw new Error(`No equal-score option in ${question.id}; update the diagnostic strategy.`)
  return option
}
const groups = groupBy(rows, (row) => row.id.includes('_') ? row.id.split('_')[0]! : 'Q')
const groupMetrics = Object.fromEntries(Object.entries(groups).map(([name, items]) => {
  const choices = items.map((row) => row.question)
  const choiceAnswers = Object.fromEntries(choices.map((q) => [q.id, balanced(q).id]))
  const balancedPercent = choicePreference({ choices, choiceAnswers, id: 'bank-audit', method: 'audit',
    promptVersion: 'audit', model: 'none', jobRole: name, createdAt: '2026-10-19', completedAt: null,
    status: 'choices', openQuestions: [], openAnswers: {}, evaluation: null })
  const expectedRandomPercent = Object.fromEntries(TRAIT_IDS.map((trait) => {
    let total = 0
    let maximum = 0
    for (const q of choices) {
      const axis = q.primaryTrait === trait ? 'primary' : q.secondaryTrait === trait ? 'secondary' : null
      if (axis) {
        total += q.options.reduce((sum, o) => sum + o[axis], 0) / q.options.length
        maximum += Math.max(...q.options.map((o) => o[axis]))
      }
    }
    return [trait, Math.round(10000 * total / maximum) / 100]
  }))
  const positions = choices.map((q) => q.options.indexOf(balanced(q)))
  const period = Array.from({ length: 12 }, (_, i) => i + 1)
    .find((length) => positions.every((position, i) => position === positions[i % length])) ?? null
  return [name, {
    count: items.length,
    templates: Object.fromEntries(Object.entries(groupBy(items, (row) => template(row.question)))
      .map(([key, entries]) => [key, entries.length])),
    balancedPercent,
    balancedFinalWithBehavior75: Object.fromEntries(TRAIT_IDS.map((trait) => [trait, combinedTraitPercent(balancedPercent[trait], 75)])),
    expectedRandomPercent,
    balancedPositionPeriod: period,
    balancedPositionSequence: positions.slice(0, 12).map((position) => 'ABCD'[position]).join(''),
    longestOptionMaxSum: choices.filter((q) => {
      const longest = q.options.reduce((a, b) => a.text.length >= b.text.length ? a : b)
      return longest.primary + longest.secondary === Math.max(...q.options.map((o) => o.primary + o.secondary))
    }).length,
    randomMaxSumExpectedCount: choices.reduce((sum, q) => {
      const max = Math.max(...q.options.map((o) => o.primary + o.secondary))
      return sum + q.options.filter((o) => o.primary + o.secondary === max).length / 4
    }, 0),
  }]
}))
const report = {
  total: rows.length,
  schemaValid: true,
  duplicateIds: duplicateGroups(rows.map((row) => ({ id: row.id, key: row.id }))),
  duplicatePrompts: duplicateGroups(rows.map((row) => ({ id: row.id, key: normalize(`${row.question.context} ${row.question.text}`) }))),
  groups: groupMetrics,
  roleCoverage: Object.fromEntries(Object.entries(groupBy(bundledQuestions(), (row) => row.roles[0] ?? 'Без роли'))
    .map(([role, items]) => [role, { count: items.length, traits: Object.fromEntries(TRAIT_IDS.map((trait) => [trait,
      items.filter((row) => row.question.primaryTrait === trait || row.question.secondaryTrait === trait).length])) }])),
  questions: rows.map((row) => ({
    id: row.id,
    role: row.roles[0],
    template: template(row.question),
    shortestToLongest: Math.round(100 * Math.min(...row.question.options.map((o) => o.text.length))
      / Math.max(...row.question.options.map((o) => o.text.length))) / 100,
    balancedOption: balanced(row.question).id,
  })),
}
const outputIndex = process.argv.indexOf('--output')
if (outputIndex >= 0) {
  const destination = process.argv[outputIndex + 1]
  if (!destination) throw new Error('Provide a file path after --output')
  writeFileSync(destination, JSON.stringify(report, null, 2) + '\n')
}
console.info(JSON.stringify({ ...report, questions: undefined }, null, 2))
