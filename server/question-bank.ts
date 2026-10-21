import type { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { questions, scoring } from '../src/content/questions.ts'
import { TRAIT_IDS } from '../src/domain/types.ts'
import type { ChoiceQuestion } from '../src/dynamic/domain.ts'

export interface BankQuestion {
  readonly id: string
  readonly version: string
  readonly roles: readonly string[]
  readonly question: ChoiceQuestion
}

/** Reject malformed imported rows before they can be selected for an employee. */
export function validateBankQuestion(value: unknown): BankQuestion {
  const row = value as Partial<BankQuestion> | null
  const question = row?.question as Partial<ChoiceQuestion> | undefined
  const validText = (text: unknown, max: number) => typeof text === 'string' && text.trim().length > 0 && text.length <= max
  if (!row || !validText(row.id, 64) || !/^[A-Za-z0-9_-]{2,64}$/.test(row.id!)
    || !validText(row.version, 100) || !Array.isArray(row.roles) || row.roles.some((role) => !validText(role, 80))
    || !question || question.id !== row.id || !validText(question.context, 500) || !validText(question.text, 500)
    || !TRAIT_IDS.includes(question.primaryTrait!) || !TRAIT_IDS.includes(question.secondaryTrait!)
    || question.primaryTrait === question.secondaryTrait || !Array.isArray(question.options) || question.options.length !== 4)
    throw new Error('Некорректная запись банка вопросов.')
  const optionIds = new Set<string>()
  const optionTexts = new Set<string>()
  for (const option of question.options) {
    if (!option || !validText(option.id, 64) || !validText(option.text, 500)
      || !Number.isInteger(option.primary) || option.primary < 0 || option.primary > 4
      || !Number.isInteger(option.secondary) || option.secondary < 0 || option.secondary > 4
      || optionIds.has(option.id) || optionTexts.has(option.text.trim().toLowerCase()))
      throw new Error(`Некорректные варианты вопроса ${row.id}.`)
    optionIds.add(option.id)
    optionTexts.add(option.text.trim().toLowerCase())
  }
  if (Math.max(...question.options.map((option) => option.primary)) === 0
    || Math.max(...question.options.map((option) => option.secondary)) === 0)
    throw new Error(`Вопрос ${row.id} не измеряет оба указанных качества.`)
  return row as BankQuestion
}

/** Initial reviewed bank. Editors can add new rows without changing the assessment API. */
const roleHints: Readonly<Record<string, readonly string[]>> = {
  Q01: ['прораб', 'мастер', 'монолит'], Q02: ['прораб', 'монолит'], Q03: ['прораб', 'инженер пто'],
  Q04: ['прораб', 'контроль качества'], Q05: ['прораб', 'технадзор'], Q06: ['прораб', 'мастер'],
  Q07: ['прораб', 'мастер'], Q08: ['прораб', 'мастер'], Q09: ['прораб', 'планирование'],
  Q10: ['прораб', 'отделка'], Q11: ['инженер пто', 'документация'], Q12: ['прораб', 'мастер'],
  Q13: ['прораб', 'бригада'], Q14: ['прораб', 'снабжение'], Q15: ['прораб', 'подрядчики'],
}

const scoreOf = (questionId: string, optionId: string, trait: string) =>
  scoring.find((rule) => rule.questionId === questionId && rule.optionId === optionId && rule.trait === trait)?.points

export const initialBank: readonly BankQuestion[] = questions.map((item) => ({
  id: item.id, version: 'construction-v1', roles: roleHints[item.id] ?? [],
  question: {
    id: item.id, context: item.context, text: item.text,
    primaryTrait: item.trait, secondaryTrait: item.secondaryTrait,
    options: item.options.map((option) => ({ id: option.id, text: option.text,
      primary: scoreOf(item.id, option.id, item.trait) ?? 0,
      secondary: scoreOf(item.id, option.id, item.secondaryTrait) ?? 0 })),
  },
}))

/** Read the deployed files on every synchronization, including same-version edits. */
export function bundledQuestions(): readonly BankQuestion[] {
  const files = ['field.json', 'engineering.json', 'operations.json']
  const rows = files.flatMap((file) => {
    const relativeToModule = new URL(`./bank/${file}`, import.meta.url)
    // Vitest rewrites import.meta.url on Windows; the repository-root path is equivalent there.
    const source = existsSync(relativeToModule) ? relativeToModule : resolve(process.cwd(), 'server', 'bank', file)
    const data: unknown = JSON.parse(readFileSync(source, 'utf8'))
    if (!Array.isArray(data)) throw new Error(`Банк ${file}: ожидается массив вопросов.`)
    return data.map(validateBankQuestion)
  })
  const allIds = [...initialBank.map((item) => item.id), ...rows.map((item) => item.id)]
  if (new Set(allIds).size !== allIds.length) throw new Error('В готовом банке повторяются ID вопросов.')
  return rows
}

export function seedQuestionBank(db: DatabaseSync) {
  return synchronizeQuestionBank(db, [...initialBank, ...bundledQuestions()])
}

/** The deployed sources are authoritative; attempts keep their own question snapshots. */
export function synchronizeQuestionBank(db: DatabaseSync, source: readonly BankQuestion[]) {
  // Validate the entire source before touching the live table.
  const bank = source.map(validateBankQuestion)
  const ids = new Set(bank.map((item) => item.id))
  if (ids.size !== bank.length) throw new Error('В готовом банке повторяются ID вопросов.')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS question_bank (
      id TEXT PRIMARY KEY, version TEXT NOT NULL, roles TEXT NOT NULL,
      question TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    )`)
    const save = db.prepare(`INSERT INTO question_bank (id, version, roles, question, active) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, roles = excluded.roles,
        question = excluded.question, active = 1
      WHERE question_bank.version != excluded.version OR question_bank.roles != excluded.roles
        OR question_bank.question != excluded.question OR question_bank.active != 1`)
    let updated = 0
    for (const item of bank) updated += Number(save.run(item.id, item.version, JSON.stringify(item.roles), JSON.stringify(item.question)).changes)
    const deactivate = db.prepare('UPDATE question_bank SET active = 0 WHERE id = ?')
    const active = db.prepare('SELECT id FROM question_bank WHERE active = 1').all() as { id: string }[]
    let deactivated = 0
    for (const row of active) if (!ids.has(row.id)) deactivated += Number(deactivate.run(row.id).changes)
    db.exec('COMMIT')
    return { active: bank.length, updated, deactivated }
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function availableQuestions(db: DatabaseSync): BankQuestion[] {
  const rows = db.prepare('SELECT id, version, roles, question FROM question_bank WHERE active = 1 ORDER BY id').all() as unknown as
    { id: string; version: string; roles: string; question: string }[]
  return rows.map((row) => validateBankQuestion({ id: row.id, version: row.version,
    roles: JSON.parse(row.roles) as unknown, question: JSON.parse(row.question) as unknown }))
}
