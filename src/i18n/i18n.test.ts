// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { questions, scoring } from '../content/questions'
import { calculateProfile } from '../domain/score'
import { DICTIONARIES, translatorFor } from './dictionaries'
import { en } from './en'
import { enContent } from './en-content'
import { kk } from './kk'
import { KK_PENDING } from './kk-pending'
import { AI_FAILURE_MESSAGES } from './server-messages'
import { createTranslator, dateLocale, DEFAULT_LANG, detectLang, interpolate, LANG_NAMES, LANGS, placeholdersOf } from './translate'
import type { Dictionary, Lang } from './translate'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DICTIONARY_FILES = ['kk.ts', 'en.ts', 'en-content.ts', 'kk-pending.ts']

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'bank' || name === 'node_modules' ? [] : sources(path)
    return /\.(tsx?|mjs)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)
      && !(path.includes(`${sep}i18n${sep}`) && DICTIONARY_FILES.includes(name)) ? [path] : []
  })
}

/**
 * Русские строки, переданные в t( , msg( или translateNow( одним литералом, с файлами, где они встречаются.
 * Сам тест (ситуации, варианты, открытые вопросы, обоснования) в t()/msg() не передаётся и сюда не попадает.
 */
function usedKeys(): Map<string, string[]> {
  const keys = new Map<string, string[]>()
  for (const file of [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'server'))]) {
    const name = relative(ROOT, file).split(sep).join('/')
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const add = (text: string) => { const files = keys.get(text) ?? []; if (!files.includes(name)) files.push(name); keys.set(text, files) }
    function collect(node: ts.Node) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[А-Яа-яЁё]/.test(node.text)) add(node.text)
      else if (ts.isConditionalExpression(node)) { collect(node.whenTrue); collect(node.whenFalse) }
      else if (ts.isParenthesizedExpression(node)) collect(node.expression)
    }
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'msg', 'translateNow'].includes(node.expression.text) && node.arguments[0]) collect(node.arguments[0])
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return keys
}

/** Содержимое из данных (архетипы, рекомендации, уроки, каталог навыков и обучения): переведено на английский и казахский. */
const isContentFile = (file: string) => file.startsWith('src/content/') || /^src\/dynamic\/(learning|skills)\.ts$/.test(file)

const used = usedKeys()
const contentKeys = new Set([...used].filter(([, files]) => files.every(isContentFile)).map(([key]) => key))
const sorted = (keys: Iterable<string>) => [...keys].sort()

describe('находка строк', () => {
  it('находит строки интерфейса и содержимого', () => {
    expect(used.size).toBeGreaterThan(1500)
    expect(contentKeys.size).toBeGreaterThan(300)
  })
})

describe.each([['kk', kk], ['en', en]] as const)('словарь «%s»', (_lang, dictionary: Dictionary) => {
  it('не хранит устаревших ключей', () => {
    expect(Object.keys(dictionary).filter((key) => !used.has(key))).toEqual([])
  })

  it('сохраняет все подстановки и ведущие пробелы, значения не пусты', () => {
    for (const [key, value] of Object.entries(dictionary)) {
      expect(placeholdersOf(value), key).toEqual(placeholdersOf(key))
      expect(value.startsWith(' '), key).toBe(key.startsWith(' '))
      expect(value.trim().length, key).toBeGreaterThan(0)
    }
  })
})

describe('английский словарь', () => {
  it('содержит перевод для каждой строки интерфейса и содержимого', () => {
    expect([...used.keys()].filter((key) => !(key in en))).toEqual([])
  })

  it('сохраняет замыкающие пробелы и не оставляет кириллицы в переводе', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.endsWith(' '), key).toBe(key.endsWith(' '))
      expect(/[А-Яа-яЁё]/.test(value), key).toBe(false)
    }
  })

  it('делит перевод на интерфейс и содержимое без пересечений', () => {
    expect(sorted(Object.keys(enContent))).toEqual(sorted(contentKeys))
  })
})

describe('казахский словарь', () => {
  it('содержит перевод для каждой строки интерфейса, кроме явно перечисленных ожидающих перевода', () => {
    const required = [...used.keys()].filter((key) => !contentKeys.has(key))
    expect(sorted(required.filter((key) => !(key in kk)))).toEqual(sorted(KK_PENDING))
  })

  it('не прячет за списком ожидающих уже переведённые, лишние и повторяющиеся строки', () => {
    expect(KK_PENDING.filter((key) => key in kk)).toEqual([])
    expect(KK_PENDING.filter((key) => !used.has(key) || contentKeys.has(key))).toEqual([])
    expect(new Set(KK_PENDING).size).toBe(KK_PENDING.length)
  })

  it('переводит и содержимое: у каждой строки данных есть казахский вариант', () => {
    expect(sorted([...contentKeys].filter((key) => !(key in kk)))).toEqual([])
  })
})

describe('переводчик', () => {
  it('подставляет значения и возвращается к русскому тексту', () => {
    const t = createTranslator('kk', kk)
    expect(t('Ответов: {count} из {total}', { count: 3, total: 15 })).toBe('Жауап: 15 ішінен 3')
    expect(createTranslator('ru', kk)('Назад')).toBe('Назад')
    expect(t('Нет такой строки {x}', { x: 1 })).toBe('Нет такой строки 1')
    expect(interpolate('{a}-{a}', { a: 'x' })).toBe('x-x')
  })

  it('переводит на английский с подстановками и откатывается к русскому для чужих строк', () => {
    const t = translatorFor('en')
    expect(t('Ответов: {count} из {total}', { count: 3, total: 15 })).toBe('Answers: 3 of 15')
    expect(t('Ситуация {n} из {total}', { n: 2, total: 15 })).toBe('Situation 2 of 15')
    expect(t('Строки, которой нет в словаре')).toBe('Строки, которой нет в словаре')
    expect(translatorFor('ru')('Назад')).toBe('Назад')
  })

  it('словарь есть у каждого языка, кроме русского', () => {
    for (const lang of LANGS) {
      if (lang === DEFAULT_LANG) continue
      expect(Object.keys(DICTIONARIES[lang as Exclude<Lang, 'ru'>]).length, lang).toBeGreaterThan(600)
    }
  })

  it('склонения процентов и дней сводятся к одной английской форме', () => {
    const t = translatorFor('en')
    expect(['процент', 'процента', 'процентов'].map((word) => t(word))).toEqual(['percent', 'percent', 'percent'])
    expect(['день', 'дня', 'дней'].map((word) => t(word))).toEqual(['day', 'days', 'days'])
  })
})

describe('язык по умолчанию и названия', () => {
  it('подписи языков написаны на самих языках', () => {
    expect(LANGS).toEqual(['ru', 'kk', 'en'])
    expect(LANGS.map((lang) => LANG_NAMES[lang].short)).toEqual(['RU', 'ҚАЗ', 'EN'])
    expect(LANGS.map((lang) => LANG_NAMES[lang].full)).toEqual(['Русский', 'Қазақша', 'English'])
  })

  it('локали дат: английский — британский, день перед месяцем и 24-часовой формат', () => {
    expect(LANGS.map(dateLocale)).toEqual(['ru-RU', 'kk-KZ', 'en-GB'])
  })
})

describe('определение языка', () => {
  it('сохранённый выбор важнее языка браузера', () => {
    expect(detectLang('ru', ['en-US'])).toBe('ru')
    expect(detectLang('kk', ['en-US'])).toBe('kk')
    expect(detectLang('en', ['kk-KZ'])).toBe('en')
    expect(detectLang('en', [])).toBe('en')
  })

  it('английский и казахский браузера дают en и kk', () => {
    expect(detectLang(null, ['en-US'])).toBe('en')
    expect(detectLang(null, ['en'])).toBe('en')
    expect(detectLang(null, ['EN-gb'])).toBe('en')
    expect(detectLang(null, ['kk-KZ'])).toBe('kk')
    expect(detectLang(null, ['kk'])).toBe('kk')
  })

  it('остальные языки и пустой список дают русский', () => {
    expect(detectLang(null, ['ru-RU'])).toBe('ru')
    expect(detectLang(null, ['de-DE', 'fr'])).toBe('ru')
    expect(detectLang(null, [])).toBe('ru')
    expect(detectLang('fr', ['de'])).toBe('ru')
    expect(detectLang('', ['tr'])).toBe('ru')
  })

  it('берёт первый поддерживаемый язык в порядке предпочтения: английский вторым не переключает русский', () => {
    expect(detectLang(null, ['ru-RU', 'en-US', 'en'])).toBe('ru')
    expect(detectLang(null, ['de-DE', 'en-GB'])).toBe('en')
    expect(detectLang(null, ['kk', 'ru'])).toBe('kk')
    expect(detectLang(null, ['en-US', 'kk'])).toBe('en')
  })

  it('неизвестное сохранённое значение игнорируется в пользу языка браузера', () => {
    expect(detectLang('de', ['en-US'])).toBe('en')
    expect(detectLang('EN', ['ru'])).toBe('ru')
  })
})

describe('сам тест не зависит от языка', () => {
  const signature = () => JSON.stringify(questions.map((question) => ({
    id: question.id, trait: question.trait, secondary: question.secondaryTrait,
    options: question.options.map((option) => option.id),
  })))

  it('15 ситуаций, идентификаторы Q01–Q15 и порядок вариантов остаются прежними', () => {
    expect(questions).toHaveLength(15)
    expect(questions.map((question) => question.id)).toEqual(Array.from({ length: 15 }, (_, index) => `Q${String(index + 1).padStart(2, '0')}`))
    for (const question of questions) expect(question.options.map((option) => option.id)).toEqual([`${question.id}-A`, `${question.id}-B`, `${question.id}-C`, `${question.id}-D`])
  })

  it('баллы и профиль не зависят от языка интерфейса', () => {
    const answers = Object.fromEntries(questions.map((question) => [question.id, question.options[2]!.id]))
    const before = signature()
    const results = LANGS.map(() => calculateProfile(answers, { attemptId: 'attempt-1', questions, scoring, versions: { schema: 1, assessment: 'a', scoring: 's', recommendations: 'r' }, completedAt: '2026-10-16T09:00:00.000Z' }))
    for (const result of results) expect(result).toEqual(results[0])
    expect(signature()).toBe(before)
  })

  it('тексты ситуаций, вариантов и обоснований не попадают ни в один словарь', () => {
    const texts = questions.flatMap((question) => [question.context, question.text,
      ...question.options.map((option) => option.text),
      ...(scoring.filter((rule) => rule.questionId === question.id).map((rule) => rule.reason))])
    for (const dictionary of [kk, en]) expect(texts.filter((text) => typeof text === 'string' && text in dictionary)).toEqual([])
    expect(texts.filter((text) => typeof text === 'string' && used.has(text))).toEqual([])
  })

  it('файлы теста не вызывают t() и msg()', () => {
    const files = ['src/content/questions.ts', 'server/question-bank.ts', 'server/dynamic-ai.ts']
    for (const file of files) expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toMatch(/\b(?:t|msg|translateNow)\(\s*['"`]/)
  })
})

describe('описание страницы', () => {
  it('совпадает с описанием в index.html, которое подменяется по языку', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    const description = [...used.keys()].find((key) => key.startsWith('BI Academy — 15 рабочих ситуаций со стройплощадки'))!
    expect(html).toContain(`content="${description}"`)
    expect(en[description]).toMatch(/^BI Academy — 15 work situations/)
  })
})

describe('сообщения сервера об ошибках ИИ', () => {
  it('клиентские строки дословно совпадают с server/dynamic-ai.ts', () => {
    const server = readFileSync(join(ROOT, 'server/dynamic-ai.ts'), 'utf8')
    expect(AI_FAILURE_MESSAGES.filter((message) => !server.includes(message))).toEqual([])
    expect(AI_FAILURE_MESSAGES.filter((message) => !(message in en))).toEqual([])
  })
})
