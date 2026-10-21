import type { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTENT_LANGS } from '../src/dynamic/content-i18n.ts'
import type { ContentLang, TranslationStatus } from '../src/dynamic/content-i18n.ts'
import { aiFailure, translateTexts } from './dynamic-ai.ts'
import type { BankQuestion } from './question-bank.ts'

/**
 * Хранилище переводов сгенерированного контента.
 * owner = '' — переводы банка вопросов (общие, из server/bank/i18n); owner = id сотрудника — переводы его попыток,
 * сделанные моделью. Они удаляются вместе с историей и при сбросе аккаунта.
 */
export const BANK_OWNER = ''
const CHUNK = 25
const RETRY_AFTER_FAILURE_MS = 60_000

export const sourceHash = (text: string) => createHash('sha256').update(text).digest('hex')

export function createTranslationTable(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS content_translations (
    owner TEXT NOT NULL, lang TEXT NOT NULL, source_hash TEXT NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL,
    origin TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner, lang, source_hash)
  )`)
}

export function deleteOwnerTranslations(db: DatabaseSync, owner: string) {
  if (owner !== BANK_OWNER) db.prepare('DELETE FROM content_translations WHERE owner = ?').run(owner)
}

/** Перевод одного вопроса банка: те же поля, что у вопроса; варианты — по id. */
interface BankTranslation { readonly context: string; readonly text: string; readonly options: Readonly<Record<string, string>> }

function translationDirectory(lang: ContentLang) {
  const relative = new URL(`./bank/i18n/${lang}/`, import.meta.url)
  return existsSync(relative) ? relative : resolve(process.cwd(), 'server', 'bank', 'i18n', lang)
}

/** Читает все файлы переводов банка на языке: { [questionId]: BankTranslation }. */
export function bundledBankTranslations(lang: ContentLang): Record<string, BankTranslation> {
  const directory = translationDirectory(lang)
  if (!existsSync(directory)) return {}
  const result: Record<string, BankTranslation> = {}
  const base = typeof directory === 'string' ? directory : directory.pathname
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    const path = typeof directory === 'string' ? resolve(directory, file) : new URL(file, directory)
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, BankTranslation>
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Перевод банка ${base}${file}: ожидается объект.`)
    Object.assign(result, data)
  }
  return result
}

/**
 * Сопоставляет русские строки банка с готовыми переводами и сохраняет пары в базу.
 * Ключ — сама русская строка, поэтому перевод применяется и к уже сохранённым снимкам вопросов в попытках.
 */
export function seedBankTranslations(db: DatabaseSync, bank: readonly BankQuestion[]) {
  createTranslationTable(db)
  const save = db.prepare(`INSERT INTO content_translations (owner, lang, source_hash, source, text, origin, updated_at) VALUES (?, ?, ?, ?, ?, 'bank', ?)
    ON CONFLICT(owner, lang, source_hash) DO UPDATE SET text = excluded.text, source = excluded.source, updated_at = excluded.updated_at
    WHERE content_translations.text != excluded.text`)
  const now = Date.now()
  let saved = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const lang of CONTENT_LANGS) {
      const translations = bundledBankTranslations(lang)
      const pair = (source: string, text: unknown) => {
        if (typeof text !== 'string' || !text.trim() || !source.trim()) return
        saved += Number(save.run(BANK_OWNER, lang, sourceHash(source), source, text.trim(), now).changes)
      }
      for (const { id, question } of bank) {
        const item = translations[id]
        if (!item) continue
        pair(question.context, item.context)
        pair(question.text, item.text)
        for (const option of question.options) pair(option.text, item.options?.[option.id])
      }
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { saved }
}

/** Готовые переводы строк: сначала личные переводы владельца, затем общий банк. */
export function lookupTranslations(db: DatabaseSync, owner: string, lang: ContentLang, texts: readonly string[]): Record<string, string> {
  const find = db.prepare(`SELECT text FROM content_translations WHERE lang = ? AND source_hash = ? AND owner IN (?, ?)
    ORDER BY owner = ? DESC LIMIT 1`)
  const result: Record<string, string> = {}
  for (const source of texts) {
    const row = find.get(lang, sourceHash(source), owner, BANK_OWNER, owner) as { text: string } | undefined
    if (row) result[source] = row.text
  }
  return result
}

type Job = { running: boolean; failedAt?: number; error?: string }

/**
 * Фоновый перевод: запускается, когда пользователь выбрал язык, и переводит недостающие строки частями.
 * Каждая часть сразу сохраняется в базу, поэтому прогресс растёт постепенно, а повторное переключение языка мгновенное.
 */
export function createContentTranslator(db: DatabaseSync, translate: typeof translateTexts = translateTexts) {
  const jobs = new Map<string, Job>()
  const save = db.prepare(`INSERT INTO content_translations (owner, lang, source_hash, source, text, origin, updated_at) VALUES (?, ?, ?, ?, ?, 'ai', ?)
    ON CONFLICT(owner, lang, source_hash) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`)

  async function run(owner: string, lang: ContentLang, key: string, missing: readonly string[], job: Job) {
    try {
      for (let index = 0; index < missing.length; index += CHUNK) {
        const part = missing.slice(index, index + CHUNK)
        const translated = await translate(part, lang)
        const now = Date.now()
        part.forEach((source, position) => save.run(owner, lang, sourceHash(source), source, translated[position]!, now))
      }
      jobs.delete(key)
    } catch (error) {
      const failure = aiFailure(error, 'translation')
      job.running = false
      job.failedAt = Date.now()
      job.error = (failure.body as { error: string }).error
    }
  }

  /** Состояние перевода набора строк; при необходимости запускает перевод недостающих. */
  function status(owner: string, scope: string, lang: ContentLang, texts: readonly string[], options: { retry?: boolean } = {}): TranslationStatus {
    const found = lookupTranslations(db, owner, lang, texts)
    const missing = texts.filter((text) => !(text in found))
    const key = `${owner}:${scope}:${lang}`
    const base = { lang, total: texts.length, done: texts.length - missing.length, texts: found }
    if (missing.length === 0) { jobs.delete(key); return { ...base, state: 'ready' } }
    const job = jobs.get(key)
    if (job?.running) return { ...base, state: 'translating' }
    if (job?.failedAt && !options.retry && Date.now() - job.failedAt < RETRY_AFTER_FAILURE_MS)
      return { ...base, state: 'failed', ...(job.error ? { error: job.error } : {}) }
    const next: Job = { running: true }
    jobs.set(key, next)
    void run(owner, lang, key, missing, next)
    return { ...base, state: 'translating' }
  }

  return { status }
}
