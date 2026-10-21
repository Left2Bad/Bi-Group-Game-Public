import { describe, expect, it } from 'vitest'
import { AVATAR_EXAMPLES, AVATAR_LEXICON } from '../content/avatar'
import { avatarName, avatarPortrait, DEFAULT_AVATAR, isAvatarParams, parseDescription } from './avatar'

describe('аватар сотрудника', () => {
  it('собирает имя из вселенной и роли', () => {
    expect(avatarName(DEFAULT_AVATAR)).toBe('Лис-стратег')
    expect(avatarName({ ...DEFAULT_AVATAR, animal: 'Сова' })).toBe('Сова-стратег')
    expect(avatarName({ ...DEFAULT_AVATAR, universe: 'Фэнтези', role: 'Мастер' })).toBe('Гном-мастер')
  })

  it('разбирает описание в фиксированные параметры и запоминает слово-источник', () => {
    const parsed = parseDescription(AVATAR_EXAMPLES[0]!.text)
    expect(parsed.values).toMatchObject({ universe: 'Животные', animal: 'Лис', palette: 'Строгий', role: 'Стратег', action: 'Анализирую', motivation: 'Результат' })
    expect(parsed.matches.animal).toBe('лис')
  })

  it('не выбирает животное вне вселенной «Животные»', () => {
    expect(parseDescription('Супергерой из кино, как лис').values.animal).toBeUndefined()
  })

  it('незнакомые слова ничего не рисуют: значения только из списков', () => {
    expect(parseDescription('совершенно произвольный текст 123').values).toEqual({})
    const all = Object.values(AVATAR_LEXICON).flat().map(([value]) => value)
    for (const example of AVATAR_EXAMPLES) for (const value of Object.values(parseDescription(example.text).values)) expect(all).toContain(value)
  })

  it('портрет не выходит за 100 и проверка формы отсекает чужие данные', () => {
    for (const line of avatarPortrait({ ...DEFAULT_AVATAR, role: 'Лидер', action: 'Сразу в бой', power: 'Скорость' })) expect(line.value).toBeLessThanOrEqual(100)
    expect(isAvatarParams(DEFAULT_AVATAR)).toBe(true)
    expect(isAvatarParams({ ...DEFAULT_AVATAR, universe: 'Иное' })).toBe(false)
    expect(isAvatarParams({ ...DEFAULT_AVATAR, skin: 'red' })).toBe(false)
  })
})
