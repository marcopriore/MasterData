import { defineConfig } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })

export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  testDir: './suites',
  fullyParallel: false,
  retries: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.TEST_APP_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'auth', testMatch: 'auth.spec.ts' },
    { name: 'pdm', testMatch: 'pdm.spec.ts', dependencies: ['auth'] },
    { name: 'request', testMatch: 'request.spec.ts', dependencies: ['pdm'] },
    { name: 'governance', testMatch: 'governance.spec.ts', dependencies: ['request'] },
    { name: 'database', testMatch: 'database.spec.ts', dependencies: ['governance'] },
    { name: 'value-dictionary', testMatch: 'value-dictionary.spec.ts', dependencies: ['pdm'] },
  ],
  reporter: [['html', { outputFolder: 'e2e/report' }]],
})
