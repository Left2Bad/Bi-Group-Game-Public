import { msg } from '../i18n/translate.ts'

export type UserRole = 'employee' | 'manager'
export interface Registration {
  readonly name: string; readonly email: string; readonly password: string; readonly role: UserRole; readonly inviteCode: string
  /** Согласие на передачу результатов руководителю. Обязательно, только если указан код команды. */
  readonly consent: boolean
}
export interface Credentials { readonly email: string; readonly password: string }
export type AccountField = 'name' | 'email' | 'password' | 'role' | 'inviteCode' | 'consent'
export type FieldErrors = Partial<Record<AccountField, string>>
export type Validated<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: FieldErrors }

export const ACCOUNT_LIMITS = { nameMin: 2, nameMax: 80, emailMax: 254, passwordMin: 10, passwordMax: 128, inviteLength: 16 } as const
const messages = {
  name: msg('Укажите имя от 2 до 80 символов, содержащее буквы.'),
  email: msg('Укажите корректный email.'),
  password: msg('Пароль должен содержать от 10 до 128 символов и не состоять только из пробелов.'),
  loginPassword: msg('Введите пароль (не более 128 символов).'),
  role: msg('Выберите роль.'),
  inviteCode: msg('Код команды должен содержать 16 символов: цифры и буквы A–F.'),
  managerInvite: msg('Код команды используется только при регистрации сотрудника.'),
  teamName: msg('Название команды: от 2 до 80 символов без управляющих знаков.'),
  consent: msg('Чтобы вступить в команду, подтвердите согласие на передачу результатов руководителю.'),
} as const

/**
 * Версия текста согласия. Сохраняется вместе с датой согласия: при изменении текста
 * можно запросить согласие заново и доказать, на что именно согласился сотрудник.
 */
export const CONSENT_VERSION = 1

/** Согласие принимается только как явное true из отмеченного флажка, а не как непустая строка. */
export function validateConsent(value: unknown): Validated<true> {
  return value === true ? { ok: true, value: true } : { ok: false, errors: { consent: messages.consent } }
}

const stringOf = (value: unknown) => typeof value === 'string' ? value : ''
const cleanText = (value: unknown) => stringOf(value).trim()
// Не запрещаем национальные имена, апострофы, дефисы или значимые пробелы в пароле.
// Управляющие знаки не должны попадать в подписи людей и команд.
const hasControls = (value: string) => /\p{Cc}/u.test(value)

export function isAccountEmail(email: string): boolean {
  if (email.length > ACCOUNT_LIMITS.emailMax) return false
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local = '', domain = ''] = parts
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local)) return false
  const labels = domain.split('.')
  return labels.length >= 2 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    && /[a-z]/i.test(labels[labels.length - 1]!)
}

export function validateInviteCode(value: unknown, required = true): Validated<string> {
  const code = cleanText(value).toUpperCase()
  if ((!required && (value === undefined || typeof value === 'string') && !code)
    || typeof value === 'string' && /^[A-F0-9]{16}$/.test(code)) return { ok: true, value: code }
  return { ok: false, errors: { inviteCode: messages.inviteCode } }
}

export function validateRegistration(body: Readonly<Record<string, unknown>>): Validated<Registration> {
  const name = cleanText(body.name)
  const email = cleanText(body.email).toLowerCase()
  const password = stringOf(body.password)
  const invite = validateInviteCode(body.inviteCode, false)
  const errors: FieldErrors = {}
  if (name.length < ACCOUNT_LIMITS.nameMin || name.length > ACCOUNT_LIMITS.nameMax || !/\p{L}/u.test(name) || hasControls(name)) errors.name = messages.name
  if (!isAccountEmail(email)) errors.email = messages.email
  if (password.length < ACCOUNT_LIMITS.passwordMin || password.length > ACCOUNT_LIMITS.passwordMax || !password.trim()) errors.password = messages.password
  if (body.role !== 'employee' && body.role !== 'manager') errors.role = messages.role
  if (!invite.ok) errors.inviteCode = invite.errors.inviteCode!
  else if (body.role === 'manager' && invite.value) errors.inviteCode = messages.managerInvite
  const consent = body.consent === true
  if (invite.ok && invite.value && body.role === 'employee' && !consent) errors.consent = messages.consent
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { name, email, password, role: body.role as UserRole, inviteCode: invite.ok ? invite.value : '', consent } }
}

export function validateLogin(body: Readonly<Record<string, unknown>>): Validated<Credentials> {
  const email = cleanText(body.email).toLowerCase()
  const password = stringOf(body.password)
  const errors: FieldErrors = {}
  if (!isAccountEmail(email)) errors.email = messages.email
  // Старые пароли проверяются без новых требований регистрации и без trim.
  if (!password || password.length > ACCOUNT_LIMITS.passwordMax) errors.password = messages.loginPassword
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { email, password } }
}

export function validateTeamName(value: unknown): Validated<string> {
  const name = cleanText(value)
  return name.length >= ACCOUNT_LIMITS.nameMin && name.length <= ACCOUNT_LIMITS.nameMax && !hasControls(name)
    ? { ok: true, value: name } : { ok: false, errors: { name: messages.teamName } }
}
