import { defineConfig, devices } from '@playwright/test'

const PORT = 4330

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  use: { baseURL: `http://localhost:${PORT}`, launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} },
  projects: [
    { name: 'masaustu', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobil', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: { command: `python3 -m http.server ${PORT} -d dist`, url: `http://localhost:${PORT}/`, reuseExistingServer: true },
})
