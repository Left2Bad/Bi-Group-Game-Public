// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { availableQuestions, seedQuestionBank } from './question-bank.ts'
import { bundledBankTranslations, createContentTranslator, createTranslationTable, deleteOwnerTranslations, lookupTranslations, seedBankTranslations } from './content-translations.ts'
import { attemptTexts, CONTENT_LANGS, localizeAttempt } from '../src/dynamic/content-i18n.ts'
import type { DynamicAttempt } from '../src/dynamic/domain.ts'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('переводы банка вопросов', () => {
  it.each(CONTENT_LANGS)('у каждого из 300 вопросов есть полный перевод на %s', (lang) => {
    const db = new DatabaseSync(':memory:')
    try {
      seedQuestionBank(db)
      const bank = availableQuestions(db)
      const translations = bundledBankTranslations(lang)
      const cyrillic = /[а-яё]/i
      for (const { id, question } of bank) {
        const item = translations[id]
        expect(item, id).toBeDefined()
        expect(item!.context.trim(), id).not.toBe('')
        expect(item!.text.trim(), id).not.toBe('')
        for (const option of question.options) expect(item!.options[option.id]?.trim(), `${id} ${option.id}`).toBeTruthy()
        // Английский перевод не должен содержать кириллицу: значит, строка не осталась русской.
        if (lang === 'en') for (const value of [item!.context, item!.text, ...Object.values(item!.options)]) expect(cyrillic.test(value), `${id}: ${value}`).toBe(false)
      }
      seedBankTranslations(db, bank)
      const first = bank[0]!.question
      const found = lookupTranslations(db, 'someone', lang, [first.context, first.text, first.options[0]!.text])
      expect(Object.keys(found)).toHaveLength(3)
    } finally { db.close() }
  })
})

const attempt = (texts: { context: string; open: string }): DynamicAttempt => ({
  id: 'attempt-1', method: 'm', promptVersion: 'p', model: 'x', jobRole: 'прораб', createdAt: '2026-10-01T00:00:00.000Z', completedAt: null,
  status: 'open', choiceAnswers: {}, openAnswers: { O1: 'Мой ответ остаётся без перевода.' }, evaluation: null,
  choices: [{ id: 'C1', context: texts.context, text: 'Как поступите?', primaryTrait: 'confidence', secondaryTrait: 'discipline',
    options: [{ id: 'A', text: 'Вариант А', primary: 4, secondary: 1 }] }],
  openQuestions: [{ id: 'O1', text: texts.open, trait: 'confidence' }],
})

describe('фоновый перевод попытки', () => {
  it('переводит недостающие строки, хранит их в базе и не трогает ответы сотрудника', async () => {
    const db = new DatabaseSync(':memory:')
    createTranslationTable(db)
    const calls: string[][] = []
    const translator = createContentTranslator(db, async (texts, lang) => { calls.push([...texts]); return texts.map((text) => `${lang}:${text}`) })
    const item = attempt({ context: 'Ситуация на объекте.', open: 'Опишите порядок действий.' })
    const texts = attemptTexts(item)
    expect(texts).not.toContain('Мой ответ остаётся без перевода.')
    expect(translator.status('user-1', 'a', 'kk', texts)).toMatchObject({ state: 'translating', done: 0, total: texts.length })
    await settle()
    const ready = translator.status('user-1', 'a', 'kk', texts)
    expect(ready).toMatchObject({ state: 'ready', done: texts.length })
    expect(calls).toHaveLength(1)
    const localized = localizeAttempt(item, ready.texts)
    expect(localized.openQuestions[0]!.text).toBe('kk:Опишите порядок действий.')
    expect(localized.openAnswers.O1).toBe('Мой ответ остаётся без перевода.')
    // Новый вопрос: переводится только он.
    const grown = { ...item, openQuestions: [...item.openQuestions, { id: 'O2', text: 'Второй вопрос.', trait: 'discipline' as const }] }
    translator.status('user-1', 'a', 'kk', attemptTexts(grown))
    await settle()
    expect(calls.at(-1)).toEqual(['Второй вопрос.'])
    // Чужие переводы не видны, удаление истории стирает личные переводы.
    expect(lookupTranslations(db, 'user-2', 'kk', texts)).toEqual({})
    deleteOwnerTranslations(db, 'user-1')
    expect(lookupTranslations(db, 'user-1', 'kk', texts)).toEqual({})
    db.close()
  })

  it('после сбоя сообщает ошибку и повторяет только по запросу', async () => {
    const db = new DatabaseSync(':memory:')
    createTranslationTable(db)
    let fail = true
    const translator = createContentTranslator(db, async (texts) => { if (fail) throw new Error('down'); return texts.map((text) => `en:${text}`) })
    const texts = ['Строка для перевода.']
    translator.status('u', 's', 'en', texts)
    await settle()
    expect(translator.status('u', 's', 'en', texts)).toMatchObject({ state: 'failed' })
    fail = false
    expect(translator.status('u', 's', 'en', texts, { retry: true })).toMatchObject({ state: 'translating' })
    await settle()
    expect(translator.status('u', 's', 'en', texts)).toMatchObject({ state: 'ready', texts: { 'Строка для перевода.': 'en:Строка для перевода.' } })
    db.close()
  })
})
