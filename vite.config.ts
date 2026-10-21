import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/app/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    restoreMocks: true,
    maxWorkers: 2,
  },
})
