import type { TraitId, TraitLevel } from '../domain/types'
import { msg } from '../i18n/translate'

/** Русские названия служат ключами перевода: на экране их показывают через t() или useTraitLabels(). */
export const traitNames: Readonly<Record<TraitId, string>> = {
  criticalThinking: msg('Критическое мышление'), confidence: msg('Уверенность в себе'),
  discipline: msg('Дисциплина'), engagement: msg('Вовлечённость'),
}

/** Короткие подписи для осей радара и узких таблиц. */
export const traitShortNames: Readonly<Record<TraitId, string>> = {
  criticalThinking: msg('Мышление'), confidence: msg('Уверенность'), discipline: msg('Дисциплина'), engagement: msg('Вовлечённость'),
}

export const levelNames: Readonly<Record<TraitLevel, string>> = {
  priority: msg('Приоритет развития'), developing: msg('Можно укрепить'), strength: msg('Сильная сторона'),
}

/** Цвета качеств для тёмного листа профиля: у каждого свой, чтобы радар и строки шкал читались вместе. */
export const traitColors: Readonly<Record<TraitId, string>> = {
  criticalThinking: '#5db5ff', confidence: '#ffd166', discipline: '#5be0a8', engagement: '#ff8fa3',
}
