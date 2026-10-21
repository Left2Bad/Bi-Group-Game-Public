import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from '../content/archetypes'
import { questions, scoring } from '../content/questions'
import { manualSets } from '../../tests/fixtures/answer-sets'
import { getArchetype } from './archetype'
import { calculateProfile } from './score'
import {
  buildShareCard, codeFromPercents, decodeShareHash, encodeShareHash, isPlausible, sanitizeName, SHARE_NAME_MAX, shareUrl,
} from './share'
import { DATA_VERSIONS } from './types'
import type { Answers } from './types'

const context = { questions, scoring, versions: DATA_VERSIONS, completedAt: '2026-10-17T08:00:00.000Z' }

function resultOf(answers: Answers, attemptId = 'share') {
  const output = calculateProfile(answers, { ...context, attemptId })
  if (!output.ok) throw new Error(output.error.message)
  return output.result
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('карточка профиля', () => {
  it('код архетипа, выведенный из процентов, совпадает с расчётным на любых ответах', () => {
    const random = mulberry32(7)
    const seen = new Set<string>()
    for (let run = 0; run < 3000; run++) {
      const answers = Object.fromEntries(questions.map((question) => [question.id, question.options[Math.floor(random() * 4)]!.id]))
      const result = resultOf(answers, `r${run}`)
      const card = buildShareCard(result)
      expect(card.code).toBe(getArchetype(result).code)
      expect(codeFromPercents(card.percents)).toBe(card.code)
      seen.add(card.code)
    }
    expect(seen.size).toBeGreaterThanOrEqual(8)
    for (const code of seen) expect(ARCHETYPES[code]).toBeDefined()
  })

  it('ссылка не содержит ответов, дат и идентификаторов — только четыре процента и имя', () => {
    const result = resultOf(manualSets.demoA.answers, 'secret-attempt-id')
    const hash = encodeShareHash(buildShareCard(result, 'Асель'))
    expect(hash).toBe('#v=1&p=75-57-76-46&n=%D0%90%D1%81%D0%B5%D0%BB%D1%8C')
    for (const forbidden of ['secret-attempt-id', 'Q01', '2026', 'answers']) expect(hash).not.toContain(forbidden)
    expect(encodeShareHash(buildShareCard(result))).toBe('#v=1&p=75-57-76-46')
  })

  it('туда и обратно: разбор ссылки возвращает ту же карточку', () => {
    for (const key of ['minimum', 'balanced', 'primary', 'demoA', 'demoB'] as const) {
      const card = buildShareCard(resultOf(manualSets[key].answers), 'Нурлан О.')
      expect(decodeShareHash(encodeShareHash(card), questions)).toEqual(card)
    }
    expect(shareUrl('https://example.org/', buildShareCard(resultOf(manualSets.balanced.answers)))).toBe('https://example.org/card#v=1&p=67-67-67-67')
  })

  it('отклоняет чужой формат, невозможные числа и подделки', () => {
    const bad = [
      '', '#', '#v=2&p=75-57-76-46', '#v=1', '#v=1&p=75-57-76', '#v=1&p=75-57-76-46-10', '#v=1&p=a-b-c-d',
      '#v=1&p=100-100-100-100', // сумма баллов больше возможной
      '#v=1&p=101-0-0-0', '#v=1&p=-5-0-0-0', '#v=1&p=75.5-57-76-46', '#v=1&p=3-3-3-3', // 3% не получается из целого числа баллов
      '#v=1&p=' + '9'.repeat(500),
    ]
    for (const hash of bad) expect(decodeShareHash(hash, questions)).toBeNull()
    expect(isPlausible({ criticalThinking: 75, confidence: 57, discipline: 76, engagement: 46 }, questions)).toBe(true)
  })

  it('очищает имя: пробелы, управляющие символы и длина', () => {
    expect(sanitizeName('  Асель \n\t Т.  ')).toBe('Асель Т.')
    expect(sanitizeName('A\u0000B\u202EC')).toBe('A B C')
    expect(sanitizeName('я'.repeat(100))).toHaveLength(SHARE_NAME_MAX)
    expect([...sanitizeName('😀'.repeat(100))]).toHaveLength(SHARE_NAME_MAX)
    const decoded = decodeShareHash('#v=1&p=75-57-76-46&n=' + encodeURIComponent('<img src=x onerror=alert(1)>'), questions)
    // Строка остаётся обычным текстом: React экранирует её, а длина ограничена.
    expect(decoded?.name).toBe('<img src=x onerror=alert(1)>')
  })
})
