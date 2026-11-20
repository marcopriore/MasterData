import { defineConfig } from '@playwright/test'
import { APP_URL } from '../e2e/helpers/env'

/**
 * Medição de desempenho das telas contra o build de produção (:3100) e o banco do web/.env.local.
 * Só lê: entra com o Master (MASTER_EMAIL / MASTER_PASSWORD em tests/.env.test) e abre as telas.
 * Uso: npx playwright test --config=perf/playwright.config.ts  (PERF_LABEL=antes|depois)
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'measure.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30 * 60_000,
  use: {
    baseURL: APP_URL,
    headless: true,
    locale: 'pt-BR',
  },
  webServer: process.env.TEST_APP_URL
    ? undefined
    : {
        command: 'npm run build && npx next start -p 3100',
        cwd: '../../web',
        url: APP_URL,
        reuseExistingServer: true,
        timeout: 300_000,
      },
  reporter: [['list']],
})
