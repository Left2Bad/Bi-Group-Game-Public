import { describe, expect, it } from 'vitest'
import { validateConsent, validateInviteCode, validateLogin, validateRegistration, validateTeamName } from './account-validation'

const valid = { name: 'Иван Сотрудник', email: 'employee@example.test', password: 'test-password-2026', role: 'employee', inviteCode: '' }

describe('общие правила аккаунтов (браузер и сервер)', () => {
  it.each(['', ' ', '1234', 'И', 'x'.repeat(81), 'Иван\u0000Сотрудник'])('отклоняет имя %j', (name) => {
    const result = validateRegistration({ ...valid, name })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.name).toBeTruthy()
  })
  it.each(['', 'bad', 'a@b', '.a@example.test', 'a.@example.test', 'a..b@example.test', 'a@-example.test', 'a@example..test', 'a@example.test.', `${'x'.repeat(65)}@example.test`, `a@${'x'.repeat(64)}.test`])('отклоняет email %j', (email) => {
    expect(validateRegistration({ ...valid, email }).ok).toBe(false)
    expect(validateLogin({ email, password: valid.password }).ok).toBe(false)
  })
  it.each(['short', ' '.repeat(10), '\t'.repeat(10), 'x'.repeat(129), null, 1234567890])('отклоняет новый пароль %j', (password) => {
    expect(validateRegistration({ ...valid, password }).ok).toBe(false)
  })
  it('нормализует имя, email и приглашение, сохраняя значимые пробелы пароля', () => {
    const result = validateRegistration({ ...valid, name: '  Әлия О’Нил  ', email: ' User+HR@Example.TEST ', password: '  secret password  ', inviteCode: ' ab12cd34ef56ab78 ', consent: true })
    expect(result).toEqual({ ok: true, value: { name: 'Әлия О’Нил', email: 'user+hr@example.test', password: '  secret password  ', role: 'employee', inviteCode: 'AB12CD34EF56AB78', consent: true } })
    expect(validateLogin({ email: ' User+HR@Example.TEST ', password: '  secret password  ' })).toEqual({ ok: true, value: { email: 'user+hr@example.test', password: '  secret password  ' } })
  })
  it('разделяет обязательность кода и не игнорирует неверный тип', () => {
    expect(validateInviteCode('').ok).toBe(false)
    expect(validateInviteCode('', false)).toEqual({ ok: true, value: '' })
    expect(validateInviteCode(undefined, false).ok).toBe(true)
    for (const inviteCode of [null, 123, {}, [], 'UNKNOWN', 'A'.repeat(17), 'GGGGGGGGGGGGGGGG']) {
      expect(validateRegistration({ ...valid, inviteCode }).ok).toBe(false)
      expect(validateInviteCode(inviteCode).ok).toBe(false)
    }
    expect(validateRegistration({ ...valid, role: 'manager', inviteCode: 'A'.repeat(16) }).ok).toBe(false)
    expect(validateRegistration({ ...valid, role: 'admin' }).ok).toBe(false)
  })
  it('требует явного согласия только при вступлении в команду', () => {
    const code = 'AB12CD34EF56AB78'
    expect(validateRegistration(valid)).toMatchObject({ ok: true, value: { consent: false } })
    for (const consent of [undefined, false, 'true', 'on', 1]) {
      expect(validateRegistration({ ...valid, inviteCode: code, consent })).toEqual({ ok: false, errors: { consent: expect.any(String) } })
    }
    expect(validateRegistration({ ...valid, inviteCode: code, consent: true }).ok).toBe(true)
    expect(validateConsent(true)).toEqual({ ok: true, value: true })
    for (const consent of [undefined, null, false, 'true', 1]) expect(validateConsent(consent).ok).toBe(false)
  })
  it('валидирует название команды и типы данных при входе', () => {
    expect(validateTeamName('  Участок № 3  ')).toEqual({ ok: true, value: 'Участок № 3' })
    for (const value of ['', ' ', 'A', 'x'.repeat(81), 'Team\u0000', 123, null]) expect(validateTeamName(value).ok).toBe(false)
    for (const password of ['', null, 123, 'x'.repeat(129)]) expect(validateLogin({ email: valid.email, password }).ok).toBe(false)
  })
  it('принимает граничные длины без навязывания состава пароля', () => {
    for (const password of ['x'.repeat(10), 'Ж'.repeat(128)]) expect(validateRegistration({ ...valid, password }).ok).toBe(true)
    for (const name of ['李明', 'Ә'.repeat(80)]) expect(validateRegistration({ ...valid, name }).ok).toBe(true)
  })
})
