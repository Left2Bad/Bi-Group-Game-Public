// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { availableQuestions, bundledQuestions, initialBank, seedQuestionBank, synchronizeQuestionBank, validateBankQuestion } from './question-bank.ts'
import type { BankQuestion } from './question-bank.ts'
import { openDatabase } from './database.ts'

describe('готовый банк вопросов', () => {
  it('сверяет 300 вопросов при каждом запуске и восстанавливает активность записей из исходников', () => {
    const db = new DatabaseSync(':memory:')
    try {
      seedQuestionBank(db)
      expect(availableQuestions(db)).toHaveLength(300)
      db.prepare('UPDATE question_bank SET active = 0 WHERE id = ?').run('Q01')
      expect(availableQuestions(db)).toHaveLength(299)
      seedQuestionBank(db)
      expect(availableQuestions(db)).toHaveLength(300)
      expect(seedQuestionBank(db)).toEqual({ active: 300, updated: 0, deactivated: 0 })
    } finally { db.close() }
  })

  it('обновляет содержание без смены версии, добавляет новые ID и деактивирует удалённые', () => {
    const db = new DatabaseSync(':memory:')
    const [first, removed] = initialBank as readonly [BankQuestion, BankQuestion, ...BankQuestion[]]
    const added = { ...first, id: 'NEW_001', question: { ...first.question, id: 'NEW_001' } }
    const edited = { ...first, roles: ['новая должность'], question: { ...first.question, context: 'Обновлённая рабочая ситуация.',
      text: 'Какой подход вы выберете?', options: first.question.options.map((option, i) => i === 0
        ? { ...option, text: 'Новый вариант действия.', primary: 4, secondary: 0 } : option) } }
    try {
      synchronizeQuestionBank(db, [first, removed])
      expect(synchronizeQuestionBank(db, [edited, added])).toEqual({ active: 2, updated: 2, deactivated: 1 })
      expect(availableQuestions(db)).toEqual([added, edited].sort((a, b) => a.id.localeCompare(b.id)))
      expect(db.prepare('SELECT active, question FROM question_bank WHERE id = ?').get(removed.id))
        .toEqual({ active: 0, question: JSON.stringify(removed.question) })
      expect(synchronizeQuestionBank(db, [edited, added])).toEqual({ active: 2, updated: 0, deactivated: 0 })
      synchronizeQuestionBank(db, [edited, added, removed])
      expect(availableQuestions(db)).toHaveLength(3)
    } finally { db.close() }
  })

  it('не меняет рабочий банк при повреждённом источнике или ошибке записи', () => {
    const db = new DatabaseSync(':memory:')
    const source = initialBank.slice(0, 2)
    try {
      synchronizeQuestionBank(db, source)
      expect(() => synchronizeQuestionBank(db, [source[0]!, source[0]!])).toThrow(/ID/)
      expect(() => synchronizeQuestionBank(db, [{ ...source[0]!, roles: [''] }])).toThrow()
      db.exec(`CREATE TRIGGER reject_bank_update BEFORE UPDATE ON question_bank
        WHEN NEW.id = 'Q02' BEGIN SELECT RAISE(ABORT, 'test write failure'); END`)
      expect(() => synchronizeQuestionBank(db, source.map((row) => ({ ...row, version: 'updated' })))).toThrow(/test write failure/)
      expect(availableQuestions(db)).toEqual(source)
    } finally { db.close() }
  })

  it('при повторном открытии файла SQLite синхронизирует банк и сохраняет аккаунт и снимки попыток', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bi-bank-restart-'))
    const path = join(directory, 'academy.sqlite')
    let db = openDatabase(path)
    try {
      const source = initialBank[0]!
      const old = { ...source, id: 'OLD_001', question: { ...source.question, id: 'OLD_001' } }
      synchronizeQuestionBank(db, [old])
      db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('bank-user', 'Сотрудник', 'bank@example.test', 'unused', 'employee')
      const snapshot = JSON.stringify({ status: 'choices', choices: [old.question], choiceAnswers: { OLD_001: old.question.options[0]!.id } })
      const result = JSON.stringify({ status: 'completed', choices: [source.question], evaluation: { saved: true } })
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run('bank-user', 'started', snapshot, 1)
      db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run('bank-user', 'completed', result, 2)
      db.close()
      db = openDatabase(path)
      expect(availableQuestions(db)).toHaveLength(300)
      expect(db.prepare('SELECT active FROM question_bank WHERE id = ?').get(old.id)).toEqual({ active: 0 })
      expect(db.prepare('SELECT state FROM dynamic_attempts ORDER BY saved_at').all()).toEqual([{ state: snapshot }, { state: result }])
      expect(db.prepare('SELECT name FROM users WHERE id = ?').get('bank-user')).toEqual({ name: 'Сотрудник' })
    } finally {
      db.close()
      for (const file of readdirSync(directory)) unlinkSync(join(directory, file))
      rmdirSync(directory)
    }
  })

  it('охватывает разные должности и все четыре качества в каждой группе', () => {
    const bundled = bundledQuestions()
    expect(bundled).toHaveLength(285)
    const groups = new Map<string, BankQuestion[]>()
    for (const item of bundled) {
      const role = item.roles[0] ?? ''
      groups.set(role, [...(groups.get(role) ?? []), item])
    }
    expect(groups.size).toBeGreaterThanOrEqual(12)
    for (const [role, rows] of groups) {
      expect(role).toBeTruthy()
      expect(rows.length).toBeGreaterThanOrEqual(20)
      for (const trait of ['criticalThinking', 'confidence', 'discipline', 'engagement'])
        expect(rows.filter((item) => item.question.primaryTrait === trait || item.question.secondaryTrait === trait).length).toBeGreaterThanOrEqual(8)
    }
    const prompts = bundled.map((item) => `${item.question.context} ${item.question.text}`.toLowerCase().replace(/\s+/g, ' '))
    expect(new Set(prompts).size).toBe(bundled.length)
  })

  it('не допускает вопрос с неверными баллами или несуществующим качеством', () => {
    const source = initialBank[0]!
    expect(validateBankQuestion(source).id).toBe(source.id)
    expect(() => validateBankQuestion({ ...source, question: { ...source.question,
      options: source.question.options.map((option, index) => index === 0 ? { ...option, primary: 9 } : option),
    } })).toThrow()
    expect(() => validateBankQuestion({ ...source, question: { ...source.question, primaryTrait: 'unknown' } })).toThrow()
  })
})
