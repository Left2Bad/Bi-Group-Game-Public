import { en } from './en'
import { kk } from './kk'
import { createTranslator, isLang } from './translate'
import type { Dictionary, Lang, Translate, TranslateParams } from './translate'

/** Словарь каждого языка, кроме русского (русский равен ключам). Без словаря для нового языка TypeScript не соберёт проект. */
export const DICTIONARIES: Readonly<Record<Exclude<Lang, 'ru'>, Dictionary>> = { kk, en }

export const translatorFor = (lang: Lang): Translate => createTranslator(lang, lang === 'ru' ? {} : DICTIONARIES[lang])

/** Перевод вне React (ошибки сети): язык берётся из атрибута html, который выставляет I18nProvider. */
export function translateNow(source: string, params?: TranslateParams): string {
  const lang = typeof document === 'undefined' ? null : document.documentElement.lang
  return translatorFor(isLang(lang) ? lang : 'ru')(source, params)
}
