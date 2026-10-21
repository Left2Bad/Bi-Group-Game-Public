import type { AssessmentResult, BuildRecommendations, DevelopmentPlan } from '../domain/types'
import { createActionStorage } from '../storage/actions'
import type { StorageProvider } from '../storage/shared'
import { HISTORY_LIMIT } from '../storage/attempts'

import { msg } from '../i18n/translate'
interface DevelopmentSnapshot {
  readonly plan: DevelopmentPlan | null
  readonly completedIds: readonly string[]
  readonly notice: string | null
  readonly warning: boolean
}

/** Сохраняет только отметки практик; результат и черновик теста сюда не записываются. */
export function createDevelopmentSession({ result, buildRecommendations, getStorage }: {
  readonly result: AssessmentResult
  readonly buildRecommendations: BuildRecommendations | undefined
  readonly getStorage: StorageProvider
}) {
  let plan: DevelopmentPlan | null = null
  try { plan = buildRecommendations ? structuredClone(buildRecommendations(result)) : null } catch { /* UI покажет состояние недоступного плана. */ }
  const storage = createActionStorage({ attemptId: result.attemptId, versions: result.versions,
    recommendationIds: plan?.recommendations.map((item) => item.id) ?? [], getStorage })
  const loaded = storage.loadActions()
  let snapshot: DevelopmentSnapshot = {
    plan, completedIds: loaded.status === 'loaded' ? loaded.completedIds : [],
    notice: loaded.status === 'empty' || loaded.status === 'loaded' ? msg('Отметки сохраняются в этом браузере.')
      : msg('Не удалось прочитать сохранённые отметки. Изменения останутся в памяти до перезагрузки; сохранённые данные не перезаписаны.'),
    warning: loaded.status !== 'empty' && loaded.status !== 'loaded',
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setCompleted(id: string, completed: boolean) {
      if (!plan?.recommendations.some((item) => item.id === id)) return
      // После отказа сохраняем весь набор в памяти до remount, не теряем предыдущие несохранённые отметки.
      const saved = snapshot.warning ? { ok: false as const } : storage.setCompleted(id, completed)
      const memoryIds = new Set(snapshot.completedIds)
      if (completed) memoryIds.add(id); else memoryIds.delete(id)
      snapshot = { ...snapshot, completedIds: saved.ok ? saved.completedIds : [...memoryIds],
        notice: saved.ok ? msg('Отметки сохранены в этом браузере.')
          : msg('Не удалось сохранить отметки. Изменения остаются в памяти до перезагрузки; сохранённые данные не перезаписаны.'),
        warning: !saved.ok }
      for (const listener of listeners) listener()
    },
  }
}

/** Сохраняет memory-only отметки при переходах SPA; очищается вместе с личными данными. */
export function createDevelopmentSessions(getStorage: StorageProvider) {
  const sessions = new Map<string, ReturnType<typeof createDevelopmentSession>>()
  return {
    get(result: AssessmentResult, buildRecommendations: BuildRecommendations | undefined) {
      const key = JSON.stringify([result.attemptId, result.versions.schema, result.versions.assessment,
        result.versions.scoring, result.versions.recommendations])
      const existing = sessions.get(key)
      if (existing) return existing
      const created = createDevelopmentSession({ result, buildRecommendations, getStorage })
      sessions.set(key, created)
      if (sessions.size > HISTORY_LIMIT) {
        const oldest = sessions.keys().next().value
        if (oldest) sessions.delete(oldest)
      }
      return created
    },
    clear() { sessions.clear() },
  }
}
