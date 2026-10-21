import type { Answers, DataVersions, Question } from '../domain/types'

export const STORAGE_KEYS = {
  draft: 'bi-academy:draft',
  attempts: 'bi-academy:attempts',
  actions: 'bi-academy:actions',
  avatar: 'bi-academy:avatar',
} as const

export type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type StorageProvider = () => StorageAccess
export type StorageWriteResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'unavailable' }

export interface StorageContext {
  readonly questions: readonly Question[]
  readonly versions: DataVersions
  /** Получение storage отложено до операции: SecurityError тоже обрабатывается. */
  readonly getStorage?: StorageProvider
}

export const browserStorage: StorageProvider = () => window.localStorage

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isVersions(value: unknown): value is DataVersions {
  return isRecord(value) && Number.isInteger(value.schema) && Number(value.schema) > 0
    && ['assessment', 'scoring', 'recommendations'].every((key) => typeof value[key] === 'string' && value[key].length > 0)
}

export function sameVersions(left: DataVersions, right: DataVersions): boolean {
  return left.schema === right.schema && left.assessment === right.assessment
    && left.scoring === right.scoring && left.recommendations === right.recommendations
}

export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}

/** Проверка формы сохранённых ответов; не содержит правил начисления баллов C. */
export function isKnownAnswers(value: unknown, questions: readonly Question[], complete = false): value is Answers {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length > questions.length || (complete && entries.length !== questions.length)) return false
  const catalog = new Map(questions.map((question) => [question.id, question]))
  return entries.every(([questionId, optionId]) => {
    const question = catalog.get(questionId)
    return typeof optionId === 'string' && !!question?.options.some((option) => option.id === optionId)
  })
}

/** Удаляем только собственные ключи приложения, пытаясь удалить каждый даже при частичном отказе. */
export function clearAppData(getStorage: StorageProvider = browserStorage): StorageWriteResult {
  try {
    const storage = getStorage()
    let failed = false
    for (const key of Object.values(STORAGE_KEYS)) {
      try { storage.removeItem(key) } catch { failed = true }
    }
    return failed ? { ok: false, reason: 'unavailable' } : { ok: true }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}
