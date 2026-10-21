import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.dynamic.config'

// Production container: dynamic flow, forms and proxy checks; archived flow needs its own legacy build.
const containerConfig = { ...baseConfig }
delete containerConfig.webServer
export default defineConfig({
  ...containerConfig,
  testMatch: ['tests/e2e/dynamic.spec.ts', 'tests/e2e/registration-validation.spec.ts', 'tests/e2e/proxy-auth.spec.ts'],
  use: { ...containerConfig.use, baseURL: process.env.HTTP_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? '3000'}` },
})
