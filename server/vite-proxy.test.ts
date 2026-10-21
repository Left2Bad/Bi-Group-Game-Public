// @vitest-environment node
import type { Server } from 'node:http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import config from '../vite.config'
import { createApp } from './app.mjs'

let backend: Server
let vite: ViteDevServer
let origin: string
const app = createApp({ serveClient: false, databasePath: ':memory:' })

beforeAll(async () => {
  backend = await new Promise<Server>((done) => { const listener = app.listen(0, '127.0.0.1', () => done(listener)) })
  const address = backend.address()
  if (!address || typeof address === 'string') throw new Error('No API port')
  const proxyOptions = config.server!.proxy!['/api']
  vite = await createServer({
    configFile: false, logLevel: 'silent',
    server: {
      host: '127.0.0.1', port: 0, watch: null,
      proxy: { '/api': { ...(typeof proxyOptions === 'string' ? { target: proxyOptions } : proxyOptions), target: `http://127.0.0.1:${address.port}` } },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  await vite.listen()
  const viteAddress = vite.httpServer!.address()
  if (!viteAddress || typeof viteAddress === 'string') throw new Error('No Vite port')
  origin = `http://127.0.0.1:${viteAddress.port}`
})

afterAll(async () => {
  if (vite) await vite.close()
  if (backend) await new Promise<void>((done) => backend.close(() => done()))
  app.locals.closeDatabase()
})

it('сохраняет Host через реальный Vite proxy: регистрация и вход работают без Fetch Metadata', async () => {
  const headers = { 'Content-Type': 'application/json', 'X-BI-Academy': '1', Origin: origin }
  const credentials = { email: 'vite-manager@example.test', password: 'test-password-2026' }
  const registration = await fetch(origin + '/api/auth/register', {
    method: 'POST', headers, body: JSON.stringify({ ...credentials, name: 'Руководитель Vite', role: 'manager' }),
  })
  expect(registration.status).toBe(201)
  expect((await registration.json()).user.role).toBe('manager')
  const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify(credentials) })
  expect(login.status).toBe(200)
  expect((await login.json()).user.role).toBe('manager')
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  const teams = await fetch(origin + '/api/teams', { headers: { Cookie: cookie } })
  expect(teams.status).toBe(200)
  expect(await teams.json()).toEqual({ teams: [] })
  const foreign = await fetch(origin + '/api/auth/login', {
    method: 'POST', headers: { ...headers, Origin: 'https://evil.example.test' }, body: JSON.stringify(credentials),
  })
  expect(foreign.status).toBe(403)
})
