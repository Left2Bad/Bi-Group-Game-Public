// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.mjs'

describe('production HTTP contract (часть M13, без контейнера)', () => {
  let directory: string
  let temporaryRoot: string
  let server: Server
  let baseUrl: string
  beforeAll(async () => {
    const temporaryParent = resolve('.tmp')
    await mkdir(temporaryParent, { recursive: true })
    temporaryRoot = await mkdtemp(join(temporaryParent, 'bi-academy-http-'))
    directory = join(temporaryRoot, '.build')
    await mkdir(directory)
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'index.html'), '<!doctype html><h1>BI Academy test build</h1>')
    await writeFile(join(directory, 'assets', 'app-test.js'), 'console.log("fixture")')
    await writeFile(join(directory, 'assets', 'app-test.css'), 'body { color: navy; }')
    await new Promise<void>((resolve) => {
      const app = createApp({ distDirectory: directory, databasePath: ':memory:' })
      server = app.listen(0, '127.0.0.1', () => resolve())
      server.once('close', () => app.locals.closeDatabase())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server did not bind TCP')
    baseUrl = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
  })

  it('не стартует без production-сборки', () => {
    expect(() => createApp({ distDirectory: join(directory, 'missing') })).toThrow('Production build missing')
  })
  it('отвечает health JSON и не раскрывает Express', async () => {
    const response = await fetch(`${baseUrl}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(response.headers.get('x-powered-by')).toBeNull()
  })
  it.each(['/', '/intro', '/assessment', '/results', '/development', '/print'])('раздаёт HTML для прямой навигации %s', async (path) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'text/html' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('BI Academy test build')
  })
  it.each([['js', 'javascript'], ['css', 'text/css']])('раздаёт %s с правильным MIME', async (extension, mime) => {
    const response = await fetch(`${baseUrl}/assets/app-test.${extension}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain(mime)
    expect(response.headers.get('cache-control')).toContain('immutable')
  })
  it.each(['/assets/missing.js', '/assets/missing', '/missing.css', '/api/unknown', '/.env'])('не подменяет отсутствующий ресурс HTML: %s', async (path) => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'text/html' } })
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('BI Academy test build')
  })
  it('не включает SPA fallback для обычного fetch или POST', async () => {
    expect((await fetch(`${baseUrl}/results`)).status).toBe(404)
    expect((await fetch(`${baseUrl}/results`, { method: 'POST', headers: { Accept: 'text/html' } })).status).toBe(404)
  })
})
