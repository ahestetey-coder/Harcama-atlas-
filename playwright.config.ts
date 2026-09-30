import { defineConfig, devices } from '@playwright/test'

// Konteynerde önceden kurulu Chromium kullanılır; başka ortamda PW_CHROMIUM boş bırakılabilir.
const executablePath = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORT = 4174

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    launchOptions: { executablePath: executablePath || undefined },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'masaustu', use: { viewport: { width: 1366, height: 900 } }, testIgnore: /mobil\.spec/ },
    { name: 'mobil', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } }, testMatch: /mobil\.spec/ },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
  },
})
