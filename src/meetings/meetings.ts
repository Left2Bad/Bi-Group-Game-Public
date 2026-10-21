import { dateLocale, msg } from '../i18n/translate'
import type { Lang } from '../i18n/translate'
export type MeetingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

/** Беседа руководителя с сотрудником. Даты — ISO; `unseen` — требует внимания зрителя (считает сервер). */
export interface Meeting {
  readonly id: string
  readonly teamId: string
  readonly teamName: string
  readonly employeeId: string
  readonly employeeName: string
  readonly managerName: string
  readonly at: string
  readonly message: string
  readonly status: MeetingStatus
  readonly createdAt: string
  readonly respondedAt: string | null
  readonly unseen: boolean
}
export interface MeetingsPayload { readonly meetings: readonly Meeting[]; readonly unread: number }

export const MEETING_MESSAGE_MAX = 500
/** Событие: беседы изменились; шапка и страница команды перезагружают списки. */
export const MEETINGS_CHANGED = 'bi-academy:meetings-changed'

export const STATUS_TEXT: Readonly<Record<MeetingStatus, string>> = {
  pending: msg('Ждёт ответа'), accepted: msg('Принято'), declined: msg('Отклонено'), cancelled: msg('Отменено руководителем'),
}

/** «25 октября, 14:00» по времени устройства, как и поле выбора даты. */
export const formatMeetingDate = (iso: string, lang: Lang = 'ru') => new Date(iso).toLocaleString(dateLocale(lang), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export const isUpcoming = (meeting: Meeting, now = Date.now()) => (meeting.status === 'pending' || meeting.status === 'accepted') && Date.parse(meeting.at) >= now

/** Значение поля datetime-local («2026-10-25T14:00») для ближайшего подходящего времени. */
export function defaultMeetingValue(now = new Date()): string {
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  next.setMinutes(0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:00`
}
