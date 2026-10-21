import { describe, expect, it } from 'vitest'
import { changeSentence, changeWords, percentWord } from './change-text'

describe('понятные формулировки изменений', () => {
  it('склоняет «процент» и не использует «п.п.»', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25].map(percentWord)).toEqual(['процент', 'процента', 'процентов', 'процентов', 'процентов', 'процент', 'процента', 'процентов'])
    expect(changeWords(8)).toBe('выросло на 8 процентов')
    expect(changeWords(-4)).toBe('снизилось на 4 процента')
    expect(changeWords(1)).toBe('выросло на 1 процент')
    expect(changeWords(0)).toBe('без изменений')
  })
  it('показывает, что было и что стало', () => {
    expect(changeSentence(50, 58)).toBe('Выросло на 8 процентов (было 50% → стало 58%)')
    expect(changeSentence(63, 58)).toBe('Снизилось на 5 процентов (было 63% → стало 58%)')
    expect(changeSentence(70, 70)).toBe('Без изменений (70%)')
    expect(changeSentence(50, 58, true)).toBe('выросло на 8 процентов (было 50% → стало 58%)')
  })
})
