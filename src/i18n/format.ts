import { dateLocale } from './translate'
import type { Lang } from './translate'

/** «20 октября 2026 г.» / «20 October 2026»: дата в часовом поясе площадки (UTC+5), на языке интерфейса. */
export const longDate = (lang: Lang, value: string | Date): string =>
  new Date(value).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Qyzylorda' })
