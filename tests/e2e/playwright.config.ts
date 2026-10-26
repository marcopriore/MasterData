import { defineConfig } from '@playwright/test'
import { APP_URL } from './helpers/env'

/**
 * E2E do PRO-MAT contra o app real (build de produção em :3100) e o banco do web/.env.local.
 * Cada rodada cria um tenant temporário e apaga no fim (global-setup / global-teardown).
 */
export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  testDir: './suites',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: APP_URL,
    headless: true,
    locale: 'pt-BR',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
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
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    { name: 'auth', testMatch: 'auth.spec.ts', dependencies: ['setup'] },
    { name: 'pdm', testMatch: 'pdm.spec.ts', dependencies: ['setup'] },
    { name: 'request', testMatch: 'request.spec.ts', dependencies: ['setup'] },
    { name: 'governance', testMatch: 'governance.spec.ts', dependencies: ['request'] },
    { name: 'database', testMatch: 'database.spec.ts', dependencies: ['governance'] },
    { name: 'value-dictionary', testMatch: 'value-dictionary.spec.ts', dependencies: ['setup'] },
    { name: 'roles', testMatch: 'roles.spec.ts', dependencies: ['setup'] },
    { name: 'users', testMatch: 'users.spec.ts', dependencies: ['auth', 'governance'] },
  ],
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
})
