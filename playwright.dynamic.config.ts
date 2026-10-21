import { defineConfig } from '@playwright/test'
import base from './playwright.config'

const port = process.env.E2E_PORT ?? '3101'

// Exercise the production routes independently of the archived fixed-question flow.
export default defineConfig({
  ...base,
  testMatch: ['tests/e2e/dynamic.spec.ts'],
  testIgnore: ['**/.tmp/**', '**/artifacts/**'],
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js build && node server/index.mjs',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === 'true',
    timeout: 120_000,
    env: { PORT: port, DATABASE_PATH: '.tmp/playwright-dynamic.sqlite', OPENAI_API_KEY: '' },
  },
})
