// Пересобирает server/test-accounts.json из примера (src/dynamic/test-accounts.ts). Запуск: npm run test-accounts:build
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { buildTestAccounts } = await vite.ssrLoadModule('/src/dynamic/test-accounts.ts')
  const fixture = buildTestAccounts()
  writeFileSync(new URL('../server/test-accounts.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n', 'utf8')
  console.info(`server/test-accounts.json: руководитель и ${fixture.employees.length} сотрудников`)
} finally { await vite.close() }
