import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { StorageProvider } from '../storage/shared'
import { I18nContext } from './context'
import { translatorFor } from './dictionaries'
import { localizeCode } from './letters'
import { detectLang, LANG_STORAGE_KEY, msg } from './translate'
import type { Lang } from './translate'

/** То же описание, что в index.html: до загрузки скрипта страница отдаёт русский текст, дальше его заменяет язык интерфейса. */
const PAGE_DESCRIPTION = msg('BI Academy — 15 рабочих ситуаций со стройплощадки: профиль из четырёх качеств, рабочий архетип и план развития на 30 дней.')

function readStoredLang(getStorage: StorageProvider): string | null {
  try { return getStorage().getItem(LANG_STORAGE_KEY) } catch { return null }
}

/** Язык — настройка, а не данные пользователя: хранится отдельно и не стирается кнопкой «Удалить мои данные». */
export function I18nProvider({ children, getStorage }: { readonly children: ReactNode; readonly getStorage: StorageProvider }) {
  const [lang, setLangState] = useState<Lang>(() =>
    detectLang(readStoredLang(getStorage), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]))
  const value = useMemo(() => ({
    lang,
    t: translatorFor(lang),
    code: (code: string) => localizeCode(lang, code),
    setLang: (next: Lang) => {
      setLangState(next)
      try { getStorage().setItem(LANG_STORAGE_KEY, next) } catch { /* Выбор действует до закрытия вкладки. */ }
    },
  }), [lang, getStorage])
  useEffect(() => {
    document.documentElement.lang = lang
    document.querySelector('meta[name="description"]')?.setAttribute('content', value.t(PAGE_DESCRIPTION))
  }, [lang, value])
  return <I18nContext value={value}>{children}</I18nContext>
}
