// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { clearAccountData, syncAccountReset } from './personal'

afterEach(() => localStorage.clear())

it('очищает только данные сброшенного аккаунта, включая неотправленные ответы', () => {
  localStorage.setItem('bi-academy:user:one:bi-academy:attempts', 'old result')
  localStorage.setItem('bi-academy:user:one:bi-academy:uploaded:old', '1')
  localStorage.setItem('bi-academy:dynamic-text:one:attempt:question', 'old answer')
  localStorage.setItem('bi-academy:user:other:bi-academy:attempts', 'other result')
  localStorage.setItem('bi-academy:theme', 'dark')
  expect(clearAccountData('one')).toBe(true)
  expect(localStorage.getItem('bi-academy:user:one:bi-academy:attempts')).toBeNull()
  expect(localStorage.getItem('bi-academy:user:one:bi-academy:uploaded:old')).toBeNull()
  expect(localStorage.getItem('bi-academy:dynamic-text:one:attempt:question')).toBeNull()
  expect(localStorage.getItem('bi-academy:user:other:bi-academy:attempts')).toBe('other result')
  expect(localStorage.getItem('bi-academy:theme')).toBe('dark')
})

it('удаляет старые черновики при первом входе после сброса на другом устройстве', () => {
  const key = 'bi-academy:user:one:bi-academy:attempts'
  localStorage.setItem(key, 'old result')
  expect(syncAccountReset('one', 123)).toBe(true)
  expect(localStorage.getItem(key)).toBeNull()
  localStorage.setItem(key, 'new result')
  expect(syncAccountReset('one', 123)).toBe(true)
  expect(localStorage.getItem(key)).toBe('new result')
  expect(syncAccountReset('one', 124)).toBe(true)
  expect(localStorage.getItem(key)).toBeNull()
})
