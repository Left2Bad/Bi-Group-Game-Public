import type { Lang } from './translate'

/**
 * Буквы кода архетипа. Внутри данных код всегда русский (АРСН): по нему хранятся профили, аватары и ссылки.
 * Пользователю код показывается буквами того языка, на котором названы полюса, чтобы буква совпадала с первой буквой названия:
 * kk — Талдаушы, Іскер, Шешімді, Келісімпаз, Жүйелі, Икемді, Бірлескен, Дербес; en — Analyst, Practitioner, Resolute, Diplomat,
 * Systematic, Flexible, Collaborative, Independent.
 */
const LETTERS: Readonly<Record<Exclude<Lang, 'ru'>, Readonly<Record<string, string>>>> = {
  kk: { 'А': 'Т', 'П': 'І', 'Р': 'Ш', 'Д': 'К', 'С': 'Ж', 'Г': 'И', 'К': 'Б', 'Н': 'Д' },
  en: { 'А': 'A', 'П': 'P', 'Р': 'R', 'Д': 'D', 'С': 'S', 'Г': 'F', 'К': 'C', 'Н': 'I' },
}

/** Код или одна буква для показа на выбранном языке; для русского возвращается без изменений. */
export function localizeCode(lang: Lang, code: string): string {
  if (lang === 'ru') return code
  const map = LETTERS[lang]
  return Array.from(code, (letter) => map[letter] ?? letter).join('')
}
