import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://harcama-atlas.pages.dev',
  i18n: { defaultLocale: 'tr', locales: ['tr', 'en'], routing: { prefixDefaultLocale: false } },
  // Stil dosyaları sayfaya gömülür: ilk boyamayı bekleten ek istek olmaz
  build: { inlineStylesheets: 'always' },
  vite: { plugins: [tailwindcss()] },
})
