import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../server/database.ts'
import { validateBankQuestion } from '../server/question-bank.ts'

const source = process.argv[2]
if (!source) {
  console.error('Использование: node scripts/import-question-bank.mjs <questions.json>')
  process.exit(1)
}

const data = JSON.parse(readFileSync(resolve(source), 'utf8'))
if (!Array.isArray(data) || data.length === 0) throw new Error('Ожидается непустой JSON-массив вопросов.')
const rows = data.map(validateBankQuestion)
if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('В файле повторяются ID вопросов.')

const databasePath = process.env.DATABASE_PATH ?? fileURLToPath(new URL('../data/academy.sqlite', import.meta.url))
const db = openDatabase(databasePath)
try {
  db.exec('BEGIN IMMEDIATE')
  try {
    const save = db.prepare(`INSERT INTO question_bank (id, version, roles, question, active) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, roles = excluded.roles,
        question = excluded.question, active = 1`)
    for (const row of rows) save.run(row.id, row.version, JSON.stringify(row.roles), JSON.stringify(row.question))
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  console.log(`Загружено вопросов: ${rows.length}. База: ${databasePath}`)
} finally { db.close() }
