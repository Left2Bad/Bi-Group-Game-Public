import type { AssessmentResult } from '../domain/types'
import type { DynamicAttempt } from '../dynamic/domain'
import type { AvatarParams } from '../domain/avatar'
import type { FieldErrors } from '../domain/account-validation'
import { translateNow } from '../i18n/dictionaries'
export type { UserRole, Registration } from '../domain/account-validation'

import type { UserRole } from '../domain/account-validation'
import { msg } from '../i18n/translate'
export interface AccountUser { readonly id: string; readonly name: string; readonly email: string; readonly role: UserRole }
export interface TeamInfo { readonly id: string; readonly name: string; readonly inviteCode: string; readonly memberCount: number }
export interface TeamEmployee {
  readonly id: string; readonly name: string; readonly email: string
  /** Без согласия сервер не передаёт результаты, историю и аватар: поля ниже пустые. */
  readonly consented: boolean
  readonly result: AssessmentResult | null
  readonly dynamicResult?: DynamicAttempt | null
  readonly dynamicBaseline?: DynamicAttempt | null
  /** Самая ранняя из сохранённых попыток — входная оценка для динамики. */
  readonly baseline: AssessmentResult | null
  readonly attemptCount: number
  readonly avatar: AvatarParams | null
}
/** Карточка развития одного сотрудника: сервер отдаёт её только руководителю команды при действующем согласии. */
export interface MemberCard {
  readonly member: { readonly id: string; readonly name: string }
  readonly avatar: AvatarParams | null
  /** history — все завершённые попытки по возрастанию даты; у прежних попыток вопросы и ответы не передаются. */
  readonly dynamic: { readonly latest: DynamicAttempt; readonly history: readonly DynamicAttempt[]; readonly marks: readonly { readonly week: number; readonly completedAt: string }[]; readonly comments: readonly RouteComment[] } | null
  readonly legacy: { readonly latest: AssessmentResult; readonly baseline: AssessmentResult; readonly count: number } | null
}
/** Комментарий руководителя к неделе маршрута. `mine` приходит только в ответах руководителю. */
export interface RouteComment { readonly id: string; readonly week: number; readonly text: string; readonly managerName: string; readonly createdAt: string; readonly mine?: boolean }
export const ROUTE_COMMENT_MAX = 1000
export interface Membership { readonly id: string; readonly name: string; readonly managerName: string; readonly consented: boolean }
export class ApiError extends Error {
  readonly status: number
  readonly fields: FieldErrors
  constructor(message: string, status: number, fields: FieldErrors = {}, readonly code?: string) { super(message); this.name = 'ApiError'; this.status = status; this.fields = fields }
}

let accountId: string | null = null
export function setApiAccount(id: string | null) { accountId = id }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  // Model work runs in a server job; each HTTP request only starts or polls that job.
  const timeout = setTimeout(() => controller.abort(), 15_000)
  const cancel = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) cancel()
  options.signal?.addEventListener('abort', cancel, { once: true })
  let response: Response | undefined
  let data: { error?: string; fields?: FieldErrors; code?: string } | null
  try {
    response = await fetch(`/api${path}`, { ...options, signal: controller.signal, credentials: 'same-origin', headers: {
      'Content-Type': 'application/json', 'X-BI-Academy': '1', ...(accountId ? { 'X-BI-User': accountId } : {}), ...options.headers,
    } })
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('bi-academy:auth-expired'))
    data = await response.json() as typeof data
  } catch {
    if (controller.signal.aborted) throw new Error(msg('Сервер не ответил вовремя. Попробуйте ещё раз.'))
    if (response) {
      if ([502, 503, 504, 524].includes(response.status)) throw new Error(translateNow('Прокси или хостинг оборвал запрос (код {status}). Повторите действие: уже запущенная генерация не будет создана заново.', { status: response.status }))
      throw new Error(msg('Сервер вернул некорректный ответ. Обновите страницу и попробуйте ещё раз.'))
    }
    throw new Error(msg('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.'))
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', cancel)
  }
  if (!response.ok) {
    throw new ApiError(data?.error ?? msg('Не удалось выполнить запрос. Попробуйте ещё раз.'), response.status, data?.fields, data?.code)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(msg('Сервер вернул некорректный ответ. Обновите страницу и попробуйте ещё раз.'))
  return data as T
}

export const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

// Запись и удаление упорядочены: отложенная отправка не восстанавливает удалённые результаты.
let writes: Promise<unknown> = Promise.resolve()
export function saveAccountAttempt(attempt: AssessmentResult) {
  const expectedAccount = accountId
  const next = writes.catch(() => {}).then(() => {
    if (accountId !== expectedAccount) throw new Error(msg('Аккаунт изменился. Обновите страницу.'))
    return api('/attempts', post({ attemptId: attempt.attemptId, completedAt: attempt.completedAt, answers: attempt.answers, versions: attempt.versions }))
  })
  writes = next
  return next
}
export function deleteAccountAttempts() {
  const expectedAccount = accountId
  const next = writes.catch(() => {}).then(async () => {
    if (accountId !== expectedAccount) throw new Error(msg('Аккаунт изменился. Обновите страницу.'))
    const result = await api('/attempts', { method: 'DELETE' })
    window.dispatchEvent(new Event('bi-academy:attempts-changed'))
    return result
  })
  writes = next
  return next
}
