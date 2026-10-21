import type { Question, ValidationIssue, ValidationResult } from './types'

export function validateAnswers(answers: unknown, questions: readonly Question[]): ValidationResult {
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    return { ok: false, issues: [{ code: 'invalid-answers' }] }
  }
  const values = answers as Record<string, unknown>
  const issues: ValidationIssue[] = []
  const byId = new Map(questions.map((question) => [question.id, question]))
  for (const id of Object.keys(values)) {
    const question = byId.get(id)
    if (!question) issues.push({ code: 'unknown-question', questionId: id })
    else if (typeof values[id] !== 'string' || !question.options.some((option) => option.id === values[id])) {
      issues.push({ code: 'unknown-option', questionId: id })
    }
  }
  for (const question of questions) {
    if (!Object.hasOwn(values, question.id)) issues.push({ code: 'missing-answer', questionId: question.id })
  }
  return issues.length ? { ok: false, issues } : { ok: true, answers: { ...values } as Record<string, string> }
}
