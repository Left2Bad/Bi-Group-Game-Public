import { test as base, expect } from '@playwright/test'
import { STORAGE_KEYS as baseKeys } from '../../src/storage/shared'

/** Существующие сценарии личного теста теперь выполняются в аккаунте сотрудника. */
export let STORAGE_KEYS: Record<keyof typeof baseKeys, string> = { ...baseKeys }
export const test = base.extend<{ account: { id: string } }>({
  account: [async ({ context }, use) => {
    const response = await context.request.post('/api/auth/register', { headers: { 'X-BI-Academy': '1' }, data: {
      name: 'Тестовый сотрудник', email: `employee-${crypto.randomUUID()}@example.test`, password: 'test-password-2026', role: 'employee',
    } })
    expect(response.status()).toBe(201)
    const { user } = await response.json() as { user: { id: string } }
    STORAGE_KEYS = Object.fromEntries(Object.entries(baseKeys).map(([name, key]) => [name, `bi-academy:user:${user.id}:${key}`])) as typeof STORAGE_KEYS
    await use(user)
  }, { auto: true }],
})
export { expect }
