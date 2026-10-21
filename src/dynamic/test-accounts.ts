import { DEMO_CHOICES, DEMO_MEETINGS, DEMO_PERSONAS } from '../content/dynamic-demo'
import type { AvatarParams } from '../domain/avatar'
import { demoAttempt } from './demo'
import type { DynamicAttempt } from './domain'

/**
 * Тестовые аккаунты для проверки на сервере: вымышленная команда примера (src/content/dynamic-demo.ts),
 * перенесённая в настоящую базу. Попытки считаются тем же demoAttempt, что и пример, модель не вызывается.
 * Сервер не умеет собирать TypeScript примера, поэтому результат хранится в server/test-accounts.json
 * (npm run test-accounts:build), а server/seed-test-accounts.mjs только записывает его в базу.
 */

export const TEST_PASSWORD = 'test123456'
const DOMAIN = 'bi.test'
/** Код проходит validateInviteCode, поэтому по нему можно вступить в тестовую команду. */
const INVITE_CODE = 'FADC01388F211FB1'
const FULL_NAMES: Readonly<Record<string, string>> = {
  alexey: 'Алексей Волков', dinara: 'Динара Касымова', sergey: 'Сергей Морозов',
  asel: 'Асель Тулегенова', nurlan: 'Нурлан Омаров', madina: 'Мадина Жумабаева',
}
/** У кого в примере нет своего аватара, получают нейтральный, чтобы в команде не было пустых карточек. */
const FALLBACK_AVATAR: AvatarParams = { universe: 'Кино', gender: 'Женский', palette: 'Спокойный', role: 'Наставник', action: 'Советуюсь',
  motivation: 'Команда', power: 'Надёжность', animal: null, skin: '#edbe94' }

/** Попытка без id: сервер выдаёт новый UUID при каждом заполнении. */
export type TestAttempt = Omit<DynamicAttempt, 'id'>
export interface TestEmployee {
  readonly name: string; readonly email: string
  readonly avatar: AvatarParams | null
  /** Вступил в команду руководителя с согласием на передачу результатов. */
  readonly inTeam: boolean
  readonly attempts: readonly TestAttempt[]
  /** Дни отсчитываются от завершения последней попытки, как в примере. */
  readonly marks: readonly { readonly week: number; readonly day: number }[]
  readonly comments: readonly { readonly week: number; readonly day: number; readonly text: string }[]
  readonly note: string
}
export interface TestAccounts {
  readonly password: string
  readonly team: { readonly name: string; readonly inviteCode: string }
  readonly manager: { readonly name: string; readonly email: string; readonly note: string }
  readonly employees: readonly TestEmployee[]
  /** Время беседы считается от момента заполнения: назначенная всегда впереди. */
  readonly meetings: readonly { readonly email: string; readonly inDays: number; readonly hour: number; readonly status: 'pending' | 'accepted'; readonly message: string }[]
}

const withoutId = ({ id: _id, ...attempt }: DynamicAttempt): TestAttempt => attempt

/**
 * Прежние попытки в примере хранятся без ответов, как их видит руководитель. В базе сотрудник видит
 * свою попытку целиком, поэтому выбранные варианты в ситуациях возвращаются; открытых ответов у них нет.
 */
function fullAttempt(persona: typeof DEMO_PERSONAS[number], index: number): TestAttempt {
  const attempt = withoutId(demoAttempt(persona, index))
  if (attempt.choices.length > 0) return attempt
  const letters = persona.attempts[index]!.choices
  return { ...attempt, choices: DEMO_CHOICES, choiceAnswers: Object.fromEntries(DEMO_CHOICES.map((question, position) => [question.id, letters[position]!])) }
}

export function buildTestAccounts(teamName = 'Участок № 3, ЖК «Северный»'): TestAccounts {
  const team = DEMO_PERSONAS.filter((persona) => persona.consented)
  const employees: TestEmployee[] = team.map((persona) => ({
    name: FULL_NAMES[persona.id] ?? persona.name, email: `${persona.id}@${DOMAIN}`,
    avatar: persona.avatar ?? FALLBACK_AVATAR, inTeam: true,
    attempts: persona.attempts.map((_, index) => fullAttempt(persona, index)),
    marks: persona.marks ?? [], comments: persona.comments ?? [],
    note: `${persona.jobRole}, в команде руководителя` + (persona.attempts.length ? `, попыток: ${persona.attempts.length}` : ', тест не пройден'),
  }))
  employees.push({ name: 'Новый Сотрудник', email: `novichok@${DOMAIN}`, avatar: null, inTeam: false, attempts: [], marks: [], comments: [],
    note: 'без команды, аватара и теста — путь с нуля' })
  return {
    password: TEST_PASSWORD, team: { name: teamName, inviteCode: INVITE_CODE },
    manager: { name: 'Ерлан Бекболатов', email: `rukovoditel@${DOMAIN}`, note: 'кабинет «Мои команды», команда с результатами' },
    employees,
    meetings: DEMO_MEETINGS.map(({ employeeId, ...meeting }) => ({ email: `${employeeId}@${DOMAIN}`, ...meeting })),
  }
}
