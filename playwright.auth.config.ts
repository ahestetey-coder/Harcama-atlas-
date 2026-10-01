import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Hesapla giriş ekranı testleri: uygulama sahte bir Supabase adresiyle ayrı derlenir,
// Supabase istekleri testte taklit edilir (gerçek sunucuya istek gitmez).
const PORT = 4175
export const FAKE_SUPABASE = 'https://test-proje.supabase.co'

export default defineConfig({
  ...base,
  testDir: 'e2e-auth',
  use: { ...base.use, baseURL: `http://localhost:${PORT}/` },
  projects: [{ name: 'giris', use: { viewport: { width: 1366, height: 900 } } }],
  webServer: {
    command: `npx vite build --outDir dist-auth && npx vite preview --outDir dist-auth --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { VITE_SUPABASE_URL: FAKE_SUPABASE, VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_anahtari_0000000000' },
  },
})
