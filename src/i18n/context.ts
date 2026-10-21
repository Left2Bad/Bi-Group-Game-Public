import { createContext, useContext } from 'react'
import { DEFAULT_LANG } from './translate'
import { translatorFor } from './dictionaries'
import type { Lang, Translate } from './translate'

export interface I18nValue {
  readonly lang: Lang
  readonly setLang: (lang: Lang) => void
  readonly t: Translate
  /** Код архетипа или его буква буквами текущего языка. */
  readonly code: (code: string) => string
}

/** Без провайдера (например, в тестах отдельных страниц) интерфейс остаётся русским. */
export const defaultI18n: I18nValue = { lang: DEFAULT_LANG, setLang: () => {}, t: translatorFor(DEFAULT_LANG), code: (code) => code }

export const I18nContext = createContext<I18nValue>(defaultI18n)

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
