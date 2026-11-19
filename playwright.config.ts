import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo sobre el modo demo (sin Supabase).
 * En CI se prueba la compilacion de produccion; en local, el servidor de desarrollo.
 * CHROME_PATH permite usar un Chrome ya instalado en lugar del que descarga Playwright.
 */
const PUERTO = 3100;
const enCI = !!process.env.CI;
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: enCI ? 1 : 0,
  reporter: enCI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions }, testIgnore: /celular\.spec\.ts/ },
    { name: 'celular', use: { ...devices['Pixel 7'], launchOptions }, testMatch: /celular\.spec\.ts/ },
  ],
  webServer: {
    command: enCI ? `npm run start -- -p ${PUERTO}` : `npx next dev -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !enCI,
    timeout: 180_000,
    env: { NEXT_PUBLIC_DEMO: '1', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
