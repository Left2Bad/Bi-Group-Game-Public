import { defineConfig, devices } from '@playwright/test'
const port = process.env.E2E_PORT ?? '3000'

export default defineConfig({
  testDir: '.',
  testMatch: ['src/app/**/*.smoke.spec.ts', 'tests/e2e/**/*.spec.ts'],
  testIgnore: ['**/.tmp/**', '**/artifacts/**', '**/tests/e2e/dynamic.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: 'list',
  // Тесты написаны по русским подписям: язык браузера ru-RU оставляет интерфейс на русском (en-US включил бы английский).
  use: { baseURL: `http://127.0.0.1:${port}`, locale: 'ru-RU', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js build --mode playwright-legacy && node server/index.mjs',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: port, DATABASE_PATH: '.tmp/playwright.sqlite' },
  },
})
