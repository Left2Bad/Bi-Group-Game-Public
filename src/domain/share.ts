import { ARCHETYPES, POLES } from '../content/archetypes'
import { getArchetype } from './archetype'
import { TRAIT_IDS } from './types'
import type { AssessmentResult, Question, TraitId } from './types'

/**
 * Карточка профиля, которой можно поделиться (пункт 15).
 *
 * В ссылку попадают только четыре процента и необязательное имя, которое человек вводит сам.
 * Ответы, даты, идентификатор попытки и рекомендации в карточку не входят. Ссылка хранит данные
 * во фрагменте адреса (после «#»): браузер не отправляет его на сервер, поэтому сервер
 * ничего не узнаёт и не хранит. Карточка самооценочная и не подписана: любой может собрать ссылку
 * с произвольными числами, поэтому разбор отсекает только невозможные значения (см. isPlausible).
 */
export const SHARE_VERSION = '1'
export const SHARE_NAME_MAX = 40
export const SHARE_PATH = '/card'

export interface ShareCard {
  readonly name: string
  readonly percents: Readonly<Record<TraitId, number>>
  /** Код архетипа из четырёх букв; выводится из процентов, а не берётся из ссылки. */
  readonly code: string
}

/** Доля 2/3 и выше — высокий полюс. В методике v2 целые баллы дают 67% и выше ровно в этом случае. */
const HIGH_PERCENT = 67

export function codeFromPercents(percents: Readonly<Record<TraitId, number>>): string {
  return TRAIT_IDS.map((trait) => POLES[trait][percents[trait] >= HIGH_PERCENT ? 'high' : 'low'].letter).join('')
}

/** Убирает управляющие символы, схлопывает пробелы и обрезает по числу символов, а не байтов. */
export function sanitizeName(raw: string): string {
  const cleaned = raw.normalize('NFC').replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim()
  return [...cleaned].slice(0, SHARE_NAME_MAX).join('').trim()
}

export function buildShareCard(result: AssessmentResult, name = ''): ShareCard {
  const percents = Object.fromEntries(TRAIT_IDS.map((trait) => [trait, result.traits[trait].percent])) as Record<TraitId, number>
  return { name: sanitizeName(name), percents, code: getArchetype(result).code }
}

export function encodeShareHash(card: ShareCard): string {
  const percents = TRAIT_IDS.map((trait) => card.percents[trait]).join('-')
  return `#v=${SHARE_VERSION}&p=${percents}${card.name ? `&n=${encodeURIComponent(card.name)}` : ''}`
}

/** Наибольший балл по качеству: три балла за каждую ситуацию, где оно основное или дополнительное. */
function maxPointsOf(trait: TraitId, questions: readonly Question[]): number {
  return 3 * questions.filter((question) => question.trait === trait || question.secondaryTrait === trait).length
}

/**
 * Процент возможен, только если его даёт целое число баллов, а сумма баллов не превышает 4 на ситуацию
 * (варианты дают 3+1, 1+3, 2+2 или 0). Подделку это не исключает, но отсекает 100/100/100/100 и случайные числа.
 */
export function isPlausible(percents: Readonly<Record<TraitId, number>>, questions: readonly Question[]): boolean {
  let minimalPoints = 0
  for (const trait of TRAIT_IDS) {
    const max = maxPointsOf(trait, questions)
    const percent = percents[trait]
    if (max === 0 || !Number.isInteger(percent) || percent < 0 || percent > 100) return false
    let found = -1
    for (let points = 0; points <= max; points++) {
      if (Math.round(100 * points / max) === percent) { found = points; break }
    }
    if (found < 0) return false
    minimalPoints += found
  }
  return minimalPoints <= 4 * questions.length
}

/** Разбирает фрагмент адреса. Любое отклонение от формата — null, без исключений. */
export function decodeShareHash(hash: string, questions: readonly Question[]): ShareCard | null {
  try {
    if (hash.length > 400) return null
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    if (params.get('v') !== SHARE_VERSION) return null
    const raw = params.get('p')
    if (raw === null || !/^\d{1,3}(-\d{1,3}){3}$/.test(raw)) return null
    const values = raw.split('-').map(Number)
    const percents = Object.fromEntries(TRAIT_IDS.map((trait, index) => [trait, values[index]!])) as Record<TraitId, number>
    if (!isPlausible(percents, questions)) return null
    const code = codeFromPercents(percents)
    if (!ARCHETYPES[code]) return null
    const name = sanitizeName(params.get('n') ?? '')
    return { name, percents, code }
  } catch {
    return null
  }
}

export function shareUrl(origin: string, card: ShareCard): string {
  return `${origin.replace(/\/$/, '')}${SHARE_PATH}${encodeShareHash(card)}`
}
