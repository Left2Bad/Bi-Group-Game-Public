// @vitest-environment node
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'

describe('регистрация и вход за прокси с внутренним Host', () => {
  const app = createApp({ serveClient: false, databasePath: ':memory:' })
  let server: Server
  let base: string
  beforeAll(async () => {
    await new Promise<void>((done) => { server = app.listen(0, '127.0.0.1', () => done()) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No TCP port')
    base = `http://127.0.0.1:${address.port}/api`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((done) => server.close(() => done()))
    app.locals.closeDatabase()
  })
  const publicOrigin = 'https://academy.example.test'
  const password = 'test-password-2026'
  const headers = { 'Content-Type': 'application/json', 'X-BI-Academy': '1', Origin: publicOrigin, 'Sec-Fetch-Site': 'same-origin' }
  const post = (path: string, body: unknown, cookie = '', extra: Record<string, string> = {}) => fetch(base + path, {
    method: 'POST', headers: { ...headers, Cookie: cookie, ...extra }, body: JSON.stringify(body),
  })

  it.each(['manager', 'employee'])('регистрирует %s, сохраняет роль и позволяет повторный вход', async (role) => {
    const email = `proxy-${role}@example.test`
    const registration = await post('/auth/register', { name: 'Тестовый Пользователь', email, password, role })
    expect(registration.status).toBe(201)
    const { user } = await registration.json()
    expect(user.role).toBe(role)
    let cookie = registration.headers.get('set-cookie')!.split(';')[0]!
    expect((await (await fetch(base + '/auth/me', { headers: { Cookie: cookie } })).json()).user).toEqual(user)
    expect((await post('/auth/logout', {}, cookie)).status).toBe(200)
    expect((await (await fetch(base + '/auth/me', { headers: { Cookie: cookie } })).json()).user).toBeNull()
    const login = await post('/auth/login', { email, password })
    expect(login.status).toBe(200)
    expect((await login.json()).user).toEqual(user)
    cookie = login.headers.get('set-cookie')!.split(';')[0]!
    expect((await post('/teams', { name: 'Команда за прокси' }, cookie)).status).toBe(role === 'manager' ? 201 : 403)
  })

  it.each(['cross-site', 'same-site', 'none', 'unexpected'])('отклоняет браузерный источник %s', async (site) => {
    const response = await post('/auth/login', { email: 'proxy-manager@example.test', password }, '', { 'Sec-Fetch-Site': site })
    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each(['null', 'broken', 'ftp://academy.example.test', publicOrigin + '/path', publicOrigin + '?query=1'])('отклоняет некорректный Origin %s даже с same-origin', async (origin) => {
    expect((await post('/auth/login', {}, '', { Origin: origin })).status).toBe(403)
  })

  it('без Fetch Metadata принимает свой Origin и отклоняет чужой, включая поддельный forwarded host', async () => {
    const body = JSON.stringify({ email: 'proxy-manager@example.test', password })
    const request = (origin: string, extra = {}) => fetch(base + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', Origin: origin, ...extra }, body,
    })
    expect((await request(new URL(base).origin)).status).toBe(200)
    expect((await request(publicOrigin)).status).toBe(403)
    expect((await request(publicOrigin, { 'X-Forwarded-Host': 'academy.example.test', 'X-Forwarded-Proto': 'https' })).status).toBe(403)
    expect((await request(new URL(base).origin.replace('http:', 'https:'))).status).toBe(403)
  })
})

describe('явный внешний адрес для прокси без Fetch Metadata', () => {
  it.each(['*', 'null', 'ftp://academy.example.test', 'https://academy.example.test/path',
    'https://user:password@academy.example.test', 'https://academy.example.test?query=1'])('отклоняет некорректный PUBLIC_ORIGIN %s при запуске', (publicOrigin) => {
    expect(() => createApp({ serveClient: false, databasePath: ':memory:', publicOrigin })).toThrow()
  })

  it('разрешает настроенный Origin и отвергает другие схемы, порты и домены', async () => {
    const app = createApp({ serveClient: false, databasePath: ':memory:', publicOrigin: 'https://academy.example.test/' })
    const server = await new Promise<Server>((done) => { const listener = app.listen(0, '127.0.0.1', () => done(listener)) })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No TCP port')
      const post = (origin: string, extra = {}) => fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', Origin: origin, ...extra },
        body: JSON.stringify({ name: 'Руководитель', email: 'configured@example.test', password: 'test-password-2026', role: 'manager' }),
      })
      expect((await post('https://academy.example.test')).status).toBe(201)
      for (const origin of ['http://academy.example.test', 'https://academy.example.test:444',
        'https://academy.example.test.evil.test', 'https://other.example.test']) {
        expect((await post(origin)).status).toBe(403)
        expect((await post(origin, { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(403)
      }
      expect((await post('https://academy.example.test', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
      expect((await post('https://academy.example.test', { 'X-BI-Academy': '' })).status).toBe(403)
    } finally {
      await new Promise<void>((done) => server.close(() => done()))
      app.locals.closeDatabase()
    }
  })
})
