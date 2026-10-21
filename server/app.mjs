import express from 'express'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApi } from './api.ts'
import { openDatabase } from './database.ts'
import { configuredOrigin } from './request-origin.ts'

/** @param {{ distDirectory?: string, databasePath?: string, serveClient?: boolean, publicOrigin?: string }} [options] */
export function createApp({ distDirectory = fileURLToPath(new URL('../dist/', import.meta.url)),
  databasePath = process.env.DATABASE_PATH ?? fileURLToPath(new URL('../data/academy.sqlite', import.meta.url)),
  serveClient = true, publicOrigin = process.env.PUBLIC_ORIGIN } = {}) {
  const indexFile = join(distDirectory, 'index.html')
  if (serveClient && !existsSync(indexFile)) throw new Error('Production build missing: run npm run build')
  const origin = configuredOrigin(publicOrigin)
  const app = express()
  app.disable('x-powered-by')
  const database = openDatabase(databasePath)
  app.locals.closeDatabase = () => database.close()
  app.use('/api', createApi(database, origin))
  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' })
  })
  app.use('/assets', express.static(join(distDirectory, 'assets'), {
    index: false, redirect: false, immutable: true, maxAge: '1y', dotfiles: 'deny',
  }))
  app.use(express.static(distDirectory, { index: false, redirect: false, maxAge: 0, dotfiles: 'deny' }))
  app.use((req, res) => {
    const htmlNavigation = (req.method === 'GET' || req.method === 'HEAD')
      && req.get('Accept')?.includes('text/html') && req.accepts('html')
    const fileOrApi = extname(req.path) !== '' || req.path === '/assets' || req.path.startsWith('/assets/')
      || req.path === '/api' || req.path.startsWith('/api/') || req.path.split('/').some((part) => part.startsWith('.'))
    if (htmlNavigation && !fileOrApi) {
      // Путь фиксирован сервером; hidden parent (.tmp/.deploy) не запрещает сам index.html.
      res.set('Cache-Control', 'no-cache').sendFile(indexFile, { dotfiles: 'allow' })
      return
    }
    res.status(404).type('text/plain').send('Not found')
  })
  /** @type {import('express').ErrorRequestHandler} */
  const onError = (_error, _req, res, _next) => {
    return res.status(500).type('text/plain').send('Internal server error')
  }
  app.use(onError)
  return app
}
