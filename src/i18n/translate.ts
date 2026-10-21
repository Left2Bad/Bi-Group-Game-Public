/**
 * Локализация интерфейса (пункт 16).
 *
 * Ключом служит исходная русская строка: русский вариант всегда совпадает с исходником,
 * а при отсутствии перевода пользователь видит русский текст, а не пустое место или ключ.
 * Строки с подстановками записываются как «Ситуация {n} из {total}».
 *
 * Тексты самого теста (ситуации, варианты ответов, открытые вопросы, обоснования баллов) в словарь не входят
 * и всегда показываются по-русски. Остальное содержимое из данных (архетипы, рекомендации, уроки) помечается msg()
 * и переводится в en-content.ts; для казахского оно пока остаётся русским (docs/internal/PLAN.md, X-04).
 */
export const LANGS = ['ru', 'kk', 'en'] as const
export type Lang = typeof LANGS[number]
export const DEFAULT_LANG: Lang = 'ru'
export const LANG_STORAGE_KEY = 'bi-academy:lang'

/** Названия языков пишутся на самих языках, чтобы их можно было найти, не понимая текущий. */
export const LANG_NAMES: Readonly<Record<Lang, { readonly short: string; readonly full: string }>> = {
  ru: { short: 'RU', full: 'Русский' },
  kk: { short: 'ҚАЗ', full: 'Қазақша' },
  en: { short: 'EN', full: 'English' },
}

export type TranslateParams = Readonly<Record<string, string | number>>
export type Translate = (source: string, params?: TranslateParams) => string
export type Dictionary = Readonly<Record<string, string>>

/**
 * Помечает строку как переводимую там, где её нельзя сразу перевести (константы уровня модуля).
 * Возвращает строку без изменений; в месте показа вызывается t(значение).
 */
export const msg = <T extends string>(source: T): T => source

export const isLang = (value: unknown): value is Lang => typeof value === 'string' && (LANGS as readonly string[]).includes(value)

export function interpolate(text: string, params?: TranslateParams): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name]
    return value === undefined ? placeholder : String(value)
  })
}

export function createTranslator(lang: Lang, dictionary: Dictionary): Translate {
  return (source, params) => interpolate(lang === 'ru' ? source : dictionary[source] ?? source, params)
}

/** Переводчик по умолчанию для логики без языка: возвращает русский исходник с подставленными значениями. */
export const russian: Translate = createTranslator('ru', {})

/**
 * Сохранённый выбор важнее языка браузера. Из языков браузера берётся первый поддерживаемый в порядке предпочтения:
 * у русскоязычного пользователя английский обычно стоит вторым, и он не должен переключать интерфейс.
 * Остальные языки дают русский.
 */
export function detectLang(stored: string | null, browserLanguages: readonly string[]): Lang {
  if (isLang(stored)) return stored
  for (const language of browserLanguages) {
    const code = language.toLowerCase()
    const match = LANGS.find((lang) => code === lang || code.startsWith(`${lang}-`) || code.startsWith(`${lang}_`))
    if (match) return match
  }
  return DEFAULT_LANG
}

/** Английский — британский вариант: день идёт перед месяцем и 24-часовой формат, как в русских и казахских датах. */
const DATE_LOCALES: Readonly<Record<Lang, string>> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }
export const dateLocale = (lang: Lang): string => DATE_LOCALES[lang]

/** Названия плейсхолдеров в строке, например {n} и {total}. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort()
}
