import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import { test, expect } from '@playwright/test'

let proxy: Server
let proxyOrigin: string
let forwardedWrites = 0

test.beforeAll(async ({ browserName }, info) => {
  const backend = new URL(String(info.project.use.baseURL))
  proxy = createServer((incoming, outgoing) => {
    // Как у reverse proxy: Origin остаётся внешним, Host заменяется внутренним.
    const target = request(new URL(incoming.url!, backend), {
      method: incoming.method, headers: { ...incoming.headers, host: backend.host },
    }, (response) => {
      outgoing.writeHead(response.statusCode!, response.headers)
      response.pipe(outgoing)
    })
    if (incoming.method === 'POST' && incoming.headers.origin === proxyOrigin) forwardedWrites++
    target.on('error', () => { outgoing.writeHead(502); outgoing.end() })
    incoming.pipe(target)
  })
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done))
  const address = proxy.address()
  if (!address || typeof address === 'string') throw new Error(`No proxy port for ${browserName}`)
  proxyOrigin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  if (proxy) {
    proxy.closeAllConnections()
    await new Promise<void>((done) => proxy.close(() => done()))
  }
})

test('выбор руководителя, регистрация, команда и повторный вход через reverse proxy', async ({ page }) => {
  const email = `proxy-ui-${crypto.randomUUID()}@example.test`
  const before = forwardedWrites
  await page.goto(proxyOrigin + '/register')
  await page.getByRole('radio', { name: /Руководитель/ }).check()
  await expect(page.getByLabel('Код команды (необязательно)')).toHaveCount(0)
  await page.getByLabel('Имя и фамилия').fill('Руководитель за Прокси')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-2026')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await expect(page).toHaveURL(proxyOrigin + '/team')
  await page.getByLabel('Название команды').fill('Команда за прокси')
  await page.getByRole('button', { name: 'Создать команду', exact: true }).click()
  await expect(page.getByLabel('Код приглашения')).toBeVisible()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await page.goto(proxyOrigin + '/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-2026')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(proxyOrigin + '/team')
  await expect(page.getByRole('heading', { name: 'Команда за прокси', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Мои команды', exact: true })).toBeVisible()
  expect(forwardedWrites - before).toBe(4)
})
