import { msg, russian } from '../i18n/translate'
import type { Translate } from '../i18n/translate'

const plural = (count: number, forms: readonly [string, string, string]) => {
  const rest = count % 100
  const last = count % 10
  return rest >= 11 && rest <= 14 ? forms[2] : last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2]
}

/** Падеж слова «процент» зависит от числа; английский словарь отвечает на все три формы одним словом. */
export const percentWord = (count: number) => plural(Math.abs(count), [msg('процент'), msg('процента'), msg('процентов')])

/** «Выросло на 8 процентов» вместо «+8 п.п.»: понятно без знания терминов. */
export function changeWords(delta: number, t: Translate = russian): string {
  if (delta === 0) return t('без изменений')
  const size = Math.abs(delta)
  const unit = t(percentWord(size))
  return delta > 0 ? t('выросло на {size} {unit}', { size, unit }) : t('снизилось на {size} {unit}', { size, unit })
}

const upperFirst = (text: string) => text.replace(/^./, (letter) => letter.toUpperCase())

/** «Выросло на 8 процентов (было 50% → стало 58%)». С `inline` — со строчной буквы, для продолжения фразы. */
export function changeSentence(before: number, now: number, inline = false, t: Translate = russian): string {
  const text = now === before ? t('без изменений ({now}%)', { now })
    : t('{words} (было {before}% → стало {now}%)', { words: changeWords(now - before, t), before, now })
  return inline ? text : upperFirst(text)
}
