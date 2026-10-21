import { TRAIT_IDS } from '../domain/types'
import type { AssessmentResult, TraitId } from '../domain/types'
import { browserStorage, isRecord, isTimestamp, isVersions, sameVersions, STORAGE_KEYS } from './shared'
import type { StorageProvider, StorageWriteResult } from './shared'

export const HISTORY_LIMIT = 10
const HISTORY_SCHEMA = 1
const MAX_HISTORY_LENGTH = 512 * 1024

export type HistoryLoadResult =
  | { readonly status: 'loaded'; readonly attempts: readonly AssessmentResult[] }
  | { readonly status: 'empty' | 'invalid' | 'incompatible' | 'unavailable' }
export type HistorySaveResult =
  | { readonly ok: true; readonly attempts: readonly AssessmentResult[] }
  | { readonly ok: false; readonly reason: 'invalid' | 'incompatible' | 'unavailable' | 'conflict' }

/** Проверка сериализованной формы. Достоверность баллов при восстановлении проверяет вычислитель C. */
export function isAssessmentSnapshot(value: unknown): value is AssessmentResult {
  if (!isRecord(value) || typeof value.attemptId !== 'string' || !value.attemptId || value.attemptId.length > 128
    || !isTimestamp(value.completedAt) || !isVersions(value.versions) || !isRecord(value.answers)
    || Object.keys(value.answers).length !== 15 || !Object.values(value.answers).every((option) => typeof option === 'string')
    || !isRecord(value.traits) || Object.keys(value.traits).length !== TRAIT_IDS.length) return false
  // В методике v2 ситуация влияет на два качества: вопрос встречается в evidence 1–2 раза, но не дважды в одном качестве.
  const questionUses = new Map<string, number>()
  for (const trait of TRAIT_IDS) {
    const seenInTrait = new Set<string>()
    const result = value.traits[trait]
    if (!isRecord(result) || result.trait !== trait || typeof result.points !== 'number' || !Number.isInteger(result.points)
      || typeof result.maxPoints !== 'number' || !Number.isInteger(result.maxPoints) || result.maxPoints <= 0
      || result.points < 0 || result.points > result.maxPoints || typeof result.percent !== 'number'
      || !Number.isInteger(result.percent) || result.percent < 0 || result.percent > 100
      || !['priority', 'developing', 'strength'].includes(String(result.level)) || !Array.isArray(result.evidence)
      || result.evidence.length === 0) return false
    for (const item of result.evidence) {
      if (!isRecord(item) || item.trait !== trait || typeof item.questionId !== 'string'
        || typeof item.optionId !== 'string' || value.answers[item.questionId] !== item.optionId
        || typeof item.points !== 'number' || ![0, 1, 2, 3].includes(item.points)
        || typeof item.reason !== 'string' || typeof item.developmentTag !== 'string' || seenInTrait.has(item.questionId)) return false
      seenInTrait.add(item.questionId)
      questionUses.set(item.questionId, (questionUses.get(item.questionId) ?? 0) + 1)
    }
  }
  return questionUses.size === 15 && [...questionUses.values()].every((uses) => uses <= 2)
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}

export function sameAssessmentSnapshot(left: AssessmentResult, right: AssessmentResult): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

export function createAttemptStorage(getStorage: StorageProvider = browserStorage) {
  function loadAttempts(): HistoryLoadResult {
    let raw: string | null
    try { raw = getStorage().getItem(STORAGE_KEYS.attempts) } catch { return { status: 'unavailable' } }
    if (raw === null) return { status: 'empty' }
    if (raw.length > MAX_HISTORY_LENGTH) return { status: 'invalid' }
    try {
      const value: unknown = JSON.parse(raw)
      if (!isRecord(value) || typeof value.schema !== 'number') return { status: 'invalid' }
      if (value.schema !== HISTORY_SCHEMA) return { status: 'incompatible' }
      if (!Array.isArray(value.attempts) || value.attempts.length > HISTORY_LIMIT
        || !value.attempts.every(isAssessmentSnapshot)
        || new Set(value.attempts.map((attempt: AssessmentResult) => attempt.attemptId)).size !== value.attempts.length) return { status: 'invalid' }
      return { status: 'loaded', attempts: structuredClone(value.attempts) }
    } catch { return { status: 'invalid' } }
  }

  function appendChecked(result: AssessmentResult): HistorySaveResult {
    if (!isAssessmentSnapshot(result)) return { ok: false, reason: 'invalid' }
    const loaded = loadAttempts()
    if (loaded.status !== 'loaded' && loaded.status !== 'empty') return { ok: false, reason: loaded.status }
    const previous = loaded.status === 'loaded' ? loaded.attempts : []
    const existing = previous.find((attempt) => attempt.attemptId === result.attemptId)
    if (existing) return sameAssessmentSnapshot(existing, result)
      ? { ok: true, attempts: previous } : { ok: false, reason: 'conflict' }
    const attempts = structuredClone([result, ...previous].slice(0, HISTORY_LIMIT))
    const raw = JSON.stringify({ schema: HISTORY_SCHEMA, attempts })
    if (raw.length > MAX_HISTORY_LENGTH) return { ok: false, reason: 'invalid' }
    try { getStorage().setItem(STORAGE_KEYS.attempts, raw); return { ok: true, attempts } }
    catch { return { ok: false, reason: 'unavailable' } }
  }

  return { loadAttempts, replaceAttempts(attempts: readonly AssessmentResult[]): StorageWriteResult {
    if (attempts.length > HISTORY_LIMIT || !attempts.every(isAssessmentSnapshot)) return { ok: false, reason: 'unavailable' }
    try { getStorage().setItem(STORAGE_KEYS.attempts, JSON.stringify({ schema: HISTORY_SCHEMA, attempts })); return { ok: true } }
    catch { return { ok: false, reason: 'unavailable' } }
  }, appendAttempt(result: AssessmentResult): HistorySaveResult {
    try { return appendChecked(result) } catch { return { ok: false, reason: 'invalid' } }
  } }
}

export type ComparisonResult =
  | { readonly ok: true; readonly delta: Readonly<Record<TraitId, number>> }
  | { readonly ok: false; readonly reason: 'incompatible' | 'same-attempt' }

/** Дельта отображаемых процентов в п.п.; не утверждает рост профессионального навыка. */
export function compareAttempts(before: AssessmentResult, after: AssessmentResult): ComparisonResult {
  if (!sameVersions(before.versions, after.versions)) return { ok: false, reason: 'incompatible' }
  if (before.attemptId === after.attemptId) return { ok: false, reason: 'same-attempt' }
  return { ok: true, delta: {
    criticalThinking: after.traits.criticalThinking.percent - before.traits.criticalThinking.percent,
    confidence: after.traits.confidence.percent - before.traits.confidence.percent,
    discipline: after.traits.discipline.percent - before.traits.discipline.percent,
    engagement: after.traits.engagement.percent - before.traits.engagement.percent,
  } }
}
