import { ANIMALS, AVATAR_LEXICON, AVATAR_OPTIONS } from '../content/avatar.ts'
import type { AvatarQuestionKey } from '../content/avatar.ts'

import { msg, russian } from '../i18n/translate.ts'
import type { Translate } from '../i18n/translate.ts'
type OptionOf<K extends AvatarQuestionKey> = typeof AVATAR_OPTIONS[K][number]
export type Animal = typeof ANIMALS[number]

export interface AvatarParams {
  readonly universe: OptionOf<'universe'>
  readonly gender: OptionOf<'gender'>
  readonly palette: OptionOf<'palette'>
  readonly role: OptionOf<'role'>
  readonly action: OptionOf<'action'>
  readonly motivation: OptionOf<'motivation'>
  readonly power: OptionOf<'power'>
  /** Только во вселенной «Животные»; null — зверь подбирается по роли. */
  readonly animal: Animal | null
  readonly skin: string
}

export type AvatarKey = AvatarQuestionKey | 'animal'

export const SKIN_TONES = ['#f3d0ac', '#edbe94', '#dda77b', '#c68a5c', '#a56c45'] as const

export const DEFAULT_AVATAR: AvatarParams = {
  universe: 'Животные', gender: 'Нейтральный', palette: 'Яркий', role: 'Стратег',
  action: 'Анализирую', motivation: 'Результат', power: 'Точность', animal: null, skin: '#edbe94',
}

const ROLE_ANIMAL: Readonly<Record<AvatarParams['role'], Animal>> = { 'Лидер': msg('Лев'), 'Стратег': msg('Лис'), 'Мастер': msg('Бобр'), 'Наставник': msg('Сова') }
const ROLE_SUFFIX: Readonly<Record<AvatarParams['role'], string>> = { 'Лидер': msg('лидер'), 'Стратег': msg('стратег'), 'Мастер': msg('мастер'), 'Наставник': msg('наставник') }
const FANTASY_NOUN: Readonly<Record<AvatarParams['role'], string>> = { 'Лидер': msg('Король'), 'Стратег': msg('Маг'), 'Мастер': msg('Гном'), 'Наставник': msg('Мудрец') }

export const animalOf = (params: Pick<AvatarParams, 'animal' | 'role'>): Animal => params.animal ?? ROLE_ANIMAL[params.role]

/** Имя героя: «Лис-стратег», «Самурай-лидер», «Маг-стратег». */
export function avatarName(params: Pick<AvatarParams, 'universe' | 'role' | 'animal'>, t: Translate = russian): string {
  const noun = params.universe === 'Животные' ? animalOf(params)
    : params.universe === 'Фэнтези' ? FANTASY_NOUN[params.role]
      : { 'Кино': msg('Супергерой'), 'Аниме': msg('Самурай'), 'Спорт': msg('Чемпион') }[params.universe]
  return `${t(noun)}-${t(ROLE_SUFFIX[params.role])}`
}

export interface PortraitLine { readonly name: string; readonly value: number }

/**
 * Портрет характера — дополнительный ориентир для руководителя, не оценка.
 * Каждый ответ добавляет баллы одной-двум линиям к базе 40; максимум 100.
 */
export function avatarPortrait(params: AvatarParams): readonly PortraitLine[] {
  const score = { lead: 40, team: 40, analytics: 40, creative: 40 }
  const add = (delta: Partial<typeof score>) => { for (const [key, value] of Object.entries(delta)) score[key as keyof typeof score] += value }
  add({ 'Лидер': { lead: 30 }, 'Стратег': { analytics: 30 }, 'Мастер': { analytics: 15, lead: 10 }, 'Наставник': { team: 30 } }[params.role])
  add({ 'Сразу в бой': { lead: 20 }, 'Анализирую': { analytics: 20 }, 'Советуюсь': { team: 20 }, 'Ищу нестандарт': { creative: 25 } }[params.action])
  add({ 'Результат': { lead: 10 }, 'Признание': { creative: 10 }, 'Развитие': { analytics: 10 }, 'Команда': { team: 15 } }[params.motivation])
  add({ 'Точность': { analytics: 10 }, 'Скорость': { lead: 10 }, 'Надёжность': { team: 10 }, 'Креатив': { creative: 20 } }[params.power])
  return [[msg('Лидерство'), score.lead], [msg('Командность'), score.team], [msg('Аналитика'), score.analytics], [msg('Креативность'), score.creative]]
    .map(([name, value]) => ({ name: name as string, value: Math.min(100, value as number) }))
}

export interface ParsedDescription {
  readonly values: Partial<{ -readonly [K in keyof AvatarParams]: AvatarParams[K] }>
  /** Какое слово описания дало значение — показываем сотруднику, что поняла система. */
  readonly matches: Partial<Record<AvatarKey, string>>
}

/** Разбор свободного описания в браузере, без внешних сервисов: только значения из фиксированных списков. */
export function parseDescription(text: string): ParsedDescription {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `
  const values: Record<string, string> = {}
  const matches: Partial<Record<AvatarKey, string>> = {}
  for (const [key, entries] of Object.entries(AVATAR_LEXICON) as [AvatarKey, readonly (readonly [string, readonly string[]])[]][]) {
    for (const [value, stems] of entries) {
      const stem = stems.find((item) => haystack.includes(item))
      if (stem) { values[key] = value; matches[key] = stem.trim().replace(/[.,]$/, ''); break }
    }
  }
  if (values.animal && !values.universe) { values.universe = 'Животные'; if (matches.animal) matches.universe = matches.animal }
  if (values.universe && values.universe !== 'Животные') { delete values.animal; delete matches.animal }
  return { values: values as ParsedDescription['values'], matches }
}

const isOption = <K extends AvatarQuestionKey>(key: K, value: unknown): value is OptionOf<K> =>
  typeof value === 'string' && (AVATAR_OPTIONS[key] as readonly string[]).includes(value)

export function isAvatarParams(value: unknown): value is AvatarParams {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (Object.keys(AVATAR_OPTIONS) as AvatarQuestionKey[]).every((key) => isOption(key, record[key]))
    && (record.animal === null || (typeof record.animal === 'string' && (ANIMALS as readonly string[]).includes(record.animal)))
    && typeof record.skin === 'string' && (SKIN_TONES as readonly string[]).includes(record.skin)
}
